const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateTrackedFiles } = require('../scripts/cloud/build-release');
const root = path.join(__dirname, '..');
const installer = fs.readFileSync(path.join(root, 'deploy/linux/install-host.sh'), 'utf8');
const deployer = fs.readFileSync(path.join(root, 'deploy/linux/deploy-release.sh'), 'utf8');

test('host bootstrap does not enable the Discord service before cutover', () => {
  assert.doesNotMatch(installer, /systemctl\s+enable(?:\s+--now)?\s+hengs-discord\.service/);
  assert.doesNotMatch(installer, /systemctl\s+start\s+hengs-discord\.service/);
});

test('release deploy links production state only after dependency lifecycle work', () => {
  const install = deployer.indexOf('npm --prefix "${STAGING_DIR}" ci');
  const testRun = deployer.indexOf('npm --prefix "${STAGING_DIR}" test');
  const prune = deployer.indexOf('npm --prefix "${STAGING_DIR}" prune --omit=dev');
  const stateLink = deployer.indexOf('ln -s "${STATE_DIR}" "${STAGING_DIR}/data"');
  assert.equal(install < testRun && testRun < prune && prune < stateLink, true);
});

test('release validation rejects project API credentials and bearer literals', () => {
  const credentials = [
    ['gsk', 'A'.repeat(32)].join('_'),
    ['sk-or-v1', 'b'.repeat(40)].join('-'),
    ['DEEPL_API_KEY=', 'c'.repeat(36), ':fx'].join(''),
    ['Bearer', 'd'.repeat(40)].join(' '),
    ['API_KEY=', 'e'.repeat(40)].join(''),
  ];

  for (const [index, content] of credentials.entries()) {
    const result = validateTrackedFiles([{ path: `src/credential-${index}.js`, content }]);
    assert.deepEqual(result, {
      ok: false,
      forbidden: [{ path: `src/credential-${index}.js`, reason: 'API_CREDENTIAL' }],
    });
  }
  assert.deepEqual(validateTrackedFiles([
    { path: '.env.example', content: 'GROQ_API_KEY=\nDEEPL_API_KEY=\n' },
  ]), { ok: true, forbidden: [] });
});

