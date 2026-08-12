#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync: defaultSpawnSync } = require('node:child_process');

const SCHEMA_VERSION = 1;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 1000;
const MAX_PATH_LENGTH = 240;
const TAR_TIMEOUT_MS = 120_000;
const PROCESS_BUFFER_BYTES = 1024 * 1024;

class StateTransferError extends Error {
  constructor(code) {
    super(code);
    this.name = 'StateTransferError';
    this.code = code;
  }
}

function safeRelativeName(name) {
  if (typeof name !== 'string' || !name || name.length > MAX_PATH_LENGTH) return null;
  if (name.includes('\\') || name.includes('\0') || name.includes('\r') || name.includes('\n')) return null;
  if (path.posix.isAbsolute(name) || path.win32.isAbsolute(name)) return null;
  const normalized = path.posix.normalize(name);
  if (normalized !== name || normalized === '..' || normalized.startsWith('../')) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(normalized)) return null;
  return normalized;
}

function compareStateNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isExcluded(name) {
  const lower = name.toLowerCase();
  const basename = path.posix.basename(lower);
  const segments = lower.split('/');
  return basename === 'runtime-health.json'
    || basename.endsWith('.tmp')
    || basename.includes('.tmp-')
    || basename.startsWith('processing-')
    || basename.includes('.processing-')
    || /^canox-.*-inbox\.json$/.test(basename)
    || basename.endsWith('.lock')
    || segments.includes('logs');
}

function parseJsonFile(fsImpl, file) {
  try {
    JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  } catch {
    throw new StateTransferError('STATE_JSON_INVALID');
  }
}

function selectStateEntries(dataDir, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const root = path.resolve(dataDir);
  let rootStat;
  try {
    rootStat = fsImpl.lstatSync(root);
  } catch {
    throw new StateTransferError('DATA_DIR_INVALID');
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new StateTransferError('DATA_DIR_INVALID');
  }

  const entries = [];
  let totalBytes = 0;
  function walk(directory, relativeDirectory = '', depth = 0) {
    if (depth > 8) throw new StateTransferError('STATE_PATH_INVALID');
    for (const dirent of fsImpl.readdirSync(directory, { withFileTypes: true })) {
      const relative = relativeDirectory
        ? `${relativeDirectory}/${dirent.name}`
        : dirent.name;
      const safeName = safeRelativeName(relative);
      if (!safeName) throw new StateTransferError('STATE_PATH_INVALID');
      const absolute = path.join(directory, dirent.name);
      const stat = fsImpl.lstatSync(absolute);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (!isExcluded(`${safeName}/`)) walk(absolute, safeName, depth + 1);
        continue;
      }
      if (!stat.isFile() || isExcluded(safeName) || path.posix.extname(safeName).toLowerCase() !== '.json') {
        continue;
      }
      totalBytes += stat.size;
      if (totalBytes > MAX_ARCHIVE_BYTES) throw new StateTransferError('ARCHIVE_TOO_LARGE');
      if (entries.length >= MAX_FILES) throw new StateTransferError('TOO_MANY_FILES');
      parseJsonFile(fsImpl, absolute);
      entries.push(safeName);
    }
  }
  walk(root);
  entries.sort(compareStateNames);
  return entries;
}

function sha256(fsImpl, file) {
  return crypto.createHash('sha256').update(fsImpl.readFileSync(file)).digest('hex');
}

function createManifest(entries, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const dataDir = path.resolve(options.dataDir || '.');
  const now = options.now || Date.now;
  const files = entries.map(name => {
    const safeName = safeRelativeName(name);
    if (!safeName) throw new StateTransferError('MANIFEST_INVALID');
    const file = path.resolve(dataDir, ...safeName.split('/'));
    if (path.relative(dataDir, file).startsWith('..')) throw new StateTransferError('MANIFEST_INVALID');
    const stat = fsImpl.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new StateTransferError('MANIFEST_INVALID');
    return { name: safeName, size: stat.size, sha256: sha256(fsImpl, file) };
  });
  return validateManifest({
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date(now()).toISOString(),
    files,
  });
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function validateManifest(manifest) {
  if (!exactKeys(manifest, ['schemaVersion', 'createdAt', 'files'])
      || manifest.schemaVersion !== SCHEMA_VERSION
      || typeof manifest.createdAt !== 'string'
      || !Number.isFinite(Date.parse(manifest.createdAt))
      || new Date(manifest.createdAt).toISOString() !== manifest.createdAt
      || !Array.isArray(manifest.files)
      || manifest.files.length < 1
      || manifest.files.length > MAX_FILES) {
    throw new StateTransferError('MANIFEST_INVALID');
  }

  let totalBytes = 0;
  let previous = null;
  for (const entry of manifest.files) {
    const safeName = exactKeys(entry, ['name', 'size', 'sha256']) && safeRelativeName(entry.name);
    if (!safeName
        || !Number.isInteger(entry.size)
        || entry.size < 0
        || !/^[0-9a-f]{64}$/.test(entry.sha256)
        || (previous !== null && compareStateNames(safeName, previous) <= 0)) {
      throw new StateTransferError('MANIFEST_INVALID');
    }
    totalBytes += entry.size;
    if (totalBytes > MAX_ARCHIVE_BYTES) throw new StateTransferError('ARCHIVE_TOO_LARGE');
    previous = safeName;
  }
  return manifest;
}

function atomicWriteJson(fsImpl, file, value) {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  let fd;
  try {
    fd = fsImpl.openSync(temporary, 'wx', 0o600);
    fsImpl.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsImpl.fsyncSync(fd);
    fsImpl.closeSync(fd);
    fd = undefined;
    fsImpl.renameSync(temporary, file);
    fsImpl.chmodSync(file, 0o600);
  } catch (error) {
    if (fd !== undefined) {
      try { fsImpl.closeSync(fd); } catch {}
    }
    try { fsImpl.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
}

function runTar(args, options = {}) {
  const spawnSync = options.spawnSync || defaultSpawnSync;
  const result = spawnSync('tar', args, {
    shell: false,
    encoding: 'utf8',
    timeout: TAR_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: PROCESS_BUFFER_BYTES,
  });
  if (result.error && result.error.code === 'ENOENT') throw new StateTransferError('TAR_UNAVAILABLE');
  if (result.error || result.status !== 0) throw new StateTransferError('TAR_FAILED');
  return result.stdout || '';
}

function assertAbsoluteFilePath(value, code = 'PATH_INVALID') {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new StateTransferError(code);
  return path.resolve(value);
}

function snapshotState(options) {
  const fsImpl = options.fsImpl || fs;
  const dataDir = assertAbsoluteFilePath(options.dataDir, 'DATA_DIR_INVALID');
  const archive = assertAbsoluteFilePath(options.archive);
  const manifestFile = assertAbsoluteFilePath(options.manifestFile || `${archive}.manifest.json`);
  if (path.extname(archive).toLowerCase() !== '.tar') throw new StateTransferError('PATH_INVALID');
  const relativeArchive = path.relative(dataDir, archive);
  if (relativeArchive && !relativeArchive.startsWith('..') && !path.isAbsolute(relativeArchive)) {
    throw new StateTransferError('PATH_INVALID');
  }
  if (fsImpl.existsSync(archive) || fsImpl.existsSync(manifestFile)) {
    throw new StateTransferError('OUTPUT_EXISTS');
  }

  const entries = selectStateEntries(dataDir, { fsImpl });
  if (entries.length === 0) throw new StateTransferError('NO_STATE_FILES');
  const manifest = createManifest(entries, { dataDir, fsImpl, now: options.now });
  fsImpl.mkdirSync(path.dirname(archive), { recursive: true, mode: 0o700 });
  const listFile = path.join(path.dirname(archive), `.state-list-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`);
  try {
    fsImpl.writeFileSync(listFile, `${entries.join('\n')}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    runTar(['-cf', archive, '-C', dataDir, '-T', listFile], { spawnSync: options.spawnSync });
    const archiveStat = fsImpl.statSync(archive);
    if (!archiveStat.isFile() || archiveStat.size > MAX_ARCHIVE_BYTES) {
      throw new StateTransferError('ARCHIVE_TOO_LARGE');
    }
    fsImpl.chmodSync(archive, 0o600);
    atomicWriteJson(fsImpl, manifestFile, manifest);
  } catch (error) {
    try { fsImpl.rmSync(archive, { force: true }); } catch {}
    try { fsImpl.rmSync(manifestFile, { force: true }); } catch {}
    if (error instanceof StateTransferError) throw error;
    throw new StateTransferError('SNAPSHOT_FAILED');
  } finally {
    try { fsImpl.rmSync(listFile, { force: true }); } catch {}
  }
  return { archive, manifestFile, manifest };
}

function readManifest(fsImpl, manifestFile) {
  try {
    const stat = fsImpl.statSync(manifestFile);
    if (!stat.isFile() || stat.size > PROCESS_BUFFER_BYTES) throw new StateTransferError('MANIFEST_INVALID');
    return validateManifest(JSON.parse(fsImpl.readFileSync(manifestFile, 'utf8')));
  } catch (error) {
    if (error instanceof StateTransferError) throw error;
    throw new StateTransferError('MANIFEST_INVALID');
  }
}

function archiveEntries(archive, options = {}) {
  const names = runTar(['-tf', archive], options)
    .split(/\r?\n/)
    .filter(Boolean);
  const verbose = runTar(['-tvf', archive], options)
    .split(/\r?\n/)
    .filter(Boolean);
  if (verbose.length !== names.length || verbose.some(line => line[0] !== '-')) {
    throw new StateTransferError('ARCHIVE_ENTRIES_INVALID');
  }
  const safeNames = names.map(safeRelativeName);
  if (safeNames.some(name => !name) || new Set(safeNames).size !== safeNames.length) {
    throw new StateTransferError('ARCHIVE_ENTRIES_INVALID');
  }
  return safeNames;
}

function verifyExtracted(fsImpl, stagingDir, manifest) {
  const actualEntries = selectStateEntries(stagingDir, { fsImpl });
  const expectedEntries = manifest.files.map(entry => entry.name);
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new StateTransferError('ARCHIVE_ENTRIES_INVALID');
  }
  for (const entry of manifest.files) {
    const file = path.join(stagingDir, ...entry.name.split('/'));
    const stat = fsImpl.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.size) {
      throw new StateTransferError('CHECKSUM_MISMATCH');
    }
    if (sha256(fsImpl, file) !== entry.sha256) throw new StateTransferError('CHECKSUM_MISMATCH');
    parseJsonFile(fsImpl, file);
  }
}

function extractVerified(options) {
  const fsImpl = options.fsImpl || fs;
  const archive = assertAbsoluteFilePath(options.archive);
  const manifestFile = assertAbsoluteFilePath(options.manifestFile);
  const archiveStat = fsImpl.statSync(archive);
  if (!archiveStat.isFile() || archiveStat.size > MAX_ARCHIVE_BYTES) {
    throw new StateTransferError('ARCHIVE_TOO_LARGE');
  }
  const manifest = readManifest(fsImpl, manifestFile);
  const listed = archiveEntries(archive, { spawnSync: options.spawnSync });
  const expected = manifest.files.map(entry => entry.name);
  if (JSON.stringify(listed) !== JSON.stringify(expected)) {
    throw new StateTransferError('ARCHIVE_ENTRIES_INVALID');
  }

  const tempRoot = path.resolve(options.tempRoot || os.tmpdir());
  fsImpl.mkdirSync(tempRoot, { recursive: true, mode: 0o700 });
  const stagingDir = fsImpl.mkdtempSync(path.join(tempRoot, '.hengs-state-verify-'));
  try {
    runTar(['-xf', archive, '-C', stagingDir, '--no-same-owner', '--no-same-permissions'], {
      spawnSync: options.spawnSync,
    });
    verifyExtracted(fsImpl, stagingDir, manifest);
    return { stagingDir, manifest };
  } catch (error) {
    try { fsImpl.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
    if (error instanceof StateTransferError) throw error;
    throw new StateTransferError('VERIFY_FAILED');
  }
}

function verifyStateArchive(options) {
  const fsImpl = options.fsImpl || fs;
  const extracted = extractVerified(options);
  try {
    return { ok: true, fileCount: extracted.manifest.files.length };
  } finally {
    fsImpl.rmSync(extracted.stagingDir, { recursive: true, force: true });
  }
}

function fsyncTree(fsImpl, root) {
  for (const name of selectStateEntries(root, { fsImpl })) {
    const fd = fsImpl.openSync(path.join(root, ...name.split('/')), 'r+');
    try { fsImpl.fsyncSync(fd); } finally { fsImpl.closeSync(fd); }
  }
}

function normalizeOwnership(options) {
  const hasUid = options.ownerUid !== undefined;
  const hasGid = options.ownerGid !== undefined;
  if (hasUid !== hasGid) throw new StateTransferError('OWNERSHIP_INVALID');
  if (!hasUid) return null;
  if (!Number.isInteger(options.ownerUid) || options.ownerUid < 0
      || !Number.isInteger(options.ownerGid) || options.ownerGid < 0) {
    throw new StateTransferError('OWNERSHIP_INVALID');
  }
  return { uid: options.ownerUid, gid: options.ownerGid };
}

function prepareRestoredTree(fsImpl, root, ownership) {
  const directories = new Set([root]);
  const files = selectStateEntries(root, { fsImpl }).map(name => {
    const parts = name.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(path.join(root, ...parts.slice(0, index)));
    }
    return path.join(root, ...parts);
  });
  for (const directory of directories) {
    fsImpl.chmodSync(directory, 0o750);
    if (ownership) fsImpl.chownSync(directory, ownership.uid, ownership.gid);
  }
  for (const file of files) {
    fsImpl.chmodSync(file, 0o640);
    if (ownership) fsImpl.chownSync(file, ownership.uid, ownership.gid);
  }
}

function restoreState(options) {
  const fsImpl = options.fsImpl || fs;
  const ownership = normalizeOwnership(options);
  const targetDir = assertAbsoluteFilePath(options.targetDir, 'TARGET_INVALID');
  const parent = path.dirname(targetDir);
  fsImpl.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (fsImpl.existsSync(targetDir) && fsImpl.lstatSync(targetDir).isSymbolicLink()) {
    throw new StateTransferError('TARGET_INVALID');
  }

  const extracted = extractVerified({ ...options, tempRoot: parent });
  const now = options.now || Date.now;
  const stamp = new Date(now()).toISOString().replace(/[-:.TZ]/g, '');
  const backupDir = `${targetDir}.backup-${stamp}`;
  if (fsImpl.existsSync(backupDir)) {
    fsImpl.rmSync(extracted.stagingDir, { recursive: true, force: true });
    throw new StateTransferError('BACKUP_EXISTS');
  }

  let movedCurrent = false;
  try {
    prepareRestoredTree(fsImpl, extracted.stagingDir, ownership);
    fsyncTree(fsImpl, extracted.stagingDir);
    if (fsImpl.existsSync(targetDir)) {
      fsImpl.renameSync(targetDir, backupDir);
      movedCurrent = true;
    }
    fsImpl.renameSync(extracted.stagingDir, targetDir);
    return { targetDir, backupDir: movedCurrent ? backupDir : null };
  } catch (error) {
    try {
      if (movedCurrent && !fsImpl.existsSync(targetDir) && fsImpl.existsSync(backupDir)) {
        fsImpl.renameSync(backupDir, targetDir);
      }
    } catch {}
    try { fsImpl.rmSync(extracted.stagingDir, { recursive: true, force: true }); } catch {}
    if (error instanceof StateTransferError) throw error;
    throw new StateTransferError('RESTORE_FAILED');
  }
}

function encryptStateArchive(options) {
  const fsImpl = options.fsImpl || fs;
  const archive = assertAbsoluteFilePath(options.archive);
  const output = assertAbsoluteFilePath(options.output);
  const recipient = options.recipient;
  if (typeof recipient !== 'string' || !/^age1[023456789acdefghjklmnpqrstuvwxyz]{50,90}$/.test(recipient)) {
    throw new StateTransferError('RECIPIENT_INVALID');
  }
  const stat = fsImpl.statSync(archive);
  if (!stat.isFile() || stat.size > MAX_ARCHIVE_BYTES) throw new StateTransferError('ARCHIVE_TOO_LARGE');
  if (fsImpl.existsSync(output)) throw new StateTransferError('OUTPUT_EXISTS');
  fsImpl.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const spawnSync = options.spawnSync || defaultSpawnSync;
  const result = spawnSync('age', ['-r', recipient, '-o', output, archive], {
    shell: false,
    encoding: 'utf8',
    timeout: TAR_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: PROCESS_BUFFER_BYTES,
  });
  if (result.error || result.status !== 0 || !fsImpl.existsSync(output)) {
    try { fsImpl.rmSync(output, { force: true }); } catch {}
    if (result.error && result.error.code === 'ENOENT') throw new StateTransferError('AGE_UNAVAILABLE');
    throw new StateTransferError('ENCRYPT_FAILED');
  }
  fsImpl.chmodSync(output, 0o600);
  return { output };
}

function parseCliArgs(argv) {
  const [mode, ...rest] = argv;
  const allowed = {
    snapshot: new Set(['--data-dir', '--output']),
    verify: new Set(['--archive', '--manifest']),
    restore: new Set(['--archive', '--manifest', '--target-dir', '--uid', '--gid']),
    encrypt: new Set(['--archive', '--output', '--recipient']),
  };
  if (!Object.hasOwn(allowed, mode) || rest.length % 2 !== 0) throw new Error('CLI_INVALID');
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!allowed[mode].has(key) || Object.hasOwn(values, key) || !value) throw new Error('CLI_INVALID');
    values[key] = value;
  }
  const required = mode === 'restore'
    ? ['--archive', '--manifest', '--target-dir']
    : [...allowed[mode]];
  if (required.some(key => !Object.hasOwn(values, key))) throw new Error('CLI_INVALID');
  if (mode !== 'restore' && Object.keys(values).length !== allowed[mode].size) throw new Error('CLI_INVALID');
  if (mode === 'restore') {
    const hasUid = Object.hasOwn(values, '--uid');
    const hasGid = Object.hasOwn(values, '--gid');
    const normalizedTarget = values['--target-dir'].replaceAll('\\', '/');
    const isProductionTarget = normalizedTarget === '/var/lib/hengs-discord'
      || normalizedTarget.startsWith('/var/lib/hengs-discord/');
    if (hasUid !== hasGid || (isProductionTarget && !hasUid)) throw new Error('CLI_INVALID');
  }
  for (const [key, value] of Object.entries(values)) {
    if (key === '--recipient') continue;
    if (key === '--uid' || key === '--gid') {
      if (!/^\d+$/.test(value)) throw new Error('CLI_INVALID');
    } else if (!path.isAbsolute(value)) {
      throw new Error('CLI_INVALID');
    }
  }
  return { mode, values };
}

function main(argv = process.argv.slice(2)) {
  try {
    const { mode, values } = parseCliArgs(argv);
    if (mode === 'snapshot') {
      snapshotState({ dataDir: values['--data-dir'], archive: values['--output'] });
      console.log(JSON.stringify({ ok: true, code: 'SUCCESS' }));
    } else if (mode === 'verify') {
      const result = verifyStateArchive({ archive: values['--archive'], manifestFile: values['--manifest'] });
      console.log(JSON.stringify({ ok: true, code: 'SUCCESS', fileCount: result.fileCount }));
    } else if (mode === 'restore') {
      const result = restoreState({
        archive: values['--archive'],
        manifestFile: values['--manifest'],
        targetDir: values['--target-dir'],
        ownerUid: values['--uid'] === undefined ? undefined : Number(values['--uid']),
        ownerGid: values['--gid'] === undefined ? undefined : Number(values['--gid']),
      });
      console.log(JSON.stringify({ ok: true, code: 'SUCCESS', backupCreated: Boolean(result.backupDir) }));
    } else {
      encryptStateArchive({ archive: values['--archive'], output: values['--output'], recipient: values['--recipient'] });
      console.log(JSON.stringify({ ok: true, code: 'SUCCESS' }));
    }
    return 0;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: error.code || error.message === 'CLI_INVALID' ? error.code || 'CLI_INVALID' : 'UNKNOWN' }));
    return 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  StateTransferError,
  createManifest,
  encryptStateArchive,
  parseCliArgs,
  restoreState,
  selectStateEntries,
  snapshotState,
  validateManifest,
  verifyStateArchive,
};

