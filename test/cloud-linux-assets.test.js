const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  const target = path.join(root, relativePath);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
}

const service = () => read('deploy/linux/hengs-discord.service');
const installer = () => read('deploy/linux/install-host.sh');
const deployer = () => read('deploy/linux/deploy-release.sh');
const inspector = () => read('deploy/linux/inspect-health.sh');
const rollback = () => read('deploy/linux/rollback.sh');

test('systemd service uses the dedicated identity and exact runtime paths', () => {
  const source = service();
  assert.match(source, /^User=hengs-discord$/m);
  assert.match(source, /^Group=hengs-discord$/m);
  assert.match(source, /^WorkingDirectory=\/opt\/hengs\/discord-bot\/current$/m);
  assert.match(source, /^EnvironmentFile=\/etc\/hengs\/discord\.env$/m);
  assert.match(source, /^ExecStart=\/usr\/bin\/node src\/index\.js --hengs-dc$/m);
  assert.match(source, /^Restart=on-failure$/m);
  assert.match(source, /^RuntimeDirectory=hengs-discord$/m);
  assert.match(source, /^StateDirectory=hengs-discord$/m);
  assert.match(source, /^ReadWritePaths=\/var\/lib\/hengs-discord \/run\/hengs-discord$/m);
});

test('systemd service applies bounded resources and process hardening', () => {
  const source = service();
  for (const required of [
    'NoNewPrivileges=true',
    'PrivateTmp=true',
    'ProtectSystem=strict',
    'ProtectHome=true',
    'ProtectKernelTunables=true',
    'ProtectKernelModules=true',
    'ProtectControlGroups=true',
    'RestrictSUIDSGID=true',
    'LimitNOFILE=4096',
    'MemoryMax=1G',
    'TasksMax=256',
    'UMask=0027',
  ]) {
    assert.match(source, new RegExp(`^${required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
  assert.doesNotMatch(source, /(DISCORD_TOKEN|DEEPL_API_KEY|OPENROUTER_API_KEY)\s*=/);
});

test('all host scripts fail closed and avoid dangerous shell patterns', () => {
  const scripts = [installer(), deployer(), inspector(), rollback()];
  for (const source of scripts) {
    assert.match(source, /^#!\/usr\/bin\/env bash\nset -euo pipefail\n/);
    assert.match(source, /\[\[ "\$\{EUID\}" -eq 0 \]\]/);
    assert.doesNotMatch(source, /curl[^\n]*\|\s*(?:sudo\s+)?(?:ba)?sh/);
    assert.doesNotMatch(source, /StrictHostKeyChecking\s*=\s*no|sshpass|--insecure|-k\s+https?:/);
    assert.doesNotMatch(source, /\beval\b/);
    assert.doesNotMatch(source, /(?:cp|tar)[^\n]*\.env/);
  }
});

test('host installer is idempotent, uses signed repositories, and preserves secrets', () => {
  const source = installer();
  assert.match(source, /node_22\.x/);
  assert.match(source, /signed-by=/);
  assert.match(source, /pkgs\.tailscale\.com\/stable\/ubuntu/);
  assert.match(source, /ca-certificates/);
  assert.match(source, /\bage\b/);
  assert.match(source, /ufw default deny incoming/);
  assert.match(source, /ufw allow OpenSSH/);
  assert.match(source, /if \[\[ ! -e "\$\{ENV_FILE\}" \]\]; then/);
  assert.match(source, /install -m 0640 -o root -g hengs-discord \/dev\/null "\$\{ENV_FILE\}"/);
  assert.doesNotMatch(source, /systemctl\s+(?:start|restart)\s+hengs-discord/);
});

test('release deploy verifies immutable input, tests it, and never starts production', () => {
  const source = deployer();
  assert.match(source, /sha256sum/);
  assert.match(source, /UNSAFE_ARCHIVE/);
  assert.match(source, /tar -t/);
  assert.match(source, /ln -s "\$\{STATE_DIR\}"/);
  assert.match(source, /npm --prefix "\$\{STAGING_DIR\}" ci/);
  assert.match(source, /npm --prefix "\$\{STAGING_DIR\}" test/);
  assert.match(source, /npm --prefix "\$\{STAGING_DIR\}" prune --omit=dev/);
  assert.match(source, /mv -Tf/);
  assert.doesNotMatch(source, /systemctl\s+(?:start|restart|enable\s+--now)/);
});

test('health inspection validates service schema, connection, and freshness safely', () => {
  const source = inspector();
  assert.match(source, /systemctl is-active --quiet hengs-discord\.service/);
  assert.match(source, /runtime-health\.json/);
  assert.match(source, /schemaVersion/);
  assert.match(source, /hengs-discord/);
  assert.match(source, /CONNECTED/);
  assert.match(source, /90_000/);
  assert.match(source, /version=.*state=.*code=.*age=/);
  assert.doesNotMatch(source, /console\.log\([^)]*(?:path|stack|message|raw)/i);
});

test('rollback validates a sibling release and stops service after failed health', () => {
  const source = rollback();
  assert.match(source, /RELEASE_ID/);
  assert.equal(source.includes('^1\\.[0-9]+\\.[0-9]+-[0-9a-f]{12}$'), true);
  assert.match(source, /systemctl stop hengs-discord\.service/);
  assert.match(source, /systemctl start hengs-discord\.service/);
  assert.match(source, /inspect-health\.sh/);
  assert.match(source, /if ! .*inspect-health/);
  assert.match(source, /systemctl stop hengs-discord\.service/);
});
