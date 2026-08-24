const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  const target = path.join(root, relativePath);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
}

test('public cloud guide is explicitly tracked and linked from README', () => {
  const ignore = read('.gitignore');
  const readme = read('README.md');
  assert.match(ignore, /^!docs\/CLOUD-DEPLOY\.md$/m);
  assert.match(readme, /\[.*cloud.*\]\(docs\/CLOUD-DEPLOY\.md\)/i);
  assert.match(readme, /Always Free/i);
  assert.doesNotMatch(readme, /(?:VM|cloud).*(?:sudah|currently)\s+(?:live|production)/i);
});

test('cloud guide records every canonical runtime path', () => {
  const guide = read('docs/CLOUD-DEPLOY.md');
  for (const required of [
    '/etc/hengs/discord.env',
    '/var/lib/hengs-discord/data',
    '/opt/hengs/discord-bot/releases/<release-id>',
    '/var/backups/hengs-discord',
    '/run/hengs-discord/instance.lock',
  ]) {
    assert.equal(guide.includes(required), true, `missing ${required}`);
  }
});

test('cloud guide covers acquisition, deployment, cutover, and recovery gates', () => {
  const guide = read('docs/CLOUD-DEPLOY.md');
  for (const heading of [
    'Prerequisites',
    'OCI Preflight',
    'Bounded Acquisition',
    'Host Bootstrap',
    'Secret Transfer',
    'State Transfer',
    'Deploy Release',
    'Health Verification',
    'Production Cutover',
    'Reboot Verification',
    'Rollback',
    'Encrypted Backup',
    'Incident Response',
  ]) {
    assert.match(guide, new RegExp(`^## ${heading}$`, 'm'));
  }
  assert.match(guide, /one Discord token consumer/i);
  assert.match(guide, /tidak mengubah mode,[\s\S]*Anti-Raid/i);
  assert.match(guide, /stop.*local.*before.*start.*cloud/is);
  assert.match(guide, /stop.*cloud.*before.*start.*local/is);
});

test('cloud guide excludes secrets and unsafe release instructions', () => {
  const guide = read('docs/CLOUD-DEPLOY.md');
  assert.doesNotMatch(guide, /\b(?:cp|tar|zip|rsync)\b[^\n]*\.env/i);
  assert.doesNotMatch(guide, /ocid1\.|BEGIN (?:OPENSSH |RSA )?PRIVATE KEY|DISCORD_TOKEN\s*=\s*\S+/i);
  assert.match(guide, /never.*\.env.*release archive/i);
});
