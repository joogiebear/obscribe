# Launch Readiness

This is the working checklist before opening hosted Obscribe access beyond a small group.

## Access

- Keep self-hosted installs on `REGISTRATION_MODE=open` unless the operator wants a private server.
- Keep hosted Obscribe on `REGISTRATION_MODE=invite` during early access.
- Use `EMAIL_VERIFICATION_REQUIRED=true` for hosted Obscribe.
- Keep `ADMIN_EMAILS` limited to owner/operator accounts.

## Admin Console

Admins can:

- view users and account status
- disable users
- resend verification emails
- send password reset emails
- create and disable invite codes
- inspect domain, SSL, SMTP, app version, and backup status
- download the latest backup when one exists
- review basic activation events from the last 30 days

## Plan Draft

- Hosted Trial: free early access trial for feedback and onboarding.
- Personal: one private workspace for individual notes.
- Team: shared workspaces and admin controls once collaboration is ready.
- Self-Host Support: paid install, upgrade, and recovery support for operators.

## Open Access Gate

Before switching hosted registration from `invite` to `open`:

- SMTP test passes from admin settings.
- Password reset flow works from the login page.
- Email verification flow works for a new account.
- Latest backup is visible in admin health after running `bash scripts/backup.sh`.
- Restore process has been tested from `docs/self-host-operations.md`.
- Privacy, terms, support, and contact pages have been reviewed.
- Rate limits are active for login, register, password recovery, email verification, and SMTP test.
