#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
RELEASE_ROOT="${OBSCRIBE_RELEASE_DIR:-${ROOT_DIR}/releases}"
RECORD_FILE="${1:-${RELEASE_ROOT}/latest.env}"

cd "${ROOT_DIR}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is not installed or is not on PATH."
    exit 1
  fi
}

read_record_value() {
  local key="$1"
  grep "^${key}=" "${RECORD_FILE}" | tail -n 1 | cut -d= -f2- || true
}

wait_for_api() {
  echo "Waiting for the API to become healthy..."
  for attempt in {1..30}; do
    if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T api php -r 'echo file_get_contents("http://127.0.0.1:8000/api/health");' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  return 1
}

require_command git
require_command docker

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing .env. Run scripts/deploy.sh first."
  exit 1
fi

if [ ! -f "${RECORD_FILE}" ]; then
  echo "Release record not found: ${RECORD_FILE}"
  echo "Pass a release record from ${RELEASE_ROOT}, for example scripts/rollback.sh releases/release-YYYYmmddHHMMSS.env"
  exit 1
fi

PREVIOUS_SHA="$(read_record_value PREVIOUS_SHA)"
TARGET_SHA="$(read_record_value TARGET_SHA)"
BACKUP_ARCHIVE="$(read_record_value BACKUP_ARCHIVE)"

if [ -z "${PREVIOUS_SHA}" ]; then
  echo "Release record does not contain PREVIOUS_SHA."
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ] && [ "${OBSCRIBE_ALLOW_DIRTY:-}" != "1" ]; then
  echo "Tracked files have local changes. Commit, stash, or set OBSCRIBE_ALLOW_DIRTY=1 after reviewing them."
  exit 1
fi

if ! docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config --quiet; then
  echo "Docker Compose configuration is invalid. Fix it before rolling back."
  exit 1
fi

echo "This rolls Obscribe code back from ${TARGET_SHA:-the last release} to ${PREVIOUS_SHA}."
echo "The database will not be restored by this command."
if [ -n "${BACKUP_ARCHIVE}" ]; then
  echo "Matching pre-release backup: ${BACKUP_ARCHIVE}"
fi

CONFIRM="${OBSCRIBE_CONFIRM_ROLLBACK:-}"
if [ -z "${CONFIRM}" ] && [ -t 0 ]; then
  read -r -p "Type ROLLBACK to continue: " CONFIRM
fi
if [ "${CONFIRM}" != "ROLLBACK" ]; then
  echo "Rollback cancelled."
  exit 1
fi

if [ "${OBSCRIBE_SKIP_BACKUP:-}" != "1" ]; then
  echo "Creating a backup before rollback..."
  bash scripts/backup.sh
else
  echo "Skipping rollback backup because OBSCRIBE_SKIP_BACKUP=1."
fi

if ! git cat-file -e "${PREVIOUS_SHA}^{commit}" 2>/dev/null; then
  echo "Previous commit is not available locally. Fetching from origin..."
  git fetch --all --tags
fi

if ! git cat-file -e "${PREVIOUS_SHA}^{commit}" 2>/dev/null; then
  echo "Previous commit is still unavailable: ${PREVIOUS_SHA}"
  exit 1
fi

echo "Checking out ${PREVIOUS_SHA}..."
git checkout --detach "${PREVIOUS_SHA}"

echo "Building and starting Obscribe..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" build
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d

if wait_for_api; then
  echo "Rollback complete."
  if [ -n "${BACKUP_ARCHIVE}" ]; then
    echo "If the release also changed or damaged data, restore the pre-release backup manually:"
    echo "OBSCRIBE_CONFIRM_RESTORE=RESTORE bash scripts/restore.sh ${BACKUP_ARCHIVE}"
  fi
  exit 0
fi

echo "Rollback ran, but the API health check did not pass."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps
exit 1
