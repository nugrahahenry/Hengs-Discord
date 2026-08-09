const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  EvidenceError,
  cleanupEvidence,
  cleanupStaleEvidenceDirs,
  downloadEvidence,
  sanitizeEvidenceFilename,
  validateEvidenceBuffer,
  validateEvidenceMetadata,
} = require('../src/reports/evidence');

const MB = 1024 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function attachment(overrides = {}) {
  return {
    name: 'screenshot.png',
    size: PNG.length,
    contentType: 'image/png',
    url: 'https://cdn.discordapp.com/attachments/1/2/screenshot.png',
    ...overrides,
  };
}

test('evidence metadata accepts supported Discord files and rejects unsafe sources', () => {
  assert.equal(validateEvidenceMetadata(attachment(), 10 * MB).extension, '.png');
  assert.throws(
    () => validateEvidenceMetadata(attachment({ name: 'payload.exe' }), 10 * MB),
    error => error instanceof EvidenceError && error.code === 'EVIDENCE_TYPE_UNSUPPORTED',
  );
  assert.throws(
    () => validateEvidenceMetadata(attachment({ url: 'https://example.com/screenshot.png' }), 10 * MB),
    error => error instanceof EvidenceError && error.code === 'EVIDENCE_URL_INVALID',
  );
  assert.throws(
    () => validateEvidenceMetadata(attachment({ contentType: 'application/pdf' }), 10 * MB),
    error => error instanceof EvidenceError && error.code === 'EVIDENCE_MIME_MISMATCH',
  );
  assert.throws(
    () => validateEvidenceMetadata(attachment({ size: 9 * MB }), 20 * MB),
    error => error instanceof EvidenceError && error.code === 'EVIDENCE_TOO_LARGE',
  );
});

test('evidence signatures reject renamed binaries for every supported family', () => {
  const validFixtures = [
    ['.png', PNG],
    ['.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ['.webp', Buffer.from('RIFF0000WEBP')],
    ['.gif', Buffer.from('GIF89a')],
    ['.mp4', Buffer.from('0000ftypisom')],
    ['.webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3])],
    ['.pdf', Buffer.from('%PDF-1.7')],
    ['.txt', Buffer.from('laporan teks yang aman\n')],
  ];

  for (const [extension, buffer] of validFixtures) {
    assert.doesNotThrow(() => validateEvidenceBuffer(buffer, extension), extension);
  }
  assert.throws(
    () => validateEvidenceBuffer(Buffer.from('not png'), '.png'),
    error => error instanceof EvidenceError && error.code === 'EVIDENCE_SIGNATURE_INVALID',
  );
  assert.throws(
    () => validateEvidenceBuffer(Buffer.from([0x61, 0x00, 0x62]), '.txt'),
    error => error instanceof EvidenceError && error.code === 'EVIDENCE_SIGNATURE_INVALID',
  );
});

test('evidence filename sanitization removes paths and control characters', () => {
  assert.equal(sanitizeEvidenceFilename('../../Bukti Rahasia.PNG'), 'bukti-rahasia.png');
  assert.equal(sanitizeEvidenceFilename('..\\..\\evil\u0000name.pdf'), 'evilname.pdf');
  assert.equal(sanitizeEvidenceFilename('   .txt'), 'evidence.txt');
});

test('evidence download writes a verified temporary file and cleanup removes it', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-evidence-test-'));
  let requestOptions = null;
  try {
    const downloaded = await downloadEvidence(attachment(), {
      tmpRoot,
      fetchImpl: async (_url, options) => {
        requestOptions = options;
        return new Response(PNG, {
        status: 200,
        headers: { 'content-type': 'image/png' },
        });
      },
    });

    assert.equal(fs.readFileSync(downloaded.filePath).equals(PNG), true);
    assert.equal(requestOptions.redirect, 'error');
    assert.equal(downloaded.uploadName, 'screenshot.png');
    assert.equal(downloaded.size, PNG.length);
    await cleanupEvidence(downloaded);
    assert.equal(fs.existsSync(downloaded.tempDir), false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('evidence download stops an oversized stream and removes temporary data', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-evidence-test-'));
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(PNG);
      controller.enqueue(Buffer.alloc(32, 0x61));
    },
    cancel() {
      cancelled = true;
    },
  });

  try {
    await assert.rejects(
      () => downloadEvidence(attachment({ size: PNG.length }), {
        tmpRoot,
        maxBytes: 16,
        fetchImpl: async () => new Response(body, { status: 200 }),
      }),
      error => error instanceof EvidenceError && error.code === 'EVIDENCE_TOO_LARGE',
    );
    assert.equal(cancelled, true);
    assert.deepEqual(fs.readdirSync(tmpRoot), []);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('evidence download maps an aborted request to a fixed timeout error', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-evidence-test-'));
  const fetchImpl = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  try {
    await assert.rejects(
      () => downloadEvidence(attachment(), { tmpRoot, timeoutMs: 10, fetchImpl }),
      error => error instanceof EvidenceError && error.code === 'EVIDENCE_TIMEOUT',
    );
    assert.deepEqual(fs.readdirSync(tmpRoot), []);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('startup cleanup removes only stale Hengs evidence directories', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-evidence-cleanup-test-'));
  const stale = path.join(tmpRoot, 'hengs-report-stale');
  const fresh = path.join(tmpRoot, 'hengs-report-fresh');
  const unrelated = path.join(tmpRoot, 'other-app-stale');
  fs.mkdirSync(stale);
  fs.mkdirSync(fresh);
  fs.mkdirSync(unrelated);
  const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
  fs.utimesSync(stale, oldTime, oldTime);
  fs.utimesSync(unrelated, oldTime, oldTime);

  try {
    const removed = await cleanupStaleEvidenceDirs({
      tmpRoot,
      nowMs: Date.now(),
      staleAgeMs: 60 * 60 * 1000,
    });
    assert.equal(removed, 1);
    assert.equal(fs.existsSync(stale), false);
    assert.equal(fs.existsSync(fresh), true);
    assert.equal(fs.existsSync(unrelated), true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
