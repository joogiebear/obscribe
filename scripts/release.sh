#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
RELEASE_ROOT="${OBSCRIBE_RELEASE_DIR:-${ROOT_DIR}/releases}"
TARGET_REF="${1:-${OBSCRIBE_REPO_REF:-main}}"
STAMP="$(date +%Y%m%d%H%M%S)"
RECORD_FILE="${RELEASE_ROOT}/release-${STAMP}.env"

cd "${ROOT_DIR}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is not installed or is not on PATH."
    exit 1
  fi
}

write_record() {
  local status="$1"

  cat > "${RECORD_FILE}" <<EOF
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATUS=${status}
PREVIOUS_SHA=${PREVIOUS_SHA}
TARGET_REF=${TARGET_REF}
TARGET_SHA=${TARGET_SHA:-}
BACKUP_ARCHIVE=${BACKUP_ARCHIVE:-}
EOF
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

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Release must run from an Obscribe git checkout."
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ] && [ "${OBSCRIBE_ALLOW_DIRTY:-}" != "1" ]; then
  echo "Tracked files have local changes. Commit, stash, or set OBSCRIBE_ALLOW_DIRTY=1 after reviewing them."
  exit 1
fi

if ! docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config --quiet; then
  echo "Docker Compose configuration is invalid. Fix it before releasing."
  exit 1
fi

mkdir -p "${RELEASE_ROOT}"
chmod 700 "${RELEASE_ROOT}"

PREVIOUS_SHA="$(git rev-parse HEAD)"
TARGET_SHA=""
BACKUP_ARCHIVE=""

if [ "${OBSCRIBE_SKIP_BACKUP:-}" != "1" ]; then
  echo "Creating a pre-release backup..."
  backup_output="$(bash scripts/backup.sh)"
  printf '%s\n' "${backup_output}"
  BACKUP_ARCHIVE="$(printf '%s\n' "${backup_output}" | tail -n 1)"

  if [ ! -f "${BACKUP_ARCHIVE}" ]; then
    echo "Backup did not produce an archive path. Release stopped."
    exit 1
  fi
else
  echo "Skipping pre-release backup because OBSCRIBE_SKIP_BACKUP=1."
fi

write_record "started"

echo "Fetching ${TARGET_REF}..."
git fetch --tags origin || true
if git fetch origin "${TARGET_REF}"; then
  TARGET_SHA="$(git rev-parse FETCH_HEAD)"
elif [[ "${TARGET_REF}" =~ ^[0-9a-fA-F]{7,40}$ ]] && git rev-parse --verify --quiet "${TARGET_REF}^{commit}" >/dev/null; then
  TARGET_SHA="$(git rev-parse "${TARGET_REF}^{commit}")"
else
  echo "Could not fetch release target: ${TARGET_REF}"
  exit 1
fi

write_record "building"

echo "Checking out ${TARGET_SHA}..."
git checkout --detach "${TARGET_SHA}"

echo "Building and starting Obscribe..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" build
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d

if wait_for_api; then
  write_record "succeeded"
  cp "${RECORD_FILE}" "${RELEASE_ROOT}/latest.env"
  echo "Release complete."
  echo "Release record: ${RECORD_FILE}"
  exit 0
fi

write_record "failed"
echo "The release started, but the API health check did not pass."
echo "To return to the previous code version, run: bash scripts/rollback.sh ${RECORD_FILE}"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps
exit 1
