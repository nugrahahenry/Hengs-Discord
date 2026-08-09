const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_STALE_AGE_MS = 60 * 60 * 1000;
const TEMP_PREFIX = 'hengs-report-';
const DISCORD_CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

const EVIDENCE_RULES = Object.freeze({
  '.png': Object.freeze(['image/png']),
  '.jpg': Object.freeze(['image/jpeg']),
  '.jpeg': Object.freeze(['image/jpeg']),
  '.webp': Object.freeze(['image/webp']),
  '.gif': Object.freeze(['image/gif']),
  '.mp4': Object.freeze(['video/mp4']),
  '.webm': Object.freeze(['video/webm']),
  '.pdf': Object.freeze(['application/pdf']),
  '.txt': Object.freeze(['text/plain']),
});

const GENERIC_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
]);

const ERROR_MESSAGES = Object.freeze({
  EVIDENCE_INVALID: 'Bukti tidak valid.',
  EVIDENCE_TYPE_UNSUPPORTED: 'Jenis bukti tidak didukung.',
  EVIDENCE_URL_INVALID: 'URL attachment Discord tidak valid.',
  EVIDENCE_MIME_MISMATCH: 'Tipe isi bukti tidak cocok dengan nama file.',
  EVIDENCE_TOO_LARGE: 'Ukuran bukti melewati batas yang diizinkan.',
  EVIDENCE_SIGNATURE_INVALID: 'Isi bukti tidak cocok dengan signature formatnya.',
  EVIDENCE_TIMEOUT: 'Unduhan bukti melewati batas waktu.',
  EVIDENCE_DOWNLOAD_FAILED: 'Bukti gagal diunduh dari Discord.',
});

class EvidenceError extends Error {
  constructor(code, message = ERROR_MESSAGES[code] || ERROR_MESSAGES.EVIDENCE_INVALID, options) {
    super(message, options);
    this.name = 'EvidenceError';
    this.code = code;
  }
}

function boundedPositiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function configuredMaxBytes() {
  return boundedPositiveInteger(
    process.env.REPORT_EVIDENCE_MAX_BYTES,
    DEFAULT_MAX_BYTES,
    DEFAULT_MAX_BYTES,
  );
}

function effectiveMaxBytes(discordLimit, requestedLimit) {
  const candidates = [DEFAULT_MAX_BYTES, configuredMaxBytes()];
  for (const value of [discordLimit, requestedLimit]) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) candidates.push(Math.floor(parsed));
  }
  return Math.min(...candidates);
}

function sanitizeEvidenceFilename(name) {
  const raw = String(name || '').replace(/\\/g, '/');
  const basename = path.posix.basename(raw).replace(/[\u0000-\u001f\u007f]/g, '');
  const extension = path.extname(basename).toLowerCase();
  const stem = basename
    .slice(0, basename.length - extension.length)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .toLowerCase()
    .slice(0, 64);
  return `${stem || 'evidence'}${extension}`;
}

function parseDiscordCdnUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || ''));
  } catch {
    throw new EvidenceError('EVIDENCE_URL_INVALID');
  }
  if (url.protocol !== 'https:' || !DISCORD_CDN_HOSTS.has(url.hostname.toLowerCase())) {
    throw new EvidenceError('EVIDENCE_URL_INVALID');
  }
  if (url.username || url.password) throw new EvidenceError('EVIDENCE_URL_INVALID');
  return url;
}

function validateEvidenceMetadata(attachment, discordLimit) {
  if (!attachment || typeof attachment !== 'object') {
    throw new EvidenceError('EVIDENCE_INVALID');
  }
  const originalName = String(attachment.name || '');
  const extension = path.extname(originalName).toLowerCase();
  const allowedMimeTypes = EVIDENCE_RULES[extension];
  if (!allowedMimeTypes) throw new EvidenceError('EVIDENCE_TYPE_UNSUPPORTED');

  const size = Number(attachment.size);
  const maxBytes = effectiveMaxBytes(discordLimit);
  if (!Number.isSafeInteger(size) || size <= 0) throw new EvidenceError('EVIDENCE_INVALID');
  if (size > maxBytes) throw new EvidenceError('EVIDENCE_TOO_LARGE');

  const contentType = String(attachment.contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (!GENERIC_MIME_TYPES.has(contentType) && !allowedMimeTypes.includes(contentType)) {
    throw new EvidenceError('EVIDENCE_MIME_MISMATCH');
  }

  const url = parseDiscordCdnUrl(attachment.url);
  return {
    extension,
    originalName,
    uploadName: sanitizeEvidenceFilename(originalName),
    size,
    contentType: contentType || allowedMimeTypes[0],
    url: url.toString(),
    maxBytes,
  };
}

function startsWith(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function validateEvidenceBuffer(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new EvidenceError('EVIDENCE_SIGNATURE_INVALID');
  }
  const ext = String(extension || '').toLowerCase();
  let valid = false;
  if (ext === '.png') valid = startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  else if (ext === '.jpg' || ext === '.jpeg') valid = startsWith(buffer, [0xff, 0xd8, 0xff]);
  else if (ext === '.webp') valid = buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  else if (ext === '.gif') valid = buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a';
  else if (ext === '.mp4') valid = buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  else if (ext === '.webm') valid = startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  else if (ext === '.pdf') valid = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  else if (ext === '.txt') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      valid = !buffer.includes(0x00);
    } catch {
      valid = false;
    }
  }
  if (!valid) throw new EvidenceError('EVIDENCE_SIGNATURE_INVALID');
}

async function readBoundedBody(response, maxBytes) {
  if (!response.body?.getReader) throw new EvidenceError('EVIDENCE_DOWNLOAD_FAILED');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new EvidenceError('EVIDENCE_TOO_LARGE');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function cleanupEvidence(downloaded) {
  if (!downloaded?.tempDir) return;
  await fs.promises.rm(downloaded.tempDir, { recursive: true, force: true });
}

async function downloadEvidence(attachment, options = {}) {
  const maxBytes = effectiveMaxBytes(options.discordLimit, options.maxBytes);
  const metadata = validateEvidenceMetadata(attachment, maxBytes);
  const timeoutMs = boundedPositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl || fetch;
  const tmpRoot = options.tmpRoot || os.tmpdir();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let downloaded = null;

  try {
    const response = await fetchImpl(metadata.url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response?.ok) throw new EvidenceError('EVIDENCE_DOWNLOAD_FAILED');
    if (response.url) parseDiscordCdnUrl(response.url);

    const responseLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(responseLength) && responseLength > maxBytes) {
      await response.body?.cancel?.().catch(() => {});
      throw new EvidenceError('EVIDENCE_TOO_LARGE');
    }

    const responseType = String(response.headers?.get?.('content-type') || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    const allowedTypes = EVIDENCE_RULES[metadata.extension];
    if (!GENERIC_MIME_TYPES.has(responseType) && !allowedTypes.includes(responseType)) {
      await response.body?.cancel?.().catch(() => {});
      throw new EvidenceError('EVIDENCE_MIME_MISMATCH');
    }

    const tempDir = await fs.promises.mkdtemp(path.join(tmpRoot, TEMP_PREFIX));
    downloaded = { tempDir };
    const buffer = await readBoundedBody(response, maxBytes);
    validateEvidenceBuffer(buffer, metadata.extension);
    const filePath = path.join(tempDir, metadata.uploadName);
    await fs.promises.writeFile(filePath, buffer, { flag: 'wx' });
    downloaded = {
      tempDir,
      filePath,
      uploadName: metadata.uploadName,
      size: buffer.length,
      contentType: allowedTypes[0],
    };
    return downloaded;
  } catch (error) {
    await cleanupEvidence(downloaded);
    if (error instanceof EvidenceError) throw error;
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new EvidenceError('EVIDENCE_TIMEOUT', undefined, { cause: error });
    }
    throw new EvidenceError('EVIDENCE_DOWNLOAD_FAILED', undefined, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

async function cleanupStaleEvidenceDirs(options = {}) {
  const tmpRoot = options.tmpRoot || os.tmpdir();
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const staleAgeMs = boundedPositiveInteger(
    options.staleAgeMs,
    DEFAULT_STALE_AGE_MS,
    24 * 60 * 60 * 1000,
  );
  let entries;
  try {
    entries = await fs.promises.readdir(tmpRoot, { withFileTypes: true });
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TEMP_PREFIX)) continue;
    const target = path.join(tmpRoot, entry.name);
    try {
      const stat = await fs.promises.stat(target);
      if ((nowMs - stat.mtimeMs) < staleAgeMs) continue;
      await fs.promises.rm(target, { recursive: true, force: true });
      removed += 1;
    } catch {
      // Startup cleanup is best-effort; active report handling must not be blocked.
    }
  }
  return removed;
}

module.exports = {
  EVIDENCE_RULES,
  EvidenceError,
  cleanupEvidence,
  cleanupStaleEvidenceDirs,
  downloadEvidence,
  sanitizeEvidenceFilename,
  validateEvidenceBuffer,
  validateEvidenceMetadata,
};
