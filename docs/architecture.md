# Obscribe Architecture

## Stack
- Next.js (frontend)
- Laravel 13 (API)
- PostgreSQL
- Redis
- S3/MinIO

## Auth
- Laravel Sanctum
- OAuth providers (Google, GitHub, Microsoft)

## Billing
- Stripe
- Plans enforced via API

## Deployment
- Docker Compose (self-host)
- Multi-server + load balancer (SaaS)

## Scaling
- Stateless app servers
- Shared DB, Redis, Storage
