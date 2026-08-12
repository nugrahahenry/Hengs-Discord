#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  :
else
  printf '%s\n' 'version=unknown state=UNKNOWN code=HEALTH_ROOT_REQUIRED age=unknown' >&2
  exit 1
fi

if ! systemctl is-active --quiet hengs-discord.service; then
  printf '%s\n' 'version=unknown state=DOWN code=SERVICE_INACTIVE age=unknown'
  exit 1
fi

HEALTH_FILE='/var/lib/hengs-discord/data/runtime-health.json'
node -e '
const fs = require("node:fs");
const file = process.argv[1];
function fail(code) {
  process.stdout.write(`version=unknown state=INVALID code=${code} age=unknown\n`);
  process.exit(1);
}
let health;
try {
  health = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  fail("HEALTH_INVALID");
}
if (health.schemaVersion !== 1 || health.service !== "hengs-discord") fail("HEALTH_SCHEMA_INVALID");
if (typeof health.version !== "string" || !/^\d+\.\d+\.\d+$/.test(health.version)) fail("HEALTH_SCHEMA_INVALID");
if (!health.connection || health.connection.status !== "CONNECTED") fail("CONNECTION_NOT_READY");
const heartbeat = health.heartbeat && Date.parse(health.heartbeat.at);
if (!Number.isFinite(heartbeat)) fail("HEARTBEAT_INVALID");
const ageMs = Date.now() - heartbeat;
if (ageMs < -300000 || ageMs > 90_000) fail("HEARTBEAT_STALE");
const age = ageMs <= 45000 ? "fresh" : "aging";
process.stdout.write(`version=${health.version} state=CONNECTED code=OK age=${age}\n`);
' "${HEALTH_FILE}"
