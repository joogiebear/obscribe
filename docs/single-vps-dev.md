# Single VPS Development / Staging Deployment

Before moving Obscribe to a multi-server SaaS setup, the first hosted test environment should run on one VPS or dedicated server.

This keeps deployment simple while validating the full stack:

- Next.js frontend
- Laravel API
- PostgreSQL
- Redis
- MinIO / S3-compatible storage
- Laravel queue worker
- Laravel scheduler
- reverse proxy / SSL
- Stripe test mode
- OAuth provider callbacks

## Recommended Starter VPS

Minimum:

```txt
4 vCPU
8GB RAM
100GB NVMe
1Gbps port
Ubuntu 24.04 LTS
```

Preferred:

```txt
8 vCPU
16GB RAM
250GB+ NVMe
1Gbps port
Ubuntu 24.04 LTS
```

## Single Server Layout

```txt
VPS
├── Caddy or Nginx
├── obscribe-web
├── obscribe-api
├── obscribe-worker
├── obscribe-scheduler
├── postgres
├── redis
└── minio
```

## Deployment Flow

```txt
GitHub push
↓
Build Docker images
↓
SSH / Ansible deploy
↓
Pull latest images
↓
Run migrations
↓
Restart containers
↓
Health check
```

The current repo includes the first deploy implementation:

```bash
./scripts/deploy.sh
```

It uses `docker-compose.prod.yml` to run Caddy, web, API, PostgreSQL, Redis, and MinIO on one machine.

## Domain Setup

Recommended dev/staging domains:

```txt
staging.obscribe.com
api.staging.obscribe.com
storage.staging.obscribe.com
```

For early testing, a single domain can also work:

```txt
staging.obscribe.com
```

With reverse proxy routes:

```txt
/       -> Next.js
/api    -> Laravel
/storage -> MinIO or signed file URLs
```

## Environment Mode

Use:

```env
APP_ENV=staging
OBSCRIBE_EDITION=cloud
STRIPE_TEST_MODE=true
```

Self-host testing can use:

```env
OBSCRIBE_EDITION=selfhosted
```

## What This Test Proves

The single VPS environment should confirm:

- app boots correctly
- user registration works
- login works
- OAuth callback works
- Stripe test checkout works
- notebooks can be created
- tenant scoping works
- file uploads work
- queued jobs run
- scheduled jobs run
- backups can be created and restored

## When to Move to Multi-Server

Move to multi-server only after:

- the core app is functional
- backups are proven
- deploys are repeatable
- health checks work
- logs are centralized enough to debug issues
- at least early users are expected

## Future Multi-Server Split

```txt
Load balancer
App server A
App server B
PostgreSQL server
Redis server
Object storage / backup server
```

The application should remain stateless so this split does not require major code changes.
