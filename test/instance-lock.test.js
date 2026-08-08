const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { InstanceLockError, createInstanceLock } = require('../src/runtime/instance-lock');

function tempLock() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-instance-lock-'));
  return { directory, filePath: path.join(directory, '.dc-bot.lock') };
}

test('fresh lock owned by a live process blocks a second instance', () => {
  const f = tempLock();
  const first = createInstanceLock({ filePath: f.filePath, pid: 111, isPidAlive: () => true });
  const second = createInstanceLock({ filePath: f.filePath, pid: 222, isPidAlive: () => true });
  try {
    first.acquire();
    assert.throws(
      () => second.acquire(),
      error => error instanceof InstanceLockError && error.code === 'INSTANCE_ACTIVE' && error.pid === 111,
    );
  } finally {
    second.release();
    first.release();
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('stale lock is reclaimed even when Windows liveness returns EPERM-like true', () => {
  const f = tempLock();
  let clock = Date.parse('2026-08-09T00:10:00.000Z');
  fs.writeFileSync(f.filePath, '10196', 'utf8');
  const staleAt = new Date(clock - 301_000);
  fs.utimesSync(f.filePath, staleAt, staleAt);
  const lock = createInstanceLock({
    filePath: f.filePath,
    pid: 222,
    now: () => clock,
    isPidAlive: () => true,
  });
  try {
    assert.equal(lock.acquire(), true);
    assert.equal(fs.readFileSync(f.filePath, 'utf8'), '222');
    clock += 30_000;
    assert.equal(lock.touch(), true);
    assert.ok(Math.abs(fs.statSync(f.filePath).mtimeMs - clock) < 1_000);
  } finally {
    lock.release();
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('fresh lock whose owner is dead is reclaimed immediately', () => {
  const f = tempLock();
  fs.writeFileSync(f.filePath, '111', 'utf8');
  const lock = createInstanceLock({ filePath: f.filePath, pid: 222, isPidAlive: () => false });
  try {
    assert.equal(lock.acquire(), true);
    assert.equal(fs.readFileSync(f.filePath, 'utf8'), '222');
  } finally {
    lock.release();
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('only the current lock owner can remove or refresh the lock', () => {
  const f = tempLock();
  const owner = createInstanceLock({ filePath: f.filePath, pid: 111, isPidAlive: () => true });
  const stranger = createInstanceLock({ filePath: f.filePath, pid: 222, isPidAlive: () => true });
  try {
    owner.acquire();
    assert.equal(stranger.touch(), false);
    stranger.release();
    assert.equal(fs.existsSync(f.filePath), true);
  } finally {
    owner.release();
    assert.equal(fs.existsSync(f.filePath), false);
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});
