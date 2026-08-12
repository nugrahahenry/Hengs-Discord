#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  :
else
  printf '%s\n' 'HOST_ROOT_REQUIRED' >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER='hengs-discord'
SERVICE_GROUP='hengs-discord'
ENV_FILE='/etc/hengs/discord.env'
KEYRING_DIR='/usr/share/keyrings'
APT_SOURCE_DIR='/etc/apt/sources.list.d'
TEMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf -- "${TEMP_DIR}"
}
trap cleanup EXIT

if [[ ! -r /etc/os-release ]]; then
  printf '%s\n' 'HOST_OS_UNSUPPORTED' >&2
  exit 1
fi
. /etc/os-release
if [[ "${ID:-}" != 'ubuntu' || -z "${VERSION_CODENAME:-}" ]]; then
  printf '%s\n' 'HOST_OS_UNSUPPORTED' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg tar age ufw

install -d -m 0755 "${KEYRING_DIR}" "${APT_SOURCE_DIR}"

curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
  'https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key' \
  --output "${TEMP_DIR}/nodesource-repo.gpg.key"
gpg --dearmor --yes --output "${KEYRING_DIR}/nodesource.gpg" \
  "${TEMP_DIR}/nodesource-repo.gpg.key"
chmod 0644 "${KEYRING_DIR}/nodesource.gpg"
printf '%s\n' \
  "deb [arch=$(dpkg --print-architecture) signed-by=${KEYRING_DIR}/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
  > "${APT_SOURCE_DIR}/nodesource.list"

curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
  "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.noarmor.gpg" \
  --output "${KEYRING_DIR}/tailscale-archive-keyring.gpg"
chmod 0644 "${KEYRING_DIR}/tailscale-archive-keyring.gpg"
printf '%s\n' \
  "deb [signed-by=${KEYRING_DIR}/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/ubuntu ${VERSION_CODENAME} main" \
  > "${APT_SOURCE_DIR}/tailscale.list"

apt-get update
apt-get install -y --no-install-recommends nodejs tailscale

if [[ "$(node --version)" != v22.* ]]; then
  printf '%s\n' 'NODE_VERSION_INVALID' >&2
  exit 1
fi

if ! getent group "${SERVICE_GROUP}" >/dev/null; then
  groupadd --system "${SERVICE_GROUP}"
fi
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --gid "${SERVICE_GROUP}" --home-dir /nonexistent \
    --no-create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

install -d -m 0755 -o root -g root /opt/hengs/discord-bot/releases
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" /var/lib/hengs-discord/data
install -d -m 0750 -o root -g "${SERVICE_GROUP}" /var/backups/hengs-discord
install -d -m 0750 -o root -g "${SERVICE_GROUP}" /etc/hengs
if [[ ! -e "${ENV_FILE}" ]]; then
  install -m 0640 -o root -g hengs-discord /dev/null "${ENV_FILE}"
fi
chown root:"${SERVICE_GROUP}" "${ENV_FILE}"
chmod 0640 "${ENV_FILE}"

install -m 0644 -o root -g root \
  "${SCRIPT_DIR}/hengs-discord.service" \
  /etc/systemd/system/hengs-discord.service
systemctl daemon-reload

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

printf '%s\n' 'HOST_INSTALL_READY'
