#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  :
else
  printf '%s\n' 'ROLLBACK_ROOT_REQUIRED' >&2
  exit 1
fi

if [[ "$#" -ne 1 ]]; then
  printf '%s\n' 'ROLLBACK_USAGE_INVALID' >&2
  exit 1
fi

RELEASE_ID="$1"
if [[ ! "${RELEASE_ID}" =~ ^1\.[0-9]+\.[0-9]+-[0-9a-f]{12}$ ]]; then
  printf '%s\n' 'ROLLBACK_RELEASE_INVALID' >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASES_DIR='/opt/hengs/discord-bot/releases'
CURRENT_LINK='/opt/hengs/discord-bot/current'
HEALTH_FILE='/var/lib/hengs-discord/data/runtime-health.json'
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
CURRENT_TEMP="${CURRENT_LINK}.rollback.$$"

cleanup() {
  rm -f -- "${CURRENT_TEMP}"
}
trap cleanup EXIT

if [[ ! -d "${RELEASE_DIR}" || -L "${RELEASE_DIR}" || "$(dirname "$(realpath -e -- "${RELEASE_DIR}")")" != "${RELEASES_DIR}" ]]; then
  printf '%s\n' 'ROLLBACK_RELEASE_INVALID' >&2
  exit 1
fi
if [[ ! -f "${RELEASE_DIR}/package.json" || ! -f "${RELEASE_DIR}/src/index.js" ]]; then
  printf '%s\n' 'ROLLBACK_RELEASE_INVALID' >&2
  exit 1
fi

systemctl stop hengs-discord.service
rm -f -- "${HEALTH_FILE}"
ln -s "${RELEASE_DIR}" "${CURRENT_TEMP}"
mv -Tf -- "${CURRENT_TEMP}" "${CURRENT_LINK}"
chown -h root:root "${CURRENT_LINK}"
systemctl start hengs-discord.service

HEALTH_OUTPUT=''
HEALTH_OK=false
for attempt in {1..6}; do
  if ! HEALTH_OUTPUT="$(bash "${SCRIPT_DIR}/inspect-health.sh" 2>/dev/null)"; then
    if [[ "${attempt}" -lt 6 ]]; then
      sleep 10
    fi
  else
    HEALTH_OK=true
    break
  fi
done
if [[ "${HEALTH_OK}" != true ]]; then
  systemctl stop hengs-discord.service
  printf '%s\n' 'ROLLBACK_HEALTH_FAILED' >&2
  exit 1
fi
printf '%s\n' "${HEALTH_OUTPUT}"

printf 'release=%s status=ACTIVE\n' "${RELEASE_ID}"
