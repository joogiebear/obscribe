#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${OBSCRIBE_REPO_URL:-https://github.com/joogiebear/obscribe.git}"
REPO_REF="${OBSCRIBE_REPO_REF:-main}"
INSTALL_DIR="${OBSCRIBE_HOME:-/opt/obscribe}"

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "This installer needs root privileges. Re-run as root or install sudo."
    exit 1
  fi
}

require_apt() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Automatic dependency installation currently supports Ubuntu/Debian servers with apt."
    echo "Install git, Docker Engine, and the Docker Compose v2 plugin, then run this installer again."
    exit 1
  fi
}

apt_install() {
  require_apt
  run_as_root apt-get update
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

ensure_git() {
  if command -v git >/dev/null 2>&1; then
    return
  fi

  echo "Installing Git..."
  apt_install ca-certificates curl gnupg git
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi

  require_apt

  if [ ! -f /etc/os-release ]; then
    echo "Cannot detect this server's Linux distribution."
    exit 1
  fi

  . /etc/os-release

  if [ "${ID:-}" != "ubuntu" ] && [ "${ID:-}" != "debian" ]; then
    echo "Automatic Docker installation currently supports Ubuntu and Debian."
    echo "Detected: ${ID:-unknown}. Install Docker Engine and Docker Compose v2, then run again."
    exit 1
  fi

  CODENAME="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"
  if [ -z "${CODENAME}" ]; then
    echo "Cannot detect OS codename for Docker repository setup."
    exit 1
  fi

  echo "Installing Docker Engine and Docker Compose..."
  apt_install ca-certificates curl gnupg lsb-release
  run_as_root install -m 0755 -d /etc/apt/keyrings

  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" | run_as_root gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    run_as_root chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  ARCH="$(dpkg --print-architecture)"
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${CODENAME} stable" \
    | run_as_root tee /etc/apt/sources.list.d/docker.list >/dev/null

  run_as_root apt-get update
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  if command -v systemctl >/dev/null 2>&1; then
    run_as_root systemctl enable --now docker || true
  else
    run_as_root service docker start || true
  fi

  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "Docker installation did not complete correctly. Check the package output above."
    exit 1
  fi
}

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
if [ -f "${SCRIPT_PATH}" ]; then
  ROOT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")/.." && pwd)"
else
  ROOT_DIR="$(pwd)"
fi

if [ ! -f "${ROOT_DIR}/docker-compose.prod.yml" ]; then
  ensure_git

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

prompt_secret() {
  local prompt="$1"
  local default="$2"
  local value=""

  if [ -t 0 ]; then
    read -r -s -p "${prompt}" value
    printf '\n'
  fi

  printf '%s' "${value:-$default}"
}

yes_no() {
  local prompt="$1"
  local default="$2"
  local value=""

  if [ -t 0 ]; then
    read -r -p "${prompt} [${default}]: " value
  fi

  value="${value:-$default}"
  case "${value}" in
    y|Y|yes|YES|Yes) return 0 ;;
    *) return 1 ;;
  esac
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

get_env_value() {
  local key="$1"
  grep "^${key}=" "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || true
}

configure_smtp() {
  local should_configure="false"

  if [ -n "${OBSCRIBE_SMTP_HOST:-}" ]; then
    should_configure="true"
  elif [ "${OBSCRIBE_CONFIGURE_SMTP:-}" = "1" ]; then
    should_configure="true"
  elif [ -t 0 ] && [ "$(get_env_value MAIL_MAILER)" != "smtp" ]; then
    if yes_no "Configure SMTP email now?" "n"; then
      should_configure="true"
    fi
  fi

  if [ "${should_configure}" != "true" ]; then
    return
  fi

  local current_domain
  local smtp_host
  local smtp_port
  local smtp_username
  local smtp_password
  local smtp_encryption
  local mail_from
  local mail_name

  current_domain="$(get_env_value APP_DOMAIN)"
  smtp_host="${OBSCRIBE_SMTP_HOST:-$(prompt_value "SMTP host" "$(get_env_value MAIL_HOST)")}"
  if [ -z "${smtp_host}" ]; then
    echo "SMTP host was not provided. Leaving mail on the current setting."
    return
  fi

  smtp_port="${OBSCRIBE_SMTP_PORT:-$(prompt_value "SMTP port" "$(get_env_value MAIL_PORT)")}"
  smtp_port="${smtp_port:-587}"
  smtp_username="${OBSCRIBE_SMTP_USERNAME:-$(prompt_value "SMTP username" "$(get_env_value MAIL_USERNAME)")}"
  smtp_password="${OBSCRIBE_SMTP_PASSWORD:-$(prompt_secret "SMTP password: " "$(get_env_value MAIL_PASSWORD)")}"
  smtp_encryption="${OBSCRIBE_SMTP_ENCRYPTION:-$(prompt_value "SMTP encryption (tls, ssl, or none)" "$(get_env_value MAIL_ENCRYPTION)")}"
  smtp_encryption="${smtp_encryption:-tls}"
  mail_from="${OBSCRIBE_MAIL_FROM:-$(prompt_value "From email address" "$(get_env_value MAIL_FROM_ADDRESS)")}"
  mail_from="${mail_from:-$(domain_to_mail_from "${current_domain:-localhost}")}"
  mail_name="${OBSCRIBE_MAIL_FROM_NAME:-$(prompt_value "From name" "$(get_env_value MAIL_FROM_NAME)")}"
  mail_name="${mail_name:-Obscribe}"

  set_env_value "MAIL_MAILER" "smtp"
  set_env_value "MAIL_HOST" "${smtp_host}"
  set_env_value "MAIL_PORT" "${smtp_port}"
  set_env_value "MAIL_USERNAME" "${smtp_username}"
  set_env_value "MAIL_PASSWORD" "${smtp_password}"
  set_env_value "MAIL_ENCRYPTION" "${smtp_encryption}"
  set_env_value "MAIL_FROM_ADDRESS" "${mail_from}"
  set_env_value "MAIL_FROM_NAME" "${mail_name}"

  echo "SMTP settings saved. New registrations will send a welcome email."
}

ensure_docker

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

configure_smtp

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
