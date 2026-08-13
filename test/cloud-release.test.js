const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildRelease,
  validateTrackedFiles,
} = require('../scripts/cloud/build-release');

test('tracked-file validation rejects private paths and credential content', () => {
  const privateMarker = ['-----BEGIN OPENSSH ', 'PRIVATE KEY-----'].join('');
  const discordToken = ['ABCDEFGHIJKLMNOPQRSTUVWX', 'abcdef', 'abcdefghijklmnopqrstuvwx'].join('.');
  const oracleId = ['ocid', '1.instance.oc1.test'].join('');
  const result = validateTrackedFiles([
    { path: '.env', content: 'TOKEN=value' },
    { path: '.cloud/state.json', content: '{}' },
    { path: 'data/events-state.json', content: '{}' },
    { path: 'logs/bot.log', content: '' },
    { path: 'deploy/server.pem', content: '' },
    { path: 'keys/id_rsa_backup', content: '' },
    { path: '.dc-bot.lock', content: '1234' },
    { path: 'docs/superpowers/plan.md', content: '' },
    { path: 'src/private.js', content: privateMarker },
    { path: 'src/token.js', content: discordToken },
    { path: 'src/cloud.js', content: oracleId },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.forbidden.length, 11);
  assert.deepEqual(
    new Set(result.forbidden.map(item => item.reason)),
    new Set(['FORBIDDEN_PATH', 'PRIVATE_KEY', 'DISCORD_TOKEN', 'OCI_IDENTIFIER']),
  );
});

test('tracked-file validation permits sanitized public project files', () => {
  assert.deepEqual(validateTrackedFiles([
    { path: '.env.example', content: 'DISCORD_TOKEN=\n' },
    { path: 'src/index.js', content: "console.log('ready');\n" },
    { path: 'docs/CLOUD-DEPLOY.md', content: 'No account identifiers.\n' },
  ]), { ok: true, forbidden: [] });
});

function createGitFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-release-'));
  const outputDir = path.join(root, '.cloud', 'releases');
  const calls = [];
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const tracked = options.tracked || ['package.json', 'src/index.js'];
  const contents = {
    'package.json': JSON.stringify({ version: options.version || '1.17.2' }),
    'src/index.js': "'use strict';\n",
    ...(options.contents || {}),
  };

  function spawnSync(command, args, spawnOptions) {
    calls.push({ command, args, options: spawnOptions });
    if (args[0] === 'status') {
      return { status: 0, stdout: options.status || '', stderr: '' };
    }
    if (args[0] === 'rev-parse') return { status: 0, stdout: `${commit}\n`, stderr: '' };
    if (args[0] === 'ls-tree') return { status: 0, stdout: `${tracked.join('\n')}\n`, stderr: '' };
    if (args[0] === 'show') {
      const name = args[1].slice('HEAD:'.length);
      return { status: 0, stdout: contents[name] || '', stderr: '' };
    }
    if (args[0] === 'archive') {
      const outputIndex = args.indexOf('--output');
      fs.mkdirSync(path.dirname(args[outputIndex + 1]), { recursive: true });
      fs.writeFileSync(args[outputIndex + 1], Buffer.from('deterministic archive fixture'));
      return { status: 0, stdout: '', stderr: '' };
    }
    throw new Error(`Unexpected git call: ${args.join(' ')}`);
  }
  return { root, outputDir, calls, commit, spawnSync };
}

test('release builder archives committed HEAD and writes a SHA-256 sidecar', () => {
  const fixture = createGitFixture();
  const result = buildRelease(fixture);
  const expectedArchive = `hengs-discord-1.17.2-${fixture.commit.slice(0, 12)}.tar.gz`;

  assert.equal(path.basename(result.archive), expectedArchive);
  assert.equal(result.commit, fixture.commit);
  assert.equal(result.version, '1.17.2');
  assert.equal(fs.existsSync(result.archive), true);
  assert.equal(fs.existsSync(result.checksumFile), true);
  const expectedHash = crypto.createHash('sha256')
    .update(fs.readFileSync(result.archive))
    .digest('hex');
  assert.equal(
    fs.readFileSync(result.checksumFile, 'utf8'),
    `${expectedHash}  ${expectedArchive}\n`,
  );

  const statusCall = fixture.calls.find(call => call.args[0] === 'status');
  assert.deepEqual(statusCall.args, ['status', '--porcelain', '--untracked-files=no']);
  const archiveCall = fixture.calls.find(call => call.args[0] === 'archive');
  assert.deepEqual(archiveCall.args.slice(0, 2), ['archive', '--format=tar.gz']);
  assert.equal(archiveCall.args.at(-1), 'HEAD');
  assert.equal(archiveCall.options.shell, false);
});

test('release builder rejects tracked modifications before archive creation', () => {
  const fixture = createGitFixture({ status: ' M src/index.js\n' });
  assert.throws(() => buildRelease(fixture), error => error.code === 'TRACKED_TREE_DIRTY');
  assert.equal(fixture.calls.some(call => call.args[0] === 'archive'), false);
});

test('release builder requires the exact checkpoint version', () => {
  const fixture = createGitFixture({ version: '1.14.0' });
  assert.throws(() => buildRelease(fixture), error => error.code === 'VERSION_INVALID');
  assert.equal(fixture.calls.some(call => call.args[0] === 'archive'), false);
});


test('release metadata pins Node 22 and checkpoint version consistently', () => {
  const root = path.join(__dirname, '..');
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lockMetadata = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim(), '22');
  assert.equal(packageMetadata.version, '1.17.2');
  assert.deepEqual(packageMetadata.engines, { node: '>=22 <23' });
  assert.equal(lockMetadata.version, '1.17.2');
  assert.equal(lockMetadata.packages[''].version, '1.17.2');
  assert.deepEqual(lockMetadata.packages[''].engines, { node: '>=22 <23' });
});
