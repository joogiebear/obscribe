#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
BACKUP_ROOT="${OBSCRIBE_BACKUP_DIR:-${ROOT_DIR}/backups}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"

cd "${ROOT_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing .env. Run scripts/deploy.sh first."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_ROOT}" "${BACKUP_DIR}"

DB_USER="$(grep '^DB_USERNAME=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2-)"
DB_NAME="$(grep '^DB_DATABASE=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2-)"

echo "Creating database backup..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T db pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists > "${BACKUP_DIR}/postgres.sql"

echo "Saving environment backup..."
cp "${ENV_FILE}" "${BACKUP_DIR}/env.backup"
chmod 600 "${BACKUP_DIR}/env.backup"

echo "Saving volume inventory..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps > "${BACKUP_DIR}/containers.txt"
docker volume ls > "${BACKUP_DIR}/volumes.txt"

tar -czf "${BACKUP_ROOT}/obscribe-backup-${STAMP}.tar.gz" -C "${BACKUP_ROOT}" "${STAMP}"
chmod 600 "${BACKUP_ROOT}/obscribe-backup-${STAMP}.tar.gz"

echo "Backup created:"
echo "${BACKUP_ROOT}/obscribe-backup-${STAMP}.tar.gz"
