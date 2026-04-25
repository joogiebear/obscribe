# Self-Host Operations Runbook

This runbook is for a single-server Obscribe install created by `scripts/deploy.sh`.
Run commands from the Obscribe install directory, usually `/opt/obscribe`.

## Daily Check

```bash
cd /opt/obscribe
bash scripts/status.sh
```

Healthy output should show the app URL, running containers, and a passing API health check.
If the public HTTP check fails, confirm DNS points to the server and ports `80` and `443` are open.

## Support Bundle

When asking for help, collect a support bundle:

```bash
cd /opt/obscribe
bash scripts/logs.sh
```

The bundle is saved under `support/` and redacts common secret values from `.env`.
It still may contain app URLs, container names, and recent logs, so treat it as private.

## Backups

Create a backup before every release and on a regular schedule:

```bash
cd /opt/obscribe
bash scripts/backup.sh
```

Backups are saved under `backups/` by default. To place them elsewhere:

```bash
OBSCRIBE_BACKUP_DIR=/mnt/obscribe-backups bash scripts/backup.sh
```

Each backup includes:

- PostgreSQL dump
- MinIO object storage volume, when present
- Redis persistence volume, when present
- Caddy certificate and config volumes, when present
- `.env` copy as `env.backup`
- container, volume, Git SHA, and Compose checksums for troubleshooting

Keep at least one recent backup off the server. A backup stored only on the same disk will not help after disk loss.

Recommended minimum schedule:

- before every release
- daily for active servers
- weekly for low-use personal servers
- after major configuration changes such as domain or SMTP updates

## Restore

Use restore when data has been deleted, the database is damaged, or a release needs both code and data returned to an earlier point.

```bash
cd /opt/obscribe
bash scripts/restore.sh /opt/obscribe/backups/obscribe-backup-YYYYmmddHHMMSS.tar.gz
```

The restore script:

- verifies the archive can be read safely
- keeps the current `.env` file in place
- stops services that can write data
- restores PostgreSQL from the dump
- restores MinIO, Redis, and Caddy volumes if they were in the backup
- restarts the stack and checks API health

For unattended recovery, provide the confirmation explicitly:

```bash
OBSCRIBE_CONFIRM_RESTORE=RESTORE \
  bash scripts/restore.sh /opt/obscribe/backups/obscribe-backup-YYYYmmddHHMMSS.tar.gz
```

After restoring, run:

```bash
bash scripts/status.sh
```

If the app still does not answer publicly, check DNS, firewall rules, and Caddy logs in the support bundle.

## Release

Use the release script for normal updates. It creates a backup first, records the previous commit, checks out the requested ref, rebuilds containers, starts the stack, and waits for API health.

```bash
cd /opt/obscribe
bash scripts/release.sh
```

By default, this releases `main`. To release a tag or branch:

```bash
bash scripts/release.sh v2026.04.25
bash scripts/release.sh main
```

Release records are saved under `releases/` and copied to `releases/latest.env` after a successful release.
They do not contain secrets.

The script refuses to continue if tracked files have local edits. That protects local server changes from being overwritten during checkout.
Only bypass it after reviewing the changes:

```bash
OBSCRIBE_ALLOW_DIRTY=1 bash scripts/release.sh
```

Do not skip the pre-release backup unless you already have a verified external backup:

```bash
OBSCRIBE_SKIP_BACKUP=1 bash scripts/release.sh
```

## Rollback

Use rollback when a release starts but the app is unhealthy, or when the new version has a bug and the data itself is still good.

```bash
cd /opt/obscribe
bash scripts/rollback.sh
```

Rollback uses `releases/latest.env` by default. To roll back a specific release record:

```bash
bash scripts/rollback.sh releases/release-YYYYmmddHHMMSS.env
```

The rollback script:

- shows the previous commit and matching pre-release backup
- asks for `ROLLBACK`
- creates a fresh backup before changing code
- checks out the previous commit
- rebuilds and restarts the stack
- waits for API health

For unattended rollback:

```bash
OBSCRIBE_CONFIRM_ROLLBACK=ROLLBACK bash scripts/rollback.sh
```

Rollback changes code only. It does not restore the database automatically.
If the release changed or damaged data, restore the pre-release backup shown by the rollback script:

```bash
OBSCRIBE_CONFIRM_RESTORE=RESTORE \
  bash scripts/restore.sh /opt/obscribe/backups/obscribe-backup-YYYYmmddHHMMSS.tar.gz
```

## Choose The Right Recovery

| Situation | Use |
| --- | --- |
| App update fails health check | `scripts/rollback.sh` |
| New version has a bug but data is fine | `scripts/rollback.sh` |
| User data was deleted or corrupted | `scripts/restore.sh` |
| Server disk failed | reinstall, copy backup back, then `scripts/restore.sh` |
| Domain or SMTP was misconfigured | rerun `scripts/deploy.sh` with corrected environment values |

## Server Assumptions

The current self-host scripts assume:

- Ubuntu or Debian for automatic dependency installation
- Docker Engine with Docker Compose v2
- one Obscribe stack per install directory
- Caddy owns ports `80` and `443`
- `.env` is the source of truth for domain, database, mail, and storage settings
- backups are private because they include database contents and an `env.backup` copy
