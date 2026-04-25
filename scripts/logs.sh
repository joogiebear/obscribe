#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
SUPPORT_ROOT="${OBSCRIBE_SUPPORT_DIR:-${ROOT_DIR}/support}"
STAMP="$(date +%Y%m%d%H%M%S)"
BUNDLE_DIR="${SUPPORT_ROOT}/${STAMP}"

cd "${ROOT_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing .env. Run scripts/deploy.sh first."
  exit 1
fi

mkdir -p "${BUNDLE_DIR}"
chmod 700 "${SUPPORT_ROOT}" "${BUNDLE_DIR}"

echo "Collecting support bundle..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps > "${BUNDLE_DIR}/containers.txt" || true
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" logs --tail=500 > "${BUNDLE_DIR}/compose.log" || true
docker images > "${BUNDLE_DIR}/images.txt" || true
docker volume ls > "${BUNDLE_DIR}/volumes.txt" || true
df -h > "${BUNDLE_DIR}/disk.txt" || true
free -m > "${BUNDLE_DIR}/memory.txt" || true
git rev-parse HEAD > "${BUNDLE_DIR}/git-sha.txt" 2>/dev/null || true

{
  echo "Redacted environment"
  echo "===================="
  while IFS= read -r line || [ -n "${line}" ]; do
    case "${line}" in
      *PASSWORD=*|*SECRET=*|*KEY=*|*TOKEN=*) echo "${line%%=*}=<redacted>" ;;
      *) echo "${line}" ;;
    esac
  done < "${ENV_FILE}"
} > "${BUNDLE_DIR}/env.redacted"

if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T api php -r 'echo file_get_contents("http://127.0.0.1:8000/api/health");' > "${BUNDLE_DIR}/api-health.json" 2>/dev/null; then
  :
else
  echo '{"status":"failed"}' > "${BUNDLE_DIR}/api-health.json"
fi

tar -czf "${SUPPORT_ROOT}/obscribe-support-${STAMP}.tar.gz" -C "${SUPPORT_ROOT}" "${STAMP}"
chmod 600 "${SUPPORT_ROOT}/obscribe-support-${STAMP}.tar.gz"

echo "Support bundle created:"
echo "${SUPPORT_ROOT}/obscribe-support-${STAMP}.tar.gz"
