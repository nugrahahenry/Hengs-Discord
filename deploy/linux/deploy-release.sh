#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  :
else
  printf '%s\n' 'DEPLOY_ROOT_REQUIRED' >&2
  exit 1
fi

if [[ "$#" -ne 2 ]]; then
  printf '%s\n' 'DEPLOY_USAGE_INVALID' >&2
  exit 1
fi

if systemctl is-active --quiet hengs-discord.service; then
  printf '%s\n' 'SERVICE_MUST_BE_STOPPED' >&2
  exit 1
fi

ARCHIVE="$(realpath -e -- "$1")"
CHECKSUM="$(realpath -e -- "$2")"
ARCHIVE_NAME="$(basename -- "${ARCHIVE}")"
if [[ ! "${ARCHIVE_NAME}" =~ ^hengs-discord-1\.27\.0-([0-9a-f]{12})\.tar\.gz$ ]]; then
  printf '%s\n' 'RELEASE_NAME_INVALID' >&2
  exit 1
fi
RELEASE_ID="1.27.0-${BASH_REMATCH[1]}"

read -r EXPECTED_HASH EXPECTED_NAME EXTRA < "${CHECKSUM}" || true
if [[ ! "${EXPECTED_HASH:-}" =~ ^[0-9a-f]{64}$ || "${EXPECTED_NAME:-}" != "${ARCHIVE_NAME}" || -n "${EXTRA:-}" ]]; then
  printf '%s\n' 'CHECKSUM_FILE_INVALID' >&2
  exit 1
fi
ACTUAL_HASH="$(sha256sum "${ARCHIVE}" | awk '{print $1}')"
if [[ "${ACTUAL_HASH}" != "${EXPECTED_HASH}" ]]; then
  printf '%s\n' 'CHECKSUM_MISMATCH' >&2
  exit 1
fi

SERVICE_USER='hengs-discord'
SERVICE_GROUP='hengs-discord'
RELEASES_DIR='/opt/hengs/discord-bot/releases'
CURRENT_LINK='/opt/hengs/discord-bot/current'
STATE_DIR='/var/lib/hengs-discord/data'
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
STAGING_DIR="${RELEASES_DIR}/.staging-${RELEASE_ID}-$$"
CURRENT_TEMP="${CURRENT_LINK}.new.$$"
LIST_FILE="$(mktemp)"
TYPE_FILE="$(mktemp)"
NPM_CACHE_DIR="$(mktemp -d)"

cleanup() {
  rm -f -- "${LIST_FILE}" "${TYPE_FILE}" "${CURRENT_TEMP}"
  if [[ -n "${NPM_CACHE_DIR}" && -d "${NPM_CACHE_DIR}" ]]; then
    rm -rf -- "${NPM_CACHE_DIR}"
  fi
  if [[ -n "${STAGING_DIR}" && -d "${STAGING_DIR}" ]]; then
    rm -rf -- "${STAGING_DIR}"
  fi
}
trap cleanup EXIT

if [[ -e "${RELEASE_DIR}" || -L "${RELEASE_DIR}" ]]; then
  printf '%s\n' 'RELEASE_EXISTS' >&2
  exit 1
fi

tar -tzf "${ARCHIVE}" > "${LIST_FILE}"
tar -tvzf "${ARCHIVE}" > "${TYPE_FILE}"
if [[ ! -s "${LIST_FILE}" ]] || grep -Eq '(^/|(^|/)\.\.(/|$)|\\)' "${LIST_FILE}"; then
  printf '%s\n' 'UNSAFE_ARCHIVE' >&2
  exit 1
fi
if [[ -n "$(sort "${LIST_FILE}" | uniq -d)" ]]; then
  printf '%s\n' 'UNSAFE_ARCHIVE' >&2
  exit 1
fi
if awk 'substr($0,1,1) != "-" && substr($0,1,1) != "d" { exit 1 }' "${TYPE_FILE}"; then
  :
else
  printf '%s\n' 'UNSAFE_ARCHIVE' >&2
  exit 1
fi

install -d -m 0755 -o root -g root "${RELEASES_DIR}"
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${STATE_DIR}"
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${STAGING_DIR}"
tar -xzf "${ARCHIVE}" --no-same-owner --no-same-permissions -C "${STAGING_DIR}"

for required in package.json package-lock.json src/index.js; do
  if [[ ! -f "${STAGING_DIR}/${required}" || -L "${STAGING_DIR}/${required}" ]]; then
    printf '%s\n' 'RELEASE_CONTENT_INVALID' >&2
    exit 1
  fi
done
if ! PACKAGE_VERSION="$(node -p 'require(process.argv[1]).version' "${STAGING_DIR}/package.json" 2>/dev/null)"; then
  printf '%s\n' 'RELEASE_CONTENT_INVALID' >&2
  exit 1
fi
if [[ "${PACKAGE_VERSION}" != '1.27.0' ]]; then
  printf '%s\n' 'RELEASE_VERSION_INVALID' >&2
  exit 1
fi
if [[ -e "${STAGING_DIR}/data" || -L "${STAGING_DIR}/data" ]]; then
  printf '%s\n' 'RELEASE_CONTENT_INVALID' >&2
  exit 1
fi
chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${STAGING_DIR}"
chown "${SERVICE_USER}:${SERVICE_GROUP}" "${NPM_CACHE_DIR}"
runuser -u "${SERVICE_USER}" -- env HOME="${NPM_CACHE_DIR}" npm_config_cache="${NPM_CACHE_DIR}" npm --prefix "${STAGING_DIR}" ci
runuser -u "${SERVICE_USER}" -- env HOME="${NPM_CACHE_DIR}" npm_config_cache="${NPM_CACHE_DIR}" npm --prefix "${STAGING_DIR}" test
runuser -u "${SERVICE_USER}" -- env HOME="${NPM_CACHE_DIR}" npm_config_cache="${NPM_CACHE_DIR}" npm --prefix "${STAGING_DIR}" prune --omit=dev

find -P "${STAGING_DIR}" -type d -exec chown root:"${SERVICE_GROUP}" {} +
find -P "${STAGING_DIR}" -type f -exec chown root:"${SERVICE_GROUP}" {} +
find -P "${STAGING_DIR}" \( -type d -o -type f \) -exec chmod go-w {} +
ln -s "${STATE_DIR}" "${STAGING_DIR}/data"
chown -h root:root "${STAGING_DIR}/data"

mv -- "${STAGING_DIR}" "${RELEASE_DIR}"
STAGING_DIR=''
ln -s "${RELEASE_DIR}" "${CURRENT_TEMP}"
mv -Tf -- "${CURRENT_TEMP}" "${CURRENT_LINK}"
chown -h root:root "${CURRENT_LINK}"

printf 'release=%s status=READY\n' "${RELEASE_ID}"
