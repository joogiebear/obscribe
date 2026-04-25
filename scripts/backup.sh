#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
BACKUP_ROOT="${OBSCRIBE_BACKUP_DIR:-${ROOT_DIR}/backups}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "${ROOT_DIR}" | tr '[:upper:]' '[:lower:]')}"

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
test -s "${BACKUP_DIR}/postgres.sql"

backup_volume() {
  local volume="$1"
  local output="$2"

  if docker volume inspect "${volume}" >/dev/null 2>&1; then
    echo "Backing up volume ${volume}..."
    docker run --rm -v "${volume}:/volume:ro" -v "${BACKUP_DIR}:/backup" busybox sh -c "cd /volume && tar -cf /backup/${output} ."
  else
    echo "Volume ${volume} not found; skipping."
  fi
}

backup_volume "${PROJECT_NAME}_obscribe_minio" "minio.tar"
backup_volume "${PROJECT_NAME}_caddy_data" "caddy-data.tar"
backup_volume "${PROJECT_NAME}_caddy_config" "caddy-config.tar"

echo "Saving environment backup..."
cp "${ENV_FILE}" "${BACKUP_DIR}/env.backup"
chmod 600 "${BACKUP_DIR}/env.backup"

echo "Saving volume inventory..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps > "${BACKUP_DIR}/containers.txt"
docker volume ls > "${BACKUP_DIR}/volumes.txt"
git rev-parse HEAD > "${BACKUP_DIR}/git-sha.txt" 2>/dev/null || true
sha256sum "${COMPOSE_FILE}" > "${BACKUP_DIR}/compose.sha256" 2>/dev/null || true

cat > "${BACKUP_DIR}/manifest.json" <<JSON
{
  "backup_version": 1,
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "project": "${PROJECT_NAME}",
  "app_url": "$(grep '^APP_URL=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2-)",
  "artifacts": [
    "postgres.sql",
    "env.backup",
    "containers.txt",
    "volumes.txt",
    "git-sha.txt",
    "compose.sha256"
  ]
}
JSON

tar -czf "${BACKUP_ROOT}/obscribe-backup-${STAMP}.tar.gz" -C "${BACKUP_ROOT}" "${STAMP}"
chmod 600 "${BACKUP_ROOT}/obscribe-backup-${STAMP}.tar.gz"

echo "Backup created:"
echo "${BACKUP_ROOT}/obscribe-backup-${STAMP}.tar.gz"
