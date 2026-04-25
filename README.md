# Obscribe

Self-hostable notebook workspace with a hosted SaaS path.

## What Runs Today

- `apps/web`: Next.js notes workspace
- `apps/api`: lightweight PHP API for auth, workspaces, notebooks, and notes
- `docker-compose.yml`: local development
- `docker-compose.prod.yml`: single-server self-host install
- `scripts/deploy.sh`: repeatable Bash deploy for one server
- `docs/self-host-operations.md`: backup, restore, release, and rollback runbook

The API intentionally matches the current product contract while the larger Laravel backend is still being built out.

## Local Development

```bash
docker compose up -d
```

Open `http://localhost:3000`.

## Single-Server Self-Host Install

On a fresh Ubuntu or Debian server:

```bash
curl -fsSL https://raw.githubusercontent.com/joogiebear/obscribe/main/scripts/deploy.sh | bash
```

The installer installs Git, Docker Engine, and Docker Compose v2 when needed. It then clones Obscribe into `/opt/obscribe`, creates `.env` from `.env.example`, generates database and object-storage secrets, builds the containers, and starts the stack.

For an interactive first install, run:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/joogiebear/obscribe/main/scripts/deploy.sh)"
```

The installer will ask for:

- public domain, for example `notes.example.com`
- SSL certificate notice email, for example `admin@example.com`
- admin email address, for example `owner@example.com`

For a non-interactive install:

```bash
OBSCRIBE_DOMAIN=notes.example.com \
OBSCRIBE_ACME_EMAIL=admin@example.com \
OBSCRIBE_ADMIN_EMAILS=owner@example.com \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/joogiebear/obscribe/main/scripts/deploy.sh)"
```

To update domain settings after an earlier install:

```bash
OBSCRIBE_DOMAIN=notes.example.com OBSCRIBE_ACME_EMAIL=admin@example.com \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/joogiebear/obscribe/main/scripts/deploy.sh)"
```

The SSL email is only used by Caddy/Let's Encrypt for certificate notices. App email is separate and currently defaults to log-only delivery with `MAIL_FROM_ADDRESS=no-reply@your-domain`.

The admin email controls owner-only settings inside the app, including email delivery tests and self-host health checks. Register with an email listed in `ADMIN_EMAILS` to unlock those controls. Multiple owner emails can be comma-separated.

To configure SMTP during an existing install:

```bash
OBSCRIBE_CONFIGURE_SMTP=1 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/joogiebear/obscribe/main/scripts/deploy.sh)"
```

Or run it non-interactively:

```bash
OBSCRIBE_SMTP_HOST=smtp.example.com \
OBSCRIBE_SMTP_PORT=587 \
OBSCRIBE_SMTP_USERNAME=postmaster@example.com \
OBSCRIBE_SMTP_PASSWORD='your-password' \
OBSCRIBE_SMTP_ENCRYPTION=tls \
OBSCRIBE_MAIL_FROM=no-reply@example.com \
OBSCRIBE_MAIL_FROM_NAME=Obscribe \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/joogiebear/obscribe/main/scripts/deploy.sh)"
```

When SMTP is enabled, new registrations send a welcome email and password recovery uses the same delivery settings. Future invitation flows will use them too.

Before public launch, confirm `/opt/obscribe/.env`:

```env
APP_DOMAIN=notes.example.com
ACME_EMAIL=admin@example.com
ADMIN_EMAILS=owner@example.com
APP_URL=https://notes.example.com
NEXT_PUBLIC_APP_URL=https://notes.example.com
NEXT_PUBLIC_API_BASE_URL=/api
MAIL_MAILER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=postmaster@example.com
MAIL_PASSWORD=your-password
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=no-reply@example.com
MAIL_FROM_NAME=Obscribe
```

Then rerun:

```bash
curl -fsSL https://raw.githubusercontent.com/joogiebear/obscribe/main/scripts/deploy.sh | bash
```

Optional installer settings:

```bash
OBSCRIBE_HOME=/srv/obscribe \
OBSCRIBE_REPO_REF=main \
OBSCRIBE_ADMIN_EMAILS=owner@example.com \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/joogiebear/obscribe/main/scripts/deploy.sh)"
```

SSL requirements:

- DNS `A` record points the app domain to the server
- ports `80` and `443` are open
- no other reverse proxy is already bound to those ports

## Production Services

- Caddy reverse proxy with automatic TLS
- Next.js web app
- PHP API
- PostgreSQL
- Redis
- MinIO-compatible object storage placeholder

## Operations

From `/opt/obscribe` on the server:

```bash
bash scripts/status.sh
bash scripts/backup.sh
bash scripts/release.sh
bash scripts/rollback.sh
bash scripts/restore.sh /opt/obscribe/backups/obscribe-backup-YYYYmmddHHMMSS.tar.gz
bash scripts/logs.sh
```

Use `scripts/release.sh` for normal updates because it creates a pre-release backup, records the previous commit, rebuilds the stack, and checks API health. Use `scripts/rollback.sh` when a release is bad but the data is still good. Use `scripts/restore.sh` when the database or stored files need to return to an earlier backup.

Backups include a PostgreSQL dump, object-storage volume data when present, Redis persistence when present, Caddy certificate/config volumes, a copy of `.env`, and a small service inventory. The restore command asks for explicit confirmation before replacing the database. Support bundles redact secrets before saving environment details.

See the full self-host runbook in [docs/self-host-operations.md](docs/self-host-operations.md).

## SaaS Direction

Keep the single-server install as the baseline until backups, upgrades, health checks, auth, billing, and tenant scoping are proven. The later hosted service can split this same topology into load-balanced web/API workers, managed PostgreSQL, managed Redis, and external object storage without changing the product contract.
