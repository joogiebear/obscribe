#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
BACKUP_ARCHIVE="${1:-}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "${ROOT_DIR}" | tr '[:upper:]' '[:lower:]')}"

cd "${ROOT_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or is not on PATH."
  exit 1
fi

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

if ! docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config --quiet; then
  echo "Docker Compose configuration is invalid. Fix it before restoring."
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

if ! tar -tzf "${BACKUP_ARCHIVE}" > "${TMP_DIR}/archive-files.txt"; then
  echo "Backup archive could not be read."
  exit 1
fi

while IFS= read -r entry || [ -n "${entry}" ]; do
  case "${entry}" in
    /*|../*|*/../*|..|*/..)
      echo "Backup archive contains an unsafe path: ${entry}"
      exit 1
      ;;
  esac
done < "${TMP_DIR}/archive-files.txt"

tar -xzf "${BACKUP_ARCHIVE}" -C "${TMP_DIR}"
EXTRACTED_DIR="$(find "${TMP_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

if [ -z "${EXTRACTED_DIR}" ]; then
  echo "Backup archive did not contain a backup directory."
  exit 1
fi

if [ ! -f "${EXTRACTED_DIR}/postgres.sql" ]; then
  echo "Backup archive does not contain postgres.sql."
  exit 1
fi

DB_USER="$(grep '^DB_USERNAME=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2-)"
DB_NAME="$(grep '^DB_DATABASE=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2-)"
DB_USER="${DB_USER:-obscribe}"
DB_NAME="${DB_NAME:-obscribe}"

echo "This will replace the current Obscribe database."
echo "Current .env settings will be kept. The backup's env.backup is for reference only."
CONFIRM="${OBSCRIBE_CONFIRM_RESTORE:-}"
if [ -z "${CONFIRM}" ] && [ -t 0 ]; then
  read -r -p "Type RESTORE to continue: " CONFIRM
fi
if [ "${CONFIRM}" != "RESTORE" ]; then
  echo "Restore cancelled."
  exit 1
fi

echo "Stopping services that can write data..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" stop caddy web api minio redis >/dev/null 2>&1 || true

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d db
echo "Restoring database..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T db psql -U "${DB_USER}" -d "${DB_NAME}" < "${EXTRACTED_DIR}/postgres.sql"

restore_volume() {
  local archive="$1"
  local volume="$2"

  if [ -f "${EXTRACTED_DIR}/${archive}" ]; then
    echo "Restoring volume ${volume}..."
    docker volume create "${volume}" >/dev/null
    docker run --rm -v "${volume}:/volume" -v "${EXTRACTED_DIR}:/backup:ro" busybox sh -c "find /volume -mindepth 1 -maxdepth 1 -exec rm -rf {} \; && tar -xf /backup/${archive} -C /volume"
  fi
}

restore_volume "minio.tar" "${PROJECT_NAME}_obscribe_minio"
restore_volume "redis.tar" "${PROJECT_NAME}_obscribe_redis"
restore_volume "caddy-data.tar" "${PROJECT_NAME}_caddy_data"
restore_volume "caddy-config.tar" "${PROJECT_NAME}_caddy_config"

echo "Restarting application..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d

echo "Waiting for the API to become healthy..."
for attempt in {1..30}; do
  if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T api php -r 'echo file_get_contents("http://127.0.0.1:8000/api/health");' >/dev/null 2>&1; then
    echo "Restore complete."
    exit 0
  fi
  sleep 2
done

echo "Restore finished, but the API health check did not pass yet."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps
exit 1
