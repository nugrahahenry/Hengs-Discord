const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DeepLClient } = require('./deepl-client');

const MB = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;
const LANGUAGE_CACHE_MS = 6 * 60 * 60 * 1000;
const TEMP_DIR_PREFIX = 'hengs-translate-';
const STALE_TEMP_AGE_MS = 60 * 60 * 1000;

const FORMAT_RULES = Object.freeze({
  '.pdf': {
    label: 'PDF',
    maxBytes: 10 * MB,
    minimumBilledCharacters: 50_000,
    mimeTypes: ['application/pdf'],
  },
  '.docx': {
    label: 'DOCX',
    maxBytes: 10 * MB,
    minimumBilledCharacters: 50_000,
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  '.pptx': {
    label: 'PPTX',
    maxBytes: 10 * MB,
    minimumBilledCharacters: 50_000,
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  },
  '.html': {
    label: 'HTML',
    maxBytes: 5 * MB,
    minimumBilledCharacters: 0,
    mimeTypes: ['text/html', 'application/xhtml+xml'],
  },
  '.htm': {
    label: 'HTML',
    maxBytes: 5 * MB,
    minimumBilledCharacters: 0,
    mimeTypes: ['text/html', 'application/xhtml+xml'],
  },
  '.txt': {
    label: 'TXT',
    maxBytes: 1 * MB,
    minimumBilledCharacters: 0,
    mimeTypes: ['text/plain'],
  },
});

const GENERIC_MIME_TYPES = new Set(['application/octet-stream', 'binary/octet-stream']);
const ALLOWED_CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const LANGUAGE_ALIASES = new Map([
  ['bahasa indonesia', 'id'],
  ['indonesia', 'id'],
  ['indonesian', 'id'],
  ['inggris', 'en-US'],
  ['english', 'en-US'],
  ['english us', 'en-US'],
  ['english uk', 'en-GB'],
  ['jepang', 'ja'],
  ['japanese', 'ja'],
  ['korea', 'ko'],
  ['korean', 'ko'],
  ['mandarin', 'zh-Hans'],
  ['chinese', 'zh-Hans'],
  ['arab', 'ar'],
  ['arabic', 'ar'],
  ['jerman', 'de'],
  ['german', 'de'],
  ['prancis', 'fr'],
  ['french', 'fr'],
  ['spanyol', 'es'],
  ['spanish', 'es'],
]);

const FALLBACK_TARGETS = Object.freeze([
  { code: 'id', name: 'Indonesian' },
  { code: 'en-US', name: 'English (American)' },
  { code: 'en-GB', name: 'English (British)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh-Hans', name: 'Chinese (simplified)' },
  { code: 'ar', name: 'Arabic' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
]);

class TranslationError extends Error {
  constructor(code, userMessage, cause = null) {
    super(userMessage);
    this.name = 'TranslationError';
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

class SerialQueue {
  constructor(maxJobs = 3) {
    this.maxJobs = maxJobs;
    this.running = false;
    this.items = [];
  }

  get depth() {
    return this.items.length + (this.running ? 1 : 0);
  }

  enqueue(task, onStart = null) {
    if (this.depth >= this.maxJobs) {
      throw new TranslationError(
        'QUEUE_FULL',
        `Antrean penerjemahan penuh (${this.maxJobs} pekerjaan). Coba lagi setelah salah satu selesai.`,
      );
    }

    const position = this.depth + 1;
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    this.items.push({ task, onStart, resolvePromise, rejectPromise });
    setImmediate(() => this.#drain());
    return { position, promise };
  }

  async #drain() {
    if (this.running) return;
    const item = this.items.shift();
    if (!item) return;

    this.running = true;
    try {
      if (item.onStart) await item.onStart();
      item.resolvePromise(await item.task());
    } catch (error) {
      item.rejectPromise(error);
    } finally {
      this.running = false;
      setImmediate(() => this.#drain());
    }
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const translationQueue = new SerialQueue(
  positiveInteger(process.env.TRANSLATE_MAX_QUEUE, 3),
);

let translator = null;
let languageCache = null;
let languageCacheAt = 0;

function isConfigured() {
  return Boolean(process.env.DEEPL_API_KEY);
}

function getTranslator() {
  if (!isConfigured()) {
    throw new TranslationError(
      'NOT_CONFIGURED',
      'DEEPL_API_KEY belum tersedia untuk Hengs Discord.',
    );
  }
  if (!translator) translator = new DeepLClient(process.env.DEEPL_API_KEY);
  return translator;
}

function normalizeMimeType(contentType) {
  return String(contentType || '').split(';', 1)[0].trim().toLowerCase();
}

function validateAttachmentMetadata(attachment, attachmentSizeLimit = Infinity) {
  if (!attachment || typeof attachment !== 'object') {
    throw new TranslationError('NO_FILE', 'Attachment dokumen tidak ditemukan.');
  }

  const extension = path.extname(String(attachment.name || '')).toLowerCase();
  const rule = FORMAT_RULES[extension];
  if (!rule) {
    throw new TranslationError(
      'UNSUPPORTED_FORMAT',
      'Format belum didukung. Gunakan PDF, DOCX, PPTX, HTML, atau TXT.',
    );
  }

  const size = Number(attachment.size);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new TranslationError('INVALID_SIZE', 'Ukuran attachment tidak valid.');
  }

  const discordLimit = Number.isFinite(attachmentSizeLimit) && attachmentSizeLimit > 0
    ? attachmentSizeLimit
    : Infinity;
  const maxBytes = Math.min(rule.maxBytes, discordLimit);
  if (size > maxBytes) {
    throw new TranslationError(
      'FILE_TOO_LARGE',
      `${rule.label} terlalu besar. Batas untuk request ini ${formatBytes(maxBytes)}.`,
    );
  }

  const mimeType = normalizeMimeType(attachment.contentType);
  if (
    mimeType
    && !GENERIC_MIME_TYPES.has(mimeType)
    && !rule.mimeTypes.includes(mimeType)
  ) {
    throw new TranslationError(
      'MIME_MISMATCH',
      `Tipe file tidak cocok dengan ekstensi ${extension}.`,
    );
  }

  if (!isAllowedDiscordCdnUrl(attachment.url)) {
    throw new TranslationError('INVALID_URL', 'URL attachment Discord tidak valid.');
  }

  return {
    extension,
    rule,
    size,
    maxInputBytes: maxBytes,
    outputSizeLimit: discordLimit,
  };
}

function isAllowedDiscordCdnUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && ALLOWED_CDN_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function validateDownloadedBuffer(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new TranslationError('EMPTY_DOWNLOAD', 'File yang diunduh kosong.');
  }

  if (extension === '.pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new TranslationError('INVALID_SIGNATURE', 'Isi file bukan PDF yang valid.');
  }

  if (
    (extension === '.docx' || extension === '.pptx')
    && buffer.subarray(0, 2).toString('ascii') !== 'PK'
  ) {
    throw new TranslationError(
      'INVALID_SIGNATURE',
      `Isi file bukan ${extension.slice(1).toUpperCase()} yang valid.`,
    );
  }

  if (
    ['.txt', '.html', '.htm'].includes(extension)
    && buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0)
  ) {
    throw new TranslationError('BINARY_TEXT', 'File teks terdeteksi berisi data biner.');
  }
}

function sanitizeOutputFilename(originalName, targetCode, extension) {
  const base = path.basename(String(originalName || 'document'), path.extname(String(originalName || '')));
  const asciiBase = base
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 70) || 'document';
  const safeTarget = String(targetCode).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12);
  return `${asciiBase}-${safeTarget}${extension}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'batas Discord';
  if (bytes >= MB) return `${(bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function minimumChargeFor(metadata) {
  return metadata.rule.minimumBilledCharacters || metadata.size;
}

function remainingCharacters(usage) {
  const count = usage?.character?.count;
  const limit = usage?.character?.limit;
  if (!Number.isFinite(count) || !Number.isFinite(limit)) return null;
  return Math.max(0, limit - count);
}

async function loadTargetLanguages() {
  if (languageCache && Date.now() - languageCacheAt < LANGUAGE_CACHE_MS) {
    return languageCache;
  }
  languageCache = await getTranslator().getTargetLanguages();
  languageCacheAt = Date.now();
  return languageCache;
}

function resolveTargetLanguage(input, languages) {
  const normalized = String(input || '').trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) {
    throw new TranslationError('INVALID_LANGUAGE', 'Bahasa tujuan belum dipilih.');
  }
  const alias = LANGUAGE_ALIASES.get(normalized);
  const wanted = String(alias || normalized).toLowerCase();
  const match = languages.find(language =>
    String(language.code).toLowerCase() === wanted
      || String(language.name).toLowerCase() === wanted,
  );
  if (!match) {
    throw new TranslationError(
      'INVALID_LANGUAGE',
      'Bahasa tujuan tidak didukung DeepL. Pilih salah satu saran yang muncul.',
    );
  }
  return { code: match.code, name: match.name };
}

async function getTargetLanguageSuggestions(query) {
  let languages;
  try {
    languages = await loadTargetLanguages();
  } catch {
    languages = FALLBACK_TARGETS;
  }

  const normalized = String(query || '').trim().toLowerCase();
  const matches = languages
    .map(language => ({
      code: language.code,
      name: language.name,
      rank: normalized && (
        String(language.code).toLowerCase().startsWith(normalized)
        || String(language.name).toLowerCase().startsWith(normalized)
      ) ? 0 : 1,
    }))
    .filter(language =>
      !normalized
      || String(language.code).toLowerCase().includes(normalized)
      || String(language.name).toLowerCase().includes(normalized),
    )
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, 25);

  return matches.map(language => ({
    name: `${language.name} (${language.code})`.slice(0, 100),
    value: String(language.code).slice(0, 100),
  }));
}

async function readResponseBuffer(response, maxBytes) {
  if (!response.body) {
    throw new TranslationError('DOWNLOAD_FAILED', 'Attachment Discord tidak memiliki isi.');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new TranslationError('FILE_TOO_LARGE', 'Ukuran download melebihi batas format.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes);
}

async function downloadAttachment(url, destination, maxBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new TranslationError('DOWNLOAD_FAILED', 'Attachment gagal diunduh dari Discord.');
    }
    if (!isAllowedDiscordCdnUrl(response.url)) {
      throw new TranslationError('INVALID_REDIRECT', 'Redirect attachment Discord ditolak.');
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new TranslationError('FILE_TOO_LARGE', 'Ukuran download melebihi batas format.');
    }

    const buffer = await readResponseBuffer(response, maxBytes);
    await fsp.writeFile(destination, buffer, { flag: 'wx' });
    return buffer;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new TranslationError('DOWNLOAD_TIMEOUT', 'Download attachment melewati batas waktu.', error);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function cleanupStaleTempDirs(now = Date.now()) {
  let entries;
  try {
    entries = await fsp.readdir(os.tmpdir(), { withFileTypes: true });
  } catch (error) {
    console.error('[translate] stale temp scan failed:', { code: error?.code || 'UNKNOWN' });
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TEMP_DIR_PREFIX)) continue;
    const directory = path.join(os.tmpdir(), entry.name);
    try {
      const stat = await fsp.stat(directory);
      if (now - stat.mtimeMs < STALE_TEMP_AGE_MS) continue;
      await fsp.rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      removed += 1;
    } catch (error) {
      console.error('[translate] stale temp cleanup failed:', {
        code: error?.code || 'UNKNOWN',
      });
    }
  }
  return removed;
}

function mapDeepLError(error) {
  if (error instanceof TranslationError) return error;
  const status = error?.statusCode || error?.status || error?.response?.status;
  const message = String(error?.message || '');
  if (status === 456 || /\b456\b|quota/i.test(message)) {
    return new TranslationError('QUOTA_EXCEEDED', 'Kuota DeepL tidak cukup untuk dokumen ini.', error);
  }
  if (status === 429 || /\b429\b|too many requests/i.test(message)) {
    return new TranslationError('RATE_LIMITED', 'DeepL sedang sibuk. Coba lagi beberapa menit lagi.', error);
  }
  if (status === 401 || status === 403) {
    return new TranslationError('AUTH_FAILED', 'Akses DeepL ditolak. Periksa API key atau paket akun.', error);
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return new TranslationError('DEEPL_TIMEOUT', 'Koneksi ke DeepL melewati batas waktu.', error);
  }
  return new TranslationError(
    'DEEPL_FAILED',
    'DeepL gagal menerjemahkan dokumen ini. Pastikan formatnya valid dan bukan PDF scan.',
    error,
  );
}

async function wait(milliseconds) {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function translateAndDeliver({
  attachment,
  target,
  attachmentSizeLimit,
  onProgress,
  deliver,
}) {
  const metadata = validateAttachmentMetadata(attachment, attachmentSizeLimit);
  const client = getTranslator();
  const timeoutMs = positiveInteger(process.env.TRANSLATE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  let tempDir = null;

  try {
    await onProgress?.('Memeriksa kuota DeepL...');
    const usage = await client.getUsage();
    const remaining = remainingCharacters(usage);
    const minimumCharge = minimumChargeFor(metadata);
    if (remaining !== null && remaining < minimumCharge) {
      throw new TranslationError(
        'QUOTA_EXCEEDED',
        `Kuota tersisa ${remaining.toLocaleString('id-ID')} karakter, sedangkan format ini membutuhkan sedikitnya ${minimumCharge.toLocaleString('id-ID')}.`,
      );
    }

    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
    const inputPath = path.join(tempDir, `input${metadata.extension}`);
    const outputPath = path.join(tempDir, `output${metadata.extension}`);

    await onProgress?.('Mengunduh attachment secara sementara...');
    const buffer = await downloadAttachment(
      attachment.url,
      inputPath,
      metadata.maxInputBytes,
    );
    validateDownloadedBuffer(buffer, metadata.extension);

    await onProgress?.('Mengunggah ke DeepL dan mendeteksi bahasa sumber...');
    const handle = await client.uploadDocument(inputPath, target.code);
    let status;
    while (Date.now() - startedAt < timeoutMs) {
      status = await client.getDocumentStatus(handle);
      if (status.status === 'done') break;
      if (status.status === 'error') {
        throw new TranslationError(
          'DEEPL_DOCUMENT_ERROR',
          'DeepL menolak atau gagal memproses dokumen ini.',
        );
      }
      await onProgress?.('DeepL sedang menerjemahkan dokumen...');
      const suggestedWait = Number(status.secondsRemaining) * 1000;
      await wait(Math.max(1_000, Math.min(Number.isFinite(suggestedWait) ? suggestedWait : 2_000, 5_000)));
    }

    if (!status || status.status !== 'done') {
      throw new TranslationError(
        'TRANSLATION_TIMEOUT',
        `Terjemahan melewati batas waktu ${Math.round(timeoutMs / 60_000)} menit.`,
      );
    }

    await onProgress?.('Mengunduh hasil terjemahan...');
    await client.downloadDocument(handle, outputPath);
    const outputStat = await fsp.stat(outputPath);
    if (
      Number.isFinite(metadata.outputSizeLimit)
      && outputStat.size > metadata.outputSizeLimit
    ) {
      throw new TranslationError(
        'OUTPUT_TOO_LARGE',
        `Hasil terjemahan ${formatBytes(outputStat.size)}, melebihi batas upload Discord ${formatBytes(metadata.outputSizeLimit)}.`,
      );
    }

    const outputName = sanitizeOutputFilename(
      attachment.name,
      target.code,
      metadata.extension,
    );
    await deliver({
      outputPath,
      outputName,
      billedCharacters: Number(status.billedCharacters) || null,
      format: metadata.rule.label,
      target,
      remainingBefore: remaining,
    });

    return {
      billedCharacters: Number(status.billedCharacters) || null,
      format: metadata.rule.label,
      target,
    };
  } catch (error) {
    throw mapDeepLError(error);
  } finally {
    if (tempDir) {
      await fsp.rm(tempDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      }).catch(error => {
        console.error('[translate] temp cleanup failed:', {
          code: error?.code || 'UNKNOWN',
        });
      });
    }
  }
}

function enqueueTranslation(options, onStart) {
  return translationQueue.enqueue(() => translateAndDeliver(options), onStart);
}

function getPublicError(error) {
  return mapDeepLError(error).userMessage;
}

module.exports = {
  FORMAT_RULES,
  SerialQueue,
  TranslationError,
  cleanupStaleTempDirs,
  enqueueTranslation,
  formatBytes,
  getPublicError,
  getTargetLanguageSuggestions,
  isAllowedDiscordCdnUrl,
  isConfigured,
  minimumChargeFor,
  readResponseBuffer,
  remainingCharacters,
  resolveTargetLanguage,
  sanitizeOutputFilename,
  validateAttachmentMetadata,
  validateDownloadedBuffer,
  loadTargetLanguages,
};
