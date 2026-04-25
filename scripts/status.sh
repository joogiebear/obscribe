#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"

cd "${ROOT_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing .env. Run scripts/deploy.sh first."
  exit 1
fi

APP_URL="$(grep '^APP_URL=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || true)"
APP_DOMAIN="$(grep '^APP_DOMAIN=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || true)"
MAIL_MAILER="$(grep '^MAIL_MAILER=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || true)"
MAIL_HOST="$(grep '^MAIL_HOST=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || true)"

echo "Obscribe status"
echo "==============="
echo "App URL: ${APP_URL:-unknown}"
echo "Domain: ${APP_DOMAIN:-unknown}"
echo "Mail: ${MAIL_MAILER:-log}${MAIL_HOST:+ (${MAIL_HOST})}"
echo

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

echo
echo "API health:"
if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T api php -r 'echo file_get_contents("http://127.0.0.1:8000/api/health");' 2>/dev/null; then
  echo
else
  echo "API health check failed."
fi

if [ "${APP_DOMAIN:-localhost}" != "localhost" ]; then
  echo
  echo "Public HTTP check:"
  if command -v curl >/dev/null 2>&1; then
    curl -I --max-time 10 "${APP_URL}" || true
  else
    echo "curl is not installed."
  fi
fi
