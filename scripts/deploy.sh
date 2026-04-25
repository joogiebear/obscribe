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

prompt_value() {
  local prompt="$1"
  local default="$2"
  local value=""

  if [ -t 0 ]; then
    read -r -p "${prompt} [${default}]: " value
  fi

  printf '%s' "${value:-$default}"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local escaped

  escaped="$(printf '%s' "${value}" | sed 's/[\/&|]/\\&/g')"

  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

domain_to_mail_from() {
  local domain="$1"

  if [ "${domain}" = "localhost" ]; then
    printf '%s' "no-reply@obscribe.local"
  else
    printf '%s' "no-reply@${domain}"
  fi
}

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
  DEFAULT_DOMAIN="${OBSCRIBE_DOMAIN:-localhost}"
  DEFAULT_ACME_EMAIL="${OBSCRIBE_ACME_EMAIL:-admin@example.com}"
  APP_DOMAIN="$(prompt_value "Public domain for Obscribe" "${DEFAULT_DOMAIN}")"

  if [ "${APP_DOMAIN}" = "localhost" ]; then
    DEFAULT_ACME_EMAIL="${OBSCRIBE_ACME_EMAIL:-admin@example.com}"
    APP_SCHEME="http"
  else
    DEFAULT_ACME_EMAIL="${OBSCRIBE_ACME_EMAIL:-admin@${APP_DOMAIN}}"
    APP_SCHEME="https"
  fi

  ACME_EMAIL="$(prompt_value "Email for SSL certificate notices" "${DEFAULT_ACME_EMAIL}")"
  MAIL_FROM_ADDRESS="${OBSCRIBE_MAIL_FROM:-$(domain_to_mail_from "${APP_DOMAIN}")}"
  DB_PASSWORD="$(openssl rand -hex 24 2>/dev/null || date +%s | sha256sum | cut -d' ' -f1)"
  AWS_SECRET="$(openssl rand -hex 24 2>/dev/null || date +%s%N | sha256sum | cut -d' ' -f1)"
  APP_URL="${APP_SCHEME}://${APP_DOMAIN}"

  set_env_value "APP_ENV" "production"
  set_env_value "APP_DOMAIN" "${APP_DOMAIN}"
  set_env_value "ACME_EMAIL" "${ACME_EMAIL}"
  set_env_value "APP_URL" "${APP_URL}"
  set_env_value "NEXT_PUBLIC_APP_URL" "${APP_URL}"
  set_env_value "NEXT_PUBLIC_API_URL" "/api"
  set_env_value "NEXT_PUBLIC_API_BASE_URL" "/api"
  set_env_value "API_URL" "${APP_URL}/api"
  set_env_value "SESSION_DOMAIN" "${APP_DOMAIN}"
  set_env_value "SANCTUM_STATEFUL_DOMAINS" "${APP_DOMAIN}"
  set_env_value "MAIL_FROM_ADDRESS" "${MAIL_FROM_ADDRESS}"
  set_env_value "DB_PASSWORD" "${DB_PASSWORD}"
  set_env_value "AWS_SECRET_ACCESS_KEY" "${AWS_SECRET}"

  echo "Created .env for ${APP_URL}."
  if [ "${APP_DOMAIN}" != "localhost" ]; then
    echo "Make sure DNS for ${APP_DOMAIN} points to this server and ports 80/443 are open for SSL."
  fi
else
  if [ -n "${OBSCRIBE_DOMAIN:-}" ] || [ -n "${OBSCRIBE_ACME_EMAIL:-}" ] || [ -n "${OBSCRIBE_MAIL_FROM:-}" ]; then
    CURRENT_DOMAIN="$(grep '^APP_DOMAIN=' "${ENV_FILE}" | cut -d= -f2- || true)"
    APP_DOMAIN="${OBSCRIBE_DOMAIN:-${CURRENT_DOMAIN:-localhost}}"

    if [ "${APP_DOMAIN}" = "localhost" ]; then
      APP_SCHEME="http"
      DEFAULT_ACME_EMAIL="admin@example.com"
    else
      APP_SCHEME="https"
      DEFAULT_ACME_EMAIL="admin@${APP_DOMAIN}"
    fi

    ACME_EMAIL="${OBSCRIBE_ACME_EMAIL:-$(grep '^ACME_EMAIL=' "${ENV_FILE}" | cut -d= -f2- || true)}"
    ACME_EMAIL="${ACME_EMAIL:-$DEFAULT_ACME_EMAIL}"
    MAIL_FROM_ADDRESS="${OBSCRIBE_MAIL_FROM:-$(grep '^MAIL_FROM_ADDRESS=' "${ENV_FILE}" | cut -d= -f2- || true)}"
    MAIL_FROM_ADDRESS="${MAIL_FROM_ADDRESS:-$(domain_to_mail_from "${APP_DOMAIN}")}"
    APP_URL="${APP_SCHEME}://${APP_DOMAIN}"

    set_env_value "APP_DOMAIN" "${APP_DOMAIN}"
    set_env_value "ACME_EMAIL" "${ACME_EMAIL}"
    set_env_value "APP_URL" "${APP_URL}"
    set_env_value "NEXT_PUBLIC_APP_URL" "${APP_URL}"
    set_env_value "NEXT_PUBLIC_API_URL" "/api"
    set_env_value "NEXT_PUBLIC_API_BASE_URL" "/api"
    set_env_value "API_URL" "${APP_URL}/api"
    set_env_value "SESSION_DOMAIN" "${APP_DOMAIN}"
    set_env_value "SANCTUM_STATEFUL_DOMAINS" "${APP_DOMAIN}"
    set_env_value "MAIL_FROM_ADDRESS" "${MAIL_FROM_ADDRESS}"

    echo "Updated .env domain settings for ${APP_URL}."
  fi
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
