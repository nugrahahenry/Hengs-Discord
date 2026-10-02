const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const deploy = fs.readFileSync(path.join(root, 'deploy/linux/deploy-release.sh'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'deploy/linux/rollback.sh'), 'utf8');

test('release deploy refuses an active service and validates package version', () => {
  const activeCheck = deploy.indexOf('systemctl is-active --quiet hengs-discord.service');
  const extraction = deploy.indexOf('tar -xzf');
  assert.notEqual(activeCheck, -1);
  assert.equal(activeCheck < extraction, true);
  assert.match(deploy, /SERVICE_MUST_BE_STOPPED/);
  assert.match(deploy, /PACKAGE_VERSION/);
  assert.match(deploy, /"\$\{PACKAGE_VERSION\}" != '1\.35\.0'/);
  assert.match(deploy, /hengs-discord-1\\\.35\\\.0-/);
  assert.match(deploy, /RELEASE_ID="1\.35\.0-/);
});

test('deployed release becomes root-owned and service-group-readable after dependency installation', () => {
  const prune = deploy.indexOf('npm --prefix "${STAGING_DIR}" prune --omit=dev');
  const immutable = deploy.indexOf('find -P "${STAGING_DIR}"');
  const activate = deploy.indexOf('mv -- "${STAGING_DIR}" "${RELEASE_DIR}"');
  assert.notEqual(immutable, -1);
  assert.equal(prune < immutable && immutable < activate, true);
  assert.match(deploy, /chown root:"\$\{SERVICE_GROUP\}"/);
  assert.doesNotMatch(deploy, /find -P "\$\{STAGING_DIR\}"[^\n]*chown root:root/);
  assert.match(deploy, /chmod go-w/);
});

test('release deploy gives the non-login service user a temporary npm home', () => {
  assert.match(deploy, /NPM_CACHE_DIR="\$\(mktemp -d\)"/);
  assert.match(
    deploy,
    /runuser -u "\$\{SERVICE_USER\}" -- env HOME="\$\{NPM_CACHE_DIR\}" npm_config_cache="\$\{NPM_CACHE_DIR\}" npm/,
  );
  assert.match(deploy, /rm -rf -- "\$\{NPM_CACHE_DIR\}"/);
});

test('rollback cannot accept an old health snapshot and waits only a bounded time', () => {
  const removeHealth = rollback.indexOf('rm -f -- "${HEALTH_FILE}"');
  const startService = rollback.indexOf('systemctl start hengs-discord.service');
  assert.notEqual(removeHealth, -1);
  assert.equal(removeHealth < startService, true);
  assert.match(rollback, /for attempt in \{1\.\.6\}; do/);
  assert.match(rollback, /sleep 10/);
  assert.match(rollback, /ROLLBACK_HEALTH_FAILED/);
});
