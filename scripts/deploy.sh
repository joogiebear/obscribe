#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${OBSCRIBE_REPO_URL:-https://github.com/joogiebear/obscribe.git}"
REPO_REF="${OBSCRIBE_REPO_REF:-main}"
INSTALL_DIR="${OBSCRIBE_HOME:-/opt/obscribe}"

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
if [ -f "${SCRIPT_PATH}" ]; then
  ROOT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")/.." && pwd)"
else
  ROOT_DIR="$(pwd)"
fi

if [ ! -f "${ROOT_DIR}/docker-compose.prod.yml" ]; then
  if ! command -v git >/dev/null 2>&1; then
    echo "Git is required for the GitHub-hosted installer. Install git and run again."
    exit 1
  fi

  if [ -d "${INSTALL_DIR}/.git" ]; then
    echo "Updating Obscribe in ${INSTALL_DIR}..."
    git -C "${INSTALL_DIR}" fetch origin "${REPO_REF}"
    git -C "${INSTALL_DIR}" checkout "${REPO_REF}"
    git -C "${INSTALL_DIR}" pull --ff-only origin "${REPO_REF}"
  else
    if [ -e "${INSTALL_DIR}" ] && [ "$(find "${INSTALL_DIR}" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)" ]; then
      echo "${INSTALL_DIR} exists and is not an Obscribe git checkout. Set OBSCRIBE_HOME to another directory."
      exit 1
    fi

    echo "Installing Obscribe into ${INSTALL_DIR}..."
    mkdir -p "$(dirname "${INSTALL_DIR}")"
    git clone --branch "${REPO_REF}" "${REPO_URL}" "${INSTALL_DIR}"
  fi

  exec bash "${INSTALL_DIR}/scripts/deploy.sh" "$@"
fi

ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"

cd "${ROOT_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine and run this script again."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required. Install the Docker compose plugin and run this script again."
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  cp "${ROOT_DIR}/.env.example" "${ENV_FILE}"
  DB_PASSWORD="$(openssl rand -hex 24 2>/dev/null || date +%s | sha256sum | cut -d' ' -f1)"
  AWS_SECRET="$(openssl rand -hex 24 2>/dev/null || date +%s%N | sha256sum | cut -d' ' -f1)"
  sed -i "s/^APP_ENV=.*/APP_ENV=production/" "${ENV_FILE}"
  sed -i "s/^APP_URL=.*/APP_URL=http:\/\/localhost/" "${ENV_FILE}"
  sed -i "s/^NEXT_PUBLIC_APP_URL=.*/NEXT_PUBLIC_APP_URL=http:\/\/localhost/" "${ENV_FILE}"
  sed -i "s/^NEXT_PUBLIC_API_URL=.*/NEXT_PUBLIC_API_URL=\/api/" "${ENV_FILE}"
  sed -i "s/^NEXT_PUBLIC_API_BASE_URL=.*/NEXT_PUBLIC_API_BASE_URL=\/api/" "${ENV_FILE}"
  sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=${DB_PASSWORD}/" "${ENV_FILE}"
  sed -i "s/^AWS_SECRET_ACCESS_KEY=.*/AWS_SECRET_ACCESS_KEY=${AWS_SECRET}/" "${ENV_FILE}"
  {
    echo ""
    echo "# Public domain for the single-server reverse proxy."
    echo "APP_DOMAIN=localhost"
    echo "ACME_EMAIL=admin@example.com"
  } >> "${ENV_FILE}"
  echo "Created .env. Edit APP_DOMAIN, ACME_EMAIL, APP_URL, and NEXT_PUBLIC_APP_URL before public launch."
fi

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" build
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d

echo "Waiting for the API to become healthy..."
for attempt in {1..30}; do
  if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T api php -r 'echo file_get_contents("http://127.0.0.1:8000/api/health");' >/dev/null 2>&1; then
    echo "Obscribe is running."
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps
    exit 0
  fi
  sleep 2
done

echo "The containers started, but the API health check did not pass yet."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps
exit 1
