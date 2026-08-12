const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseCliArgs } = require('../scripts/cloud/state-transfer');

test('production state restore requires explicit service UID and GID', () => {
  const base = [
    'restore',
    '--archive', '/tmp/hengs-state.tar',
    '--manifest', '/tmp/hengs-state.tar.manifest.json',
    '--target-dir', '/var/lib/hengs-discord/data',
  ];
  assert.throws(() => parseCliArgs(base), error => error.message === 'CLI_INVALID');
  const parsed = parseCliArgs([...base, '--uid', '123', '--gid', '456']);
  assert.equal(parsed.values['--uid'], '123');
  assert.equal(parsed.values['--gid'], '456');
});

test('public runbook states the mandatory production ownership gate', () => {
  const guide = fs.readFileSync(path.join(__dirname, '..', 'docs/CLOUD-DEPLOY.md'), 'utf8');
  assert.match(guide, /production restore.*requires both `--uid` and `--gid`/i);
});

