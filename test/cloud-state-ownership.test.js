const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  restoreState,
  snapshotState,
} = require('../scripts/cloud/state-transfer');

test('restore applies service ownership and restrictive modes before switching state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-state-owner-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  const archive = path.join(root, 'state.tar');
  fs.mkdirSync(source);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(source, 'ops-state.json'), '{}');
  fs.writeFileSync(path.join(target, 'old-state.json'), '{}');
  const snapshot = snapshotState({ dataDir: source, archive });
  const ownership = [];
  const permissions = [];
  const fsImpl = {
    ...fs,
    chownSync(file, uid, gid) {
      ownership.push({ file, uid, gid });
    },
    chmodSync(file, mode) {
      permissions.push({ file, mode });
      fs.chmodSync(file, mode);
    },
  };

  restoreState({
    archive,
    manifestFile: snapshot.manifestFile,
    targetDir: target,
    ownerUid: 123,
    ownerGid: 456,
    fsImpl,
  });

  assert.equal(ownership.length >= 2, true);
  assert.equal(ownership.every(entry => entry.uid === 123 && entry.gid === 456), true);
  assert.equal(permissions.some(entry => entry.mode === 0o750), true);
  assert.equal(permissions.some(entry => entry.mode === 0o640), true);
});

test('restore requires owner UID and GID together', () => {
  assert.throws(
    () => restoreState({ archive: 'C:\\state.tar', manifestFile: 'C:\\state.json', targetDir: 'C:\\target', ownerUid: 123 }),
    error => error.code === 'OWNERSHIP_INVALID',
  );
});

