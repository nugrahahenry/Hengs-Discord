#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync: defaultSpawnSync } = require('node:child_process');

const RELEASE_VERSION = '1.44.0';
const TEXT_SCAN_LIMIT = 10 * 1024 * 1024;

class ReleaseBuildError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ReleaseBuildError';
    this.code = code;
  }
}

function normalizeTrackedPath(file) {
  if (typeof file !== 'string' || !file || file.includes('\0') || file.includes('\\')) return null;
  const normalized = path.posix.normalize(file);
  if (normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function forbiddenPathReason(file) {
  const normalized = normalizeTrackedPath(file);
  if (!normalized) return 'FORBIDDEN_PATH';
  const lower = normalized.toLowerCase();
  const basename = path.posix.basename(lower);
  if (lower === '.env' || (basename.startsWith('.env.') && basename !== '.env.example')) {
    return 'FORBIDDEN_PATH';
  }
  if (lower === '.cloud' || lower.startsWith('.cloud/')) return 'FORBIDDEN_PATH';
  if (lower === 'data' || lower.startsWith('data/')) return 'FORBIDDEN_PATH';
  if (lower === 'logs' || lower.startsWith('logs/')) return 'FORBIDDEN_PATH';
  if (lower === 'docs/superpowers' || lower.startsWith('docs/superpowers/')) return 'FORBIDDEN_PATH';
  if (basename === '.dc-bot.lock' || basename.endsWith('.key') || basename.endsWith('.pem')) {
    return 'FORBIDDEN_PATH';
  }
  if (basename.startsWith('id_rsa')) return 'FORBIDDEN_PATH';
  return null;
}

function forbiddenContentReason(content) {
  if (typeof content !== 'string') return null;
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) return 'PRIVATE_KEY';
  if (/(?:^|[^A-Za-z0-9_-])(?:mfa\.)?[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}(?:$|[^A-Za-z0-9_-])/.test(content)) {
    return 'DISCORD_TOKEN';
  }
  if (/\bocid1\.[a-z0-9._-]+/i.test(content)) return 'OCI_IDENTIFIER';
  if (/\b(?:gsk_[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/.test(content)) {
    return 'API_CREDENTIAL';
  }
  if (/\bBearer\s+[A-Za-z0-9._~-]{20,}/i.test(content)) return 'API_CREDENTIAL';
  if (/\b(?:[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)|API_KEY|TOKEN|SECRET|PASSWORD)[ \t]*[:=][ \t]*["']?[A-Za-z0-9._~:+/-]{16,}/i.test(content)) {
    return 'API_CREDENTIAL';
  }
  return null;
}

function validateTrackedFiles(files) {
  if (!Array.isArray(files)) return { ok: false, forbidden: [{ path: '<input>', reason: 'FORBIDDEN_PATH' }] };
  const forbidden = [];
  const seen = new Set();
  for (const entry of files) {
    const file = entry && typeof entry === 'object' ? entry.path : null;
    const normalized = normalizeTrackedPath(file);
    let reason = forbiddenPathReason(file);
    if (!reason && seen.has(normalized)) reason = 'FORBIDDEN_PATH';
    if (!reason) reason = forbiddenContentReason(entry.content);
    if (reason) forbidden.push({ path: normalized || '<invalid>', reason });
    if (normalized) seen.add(normalized);
  }
  return { ok: forbidden.length === 0, forbidden };
}

function buildRelease(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const outputDir = path.resolve(options.outputDir || path.join(root, '.cloud', 'releases'));
  const spawnSync = options.spawnSync || defaultSpawnSync;
  const fsImpl = options.fsImpl || fs;
  const relativeOutput = path.relative(root, outputDir).replaceAll('\\', '/');
  if (relativeOutput !== '.cloud/releases') throw new ReleaseBuildError('OUTPUT_PATH_INVALID');

  function git(args) {
    const result = spawnSync('git', args, {
      cwd: root,
      shell: false,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: TEXT_SCAN_LIMIT,
    });
    if (result.error || result.status !== 0) throw new ReleaseBuildError('GIT_FAILED');
    return result.stdout || '';
  }

  const status = git(['status', '--porcelain', '--untracked-files=no']);
  if (status.trim()) throw new ReleaseBuildError('TRACKED_TREE_DIRTY');

  const commit = git(['rev-parse', 'HEAD']).trim();
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new ReleaseBuildError('GIT_FAILED');

  let packageMetadata;
  try {
    packageMetadata = JSON.parse(git(['show', 'HEAD:package.json']));
  } catch (error) {
    if (error instanceof ReleaseBuildError) throw error;
    throw new ReleaseBuildError('VERSION_INVALID');
  }
  if (packageMetadata.version !== RELEASE_VERSION) throw new ReleaseBuildError('VERSION_INVALID');

  const namesRaw = git(['ls-tree', '-r', '--name-only', '-z', 'HEAD']);
  const separator = namesRaw.includes('\0') ? '\0' : '\n';
  const names = namesRaw.split(separator).filter(Boolean);
  const trackedFiles = names.map(name => {
    const pathReason = forbiddenPathReason(name);
    if (pathReason) return { path: name, content: '' };
    const content = git(['show', `HEAD:${name}`]);
    return { path: name, content };
  });
  const validation = validateTrackedFiles(trackedFiles);
  if (!validation.ok) throw new ReleaseBuildError('TRACKED_CONTENT_FORBIDDEN');

  const shortCommit = commit.slice(0, 12);
  const basename = `hengs-discord-${RELEASE_VERSION}-${shortCommit}.tar.gz`;
  const archive = path.join(outputDir, basename);
  const checksumFile = `${archive}.sha256`;
  if (fsImpl.existsSync(archive) || fsImpl.existsSync(checksumFile)) {
    throw new ReleaseBuildError('RELEASE_EXISTS');
  }

  fsImpl.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  try {
    git(['archive', '--format=tar.gz', '--output', archive, 'HEAD']);
    fsImpl.chmodSync(archive, 0o600);
    const digest = crypto.createHash('sha256').update(fsImpl.readFileSync(archive)).digest('hex');
    fsImpl.writeFileSync(checksumFile, `${digest}  ${basename}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  } catch (error) {
    try { fsImpl.rmSync(archive, { force: true }); } catch {}
    try { fsImpl.rmSync(checksumFile, { force: true }); } catch {}
    if (error instanceof ReleaseBuildError) throw error;
    throw new ReleaseBuildError('ARCHIVE_FAILED');
  }

  return { archive, checksumFile, commit, version: RELEASE_VERSION };
}

if (require.main === module) {
  try {
    const result = buildRelease();
    console.log(JSON.stringify({
      ok: true,
      code: 'SUCCESS',
      archive: path.basename(result.archive),
      checksum: path.basename(result.checksumFile),
      commit: result.commit.slice(0, 12),
      version: result.version,
    }));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: error.code || 'UNKNOWN' }));
    process.exitCode = 1;
  }
}

module.exports = { ReleaseBuildError, buildRelease, validateTrackedFiles };
