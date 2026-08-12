const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  createManifest,
  encryptStateArchive,
  parseCliArgs,
  restoreState,
  selectStateEntries,
  snapshotState,
  validateManifest,
  verifyStateArchive,
} = require('../scripts/cloud/state-transfer');

function tempDir(prefix = 'hengs-state-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(root, name, value = {}) {
  const file = path.join(root, ...name.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
  return file;
}

test('state selection includes persistent JSON and excludes transient or unsafe entries', t => {
  const dataDir = tempDir();
  for (const name of [
    'ops-state.json',
    'events-state.json',
    'Z-state.json',
    'a-state.json',
    'reports-state.json',
    'reaction-roles.json',
    'nested/preferences.json',
  ]) writeJson(dataDir, name, { name });
  for (const name of [
    'runtime-health.json',
    'write.tmp',
    'processing-event.json',
    'event.json.processing-123',
    'canox-event-inbox.json',
    'worker.lock',
    'logs/private.json',
  ]) writeJson(dataDir, name, { excluded: true });
  fs.writeFileSync(path.join(dataDir, 'note.txt'), 'ignore');

  try {
    fs.symlinkSync(path.join(dataDir, 'ops-state.json'), path.join(dataDir, 'linked.json'), 'file');
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    const external = tempDir('hengs-symlink-target-');
    writeJson(external, 'outside.json', { outside: true });
    fs.symlinkSync(external, path.join(dataDir, 'linked-dir'), 'junction');
    t.diagnostic('Used a Windows junction because file symlinks require elevated privileges');
  }

  assert.deepEqual(selectStateEntries(dataDir), [
    'Z-state.json',
    'a-state.json',
    'events-state.json',
    'nested/preferences.json',
    'ops-state.json',
    'reaction-roles.json',
    'reports-state.json',
  ]);
});

test('manifest is deterministic, bounded, and rejects unsafe or duplicate names', () => {
  const dataDir = tempDir();
  writeJson(dataDir, 'ops-state.json', { revision: 2 });
  const manifest = createManifest(['ops-state.json'], {
    dataDir,
    now: () => Date.parse('2026-08-12T00:00:00.000Z'),
  });
  const bytes = fs.readFileSync(path.join(dataDir, 'ops-state.json'));
  assert.deepEqual(manifest, {
    schemaVersion: 1,
    createdAt: '2026-08-12T00:00:00.000Z',
    files: [{
      name: 'ops-state.json',
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    }],
  });
  assert.deepEqual(validateManifest(manifest), manifest);

  for (const name of ['../escape.json', '/absolute.json', 'nested\\escape.json']) {
    assert.throws(
      () => validateManifest({ ...manifest, files: [{ ...manifest.files[0], name }] }),
      error => error.code === 'MANIFEST_INVALID',
    );
  }
  assert.throws(
    () => validateManifest({ ...manifest, files: [manifest.files[0], manifest.files[0]] }),
    error => error.code === 'MANIFEST_INVALID',
  );
  assert.throws(
    () => validateManifest({
      ...manifest,
      files: [{ ...manifest.files[0], size: 100 * 1024 * 1024 + 1 }],
    }),
    error => error.code === 'ARCHIVE_TOO_LARGE',
  );
});

test('snapshot invokes tar without a shell and writes mode-0600 archive and manifest', () => {
  const dataDir = tempDir();
  writeJson(dataDir, 'ops-state.json', { revision: 1 });
  const outputDir = tempDir('hengs-snapshot-');
  const archive = path.join(outputDir, 'state.tar');
  let captured;
  const chmodCalls = [];
  const trackedFs = {
    ...fs,
    chmodSync(filePath, mode) {
      chmodCalls.push({ filePath, mode });
      fs.chmodSync(filePath, mode);
    },
  };
  const fakeSpawn = (command, args, options) => {
    captured = { command, args, options };
    fs.writeFileSync(archive, 'tar fixture');
    return { status: 0, stdout: '', stderr: '' };
  };

  const result = snapshotState({ dataDir, archive, spawnSync: fakeSpawn, fsImpl: trackedFs });
  assert.equal(captured.command, 'tar');
  assert.deepEqual(captured.args.slice(0, 4), ['-cf', archive, '-C', path.resolve(dataDir)]);
  assert.equal(captured.args.includes('-T'), true);
  assert.equal(captured.options.shell, false);
  assert.equal(chmodCalls.some(call => call.filePath === result.archive && call.mode === 0o600), true);
  assert.equal(chmodCalls.some(call => call.filePath === result.manifestFile && call.mode === 0o600), true);
  assert.equal(fs.existsSync(captured.args[captured.args.indexOf('-T') + 1]), false);
});

test('snapshot, verification, and restore preserve valid state atomically', () => {
  const dataDir = tempDir();
  writeJson(dataDir, 'ops-state.json', { revision: 4 });
  writeJson(dataDir, 'nested/events-state.json', { events: [] });
  const outputDir = tempDir('hengs-snapshot-live-');
  const archive = path.join(outputDir, 'state.tar');
  const snapshot = snapshotState({ dataDir, archive });

  const verified = verifyStateArchive({
    archive: snapshot.archive,
    manifestFile: snapshot.manifestFile,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.fileCount, 2);

  const targetDir = path.join(tempDir('hengs-restore-'), 'data');
  writeJson(targetDir, 'old-state.json', { old: true });
  const restored = restoreState({
    archive: snapshot.archive,
    manifestFile: snapshot.manifestFile,
    targetDir,
    now: () => Date.parse('2026-08-12T01:02:03.000Z'),
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(targetDir, 'ops-state.json'))), { revision: 4 });
  assert.equal(fs.existsSync(path.join(targetDir, 'old-state.json')), false);
  assert.equal(fs.existsSync(path.join(restored.backupDir, 'old-state.json')), true);
});

test('checksum or JSON failure leaves the current target untouched', () => {
  const dataDir = tempDir();
  writeJson(dataDir, 'ops-state.json', { revision: 1 });
  const outputDir = tempDir('hengs-corrupt-');
  const archive = path.join(outputDir, 'state.tar');
  const snapshot = snapshotState({ dataDir, archive });
  const manifest = JSON.parse(fs.readFileSync(snapshot.manifestFile, 'utf8'));
  manifest.files[0].sha256 = '0'.repeat(64);
  fs.writeFileSync(snapshot.manifestFile, JSON.stringify(manifest));

  const targetDir = path.join(tempDir('hengs-current-'), 'data');
  writeJson(targetDir, 'current.json', { keep: true });
  assert.throws(
    () => restoreState({ archive, manifestFile: snapshot.manifestFile, targetDir }),
    error => error.code === 'CHECKSUM_MISMATCH',
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(targetDir, 'current.json'))), { keep: true });
});

test('verification rejects unexpected and duplicate archive entries', () => {
  const dataDir = tempDir();
  writeJson(dataDir, 'ops-state.json', { ok: true });
  writeJson(dataDir, 'extra.json', { no: true });
  const manifest = createManifest(['ops-state.json'], { dataDir });
  const manifestFile = path.join(dataDir, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));

  const unexpected = path.join(dataDir, 'unexpected.tar');
  assert.equal(spawnSync('tar', ['-cf', unexpected, '-C', dataDir, 'ops-state.json', 'extra.json']).status, 0);
  assert.throws(
    () => verifyStateArchive({ archive: unexpected, manifestFile }),
    error => error.code === 'ARCHIVE_ENTRIES_INVALID',
  );

  const duplicate = path.join(dataDir, 'duplicate.tar');
  assert.equal(spawnSync('tar', ['-cf', duplicate, '-C', dataDir, 'ops-state.json', 'ops-state.json']).status, 0);
  assert.throws(
    () => verifyStateArchive({ archive: duplicate, manifestFile }),
    error => error.code === 'ARCHIVE_ENTRIES_INVALID',
  );
});

test('invalid JSON inside an otherwise matching archive is rejected', () => {
  const dataDir = tempDir();
  fs.writeFileSync(path.join(dataDir, 'ops-state.json'), '{broken');
  const bytes = fs.readFileSync(path.join(dataDir, 'ops-state.json'));
  const manifest = {
    schemaVersion: 1,
    createdAt: '2026-08-12T00:00:00.000Z',
    files: [{
      name: 'ops-state.json',
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    }],
  };
  const manifestFile = path.join(dataDir, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const archive = path.join(dataDir, 'invalid-json.tar');
  assert.equal(spawnSync('tar', ['-cf', archive, '-C', dataDir, 'ops-state.json']).status, 0);

  assert.throws(
    () => verifyStateArchive({ archive, manifestFile }),
    error => error.code === 'STATE_JSON_INVALID',
  );
});

test('encrypted export requires an age recipient and has no plaintext fallback', () => {
  const dir = tempDir();
  const archive = path.join(dir, 'state.tar');
  const output = path.join(dir, 'state.tar.age');
  fs.writeFileSync(archive, 'private state');
  const recipient = `age1${'q'.repeat(58)}`;

  assert.throws(
    () => encryptStateArchive({ archive, output, recipient: 'not-an-age-recipient' }),
    error => error.code === 'RECIPIENT_INVALID',
  );
  assert.throws(
    () => encryptStateArchive({
      archive,
      output,
      recipient,
      spawnSync: () => ({ status: null, error: { code: 'ENOENT' }, stdout: '', stderr: '' }),
    }),
    error => error.code === 'AGE_UNAVAILABLE',
  );
  assert.equal(fs.existsSync(output), false);

  let captured;
  const result = encryptStateArchive({
    archive,
    output,
    recipient,
    spawnSync: (command, args, options) => {
      captured = { command, args, options };
      fs.writeFileSync(output, 'encrypted fixture');
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  assert.equal(captured.command, 'age');
  assert.deepEqual(captured.args, ['-r', recipient, '-o', output, archive]);
  assert.equal(captured.options.shell, false);
  assert.equal(result.output, output);
});

test('CLI parser accepts only explicit absolute paths for all four modes', () => {
  const root = tempDir();
  const archive = path.join(root, 'state.tar');
  const manifest = `${archive}.manifest.json`;
  assert.equal(parseCliArgs(['snapshot', '--data-dir', root, '--output', archive]).mode, 'snapshot');
  assert.equal(parseCliArgs(['verify', '--archive', archive, '--manifest', manifest]).mode, 'verify');
  assert.equal(parseCliArgs(['restore', '--archive', archive, '--manifest', manifest, '--target-dir', path.join(root, 'data')]).mode, 'restore');
  assert.equal(parseCliArgs(['encrypt', '--archive', archive, '--output', `${archive}.age`, '--recipient', `age1${'q'.repeat(58)}`]).mode, 'encrypt');
  assert.throws(() => parseCliArgs(['snapshot', '--data-dir', 'relative', '--output', archive]), /CLI_INVALID/);
  assert.throws(() => parseCliArgs(['verify', '--archive', archive, '--manifest', manifest, '--extra', 'x']), /CLI_INVALID/);
});

