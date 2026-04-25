# Obscribe Architecture

## Stack
- Next.js (frontend)
- Lightweight PHP API for the first self-host release
- Laravel 13 target for the full API
- PostgreSQL
- Redis
- S3/MinIO

## Auth
- First self-host release: bearer tokens stored as SHA-256 hashes
- Laravel target: Sanctum plus OAuth providers (Google, GitHub, Microsoft)

## Billing
- Stripe
- Plans enforced via API

## Deployment
- Docker Compose (self-host)
- Multi-server + load balancer (SaaS)

## Scaling
- Stateless app servers
- Shared DB, Redis, Storage
