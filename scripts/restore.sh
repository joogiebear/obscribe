#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
BACKUP_ARCHIVE="${1:-}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "${ROOT_DIR}" | tr '[:upper:]' '[:lower:]')}"

cd "${ROOT_DIR}"

if [ -z "${BACKUP_ARCHIVE}" ]; then
  echo "Usage: scripts/restore.sh /path/to/obscribe-backup-YYYYmmddHHMMSS.tar.gz"
  exit 1
fi

if [ ! -f "${BACKUP_ARCHIVE}" ]; then
  echo "Backup archive not found: ${BACKUP_ARCHIVE}"
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing .env. Run scripts/deploy.sh first, then restore."
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

tar -xzf "${BACKUP_ARCHIVE}" -C "${TMP_DIR}"
EXTRACTED_DIR="$(find "${TMP_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

if [ ! -f "${EXTRACTED_DIR}/postgres.sql" ]; then
  echo "Backup archive does not contain postgres.sql."
  exit 1
fi

DB_USER="$(grep '^DB_USERNAME=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2-)"
DB_NAME="$(grep '^DB_DATABASE=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2-)"

echo "This will replace the current Obscribe database."
read -r -p "Type RESTORE to continue: " CONFIRM
if [ "${CONFIRM}" != "RESTORE" ]; then
  echo "Restore cancelled."
  exit 1
fi

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d db
echo "Restoring database..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T db psql -U "${DB_USER}" -d "${DB_NAME}" < "${EXTRACTED_DIR}/postgres.sql"

restore_volume() {
  local archive="$1"
  local volume="$2"

  if [ -f "${EXTRACTED_DIR}/${archive}" ]; then
    echo "Restoring volume ${volume}..."
    docker volume create "${volume}" >/dev/null
    docker run --rm -v "${volume}:/volume" -v "${EXTRACTED_DIR}:/backup:ro" busybox sh -c "cd /volume && rm -rf ./* ./.??* 2>/dev/null || true && tar -xf /backup/${archive}"
  fi
}

restore_volume "minio.tar" "${PROJECT_NAME}_obscribe_minio"
restore_volume "caddy-data.tar" "${PROJECT_NAME}_caddy_data"
restore_volume "caddy-config.tar" "${PROJECT_NAME}_caddy_config"

echo "Restarting application..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d

echo "Restore complete."
