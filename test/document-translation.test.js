const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DeepLClient } = require('../src/translation/deepl-client');
const translateCommand = require('../src/commands/translate');
const {
  SerialQueue,
  isAllowedDiscordCdnUrl,
  readResponseBuffer,
  resolveTargetLanguage,
  sanitizeOutputFilename,
  validateAttachmentMetadata,
  validateDownloadedBuffer,
} = require('../src/translation/service');

test('attachment validation enforces format, MIME, size, and Discord CDN', () => {
  const valid = {
    name: 'lecture.txt',
    size: 120,
    contentType: 'text/plain; charset=utf-8',
    url: 'https://cdn.discordapp.com/attachments/1/2/lecture.txt',
  };
  assert.equal(validateAttachmentMetadata(valid, 10 * 1024 * 1024).extension, '.txt');

  assert.throws(
    () => validateAttachmentMetadata({ ...valid, name: 'lecture.exe' }),
    /Format belum didukung/,
  );
  assert.throws(
    () => validateAttachmentMetadata({ ...valid, contentType: 'application/pdf' }),
    /Tipe file tidak cocok/,
  );
  assert.throws(
    () => validateAttachmentMetadata({ ...valid, size: 2 * 1024 * 1024 }),
    /terlalu besar/,
  );
  assert.throws(
    () => validateAttachmentMetadata({ ...valid, url: 'https://example.com/private.txt' }),
    /URL attachment Discord tidak valid/,
  );
  assert.equal(isAllowedDiscordCdnUrl('http://cdn.discordapp.com/a.txt'), false);
});

test('download signatures reject renamed binary files', () => {
  assert.doesNotThrow(() => validateDownloadedBuffer(Buffer.from('%PDF-1.7'), '.pdf'));
  assert.doesNotThrow(() => validateDownloadedBuffer(Buffer.from('PK-test'), '.docx'));
  assert.doesNotThrow(() => validateDownloadedBuffer(Buffer.from('plain text'), '.txt'));
  assert.throws(
    () => validateDownloadedBuffer(Buffer.from('not a pdf'), '.pdf'),
    /bukan PDF/,
  );
  assert.throws(
    () => validateDownloadedBuffer(Buffer.from([65, 0, 66]), '.txt'),
    /data biner/,
  );
});

test('response buffering stops before an oversized download can fill memory', async () => {
  const smallResponse = new Response(Buffer.from('hello'));
  assert.equal((await readResponseBuffer(smallResponse, 5)).toString('utf8'), 'hello');

  const largeResponse = new Response(Buffer.alloc(6));
  await assert.rejects(
    () => readResponseBuffer(largeResponse, 5),
    /Ukuran download melebihi batas/,
  );
});

test('output filenames are sanitized and target languages resolve by alias or code', () => {
  assert.equal(
    sanitizeOutputFilename('../../Laporan Rahasia?.pdf', 'ID', '.pdf'),
    'Laporan-Rahasia-ID.pdf',
  );
  const languages = [
    { code: 'ID', name: 'Indonesian' },
    { code: 'EN-US', name: 'English (American)' },
  ];
  assert.deepEqual(resolveTargetLanguage('bahasa indonesia', languages), {
    code: 'ID',
    name: 'Indonesian',
  });
  assert.deepEqual(resolveTargetLanguage('en-us', languages), {
    code: 'EN-US',
    name: 'English (American)',
  });
  assert.throws(() => resolveTargetLanguage('klingon', languages), /tidak didukung/);
});

test('serial queue runs one job at a time and enforces its capacity', async () => {
  const queue = new SerialQueue(2);
  const order = [];
  let releaseFirst;
  const gate = new Promise(resolve => { releaseFirst = resolve; });

  const first = queue.enqueue(async () => {
    order.push('first-start');
    await gate;
    order.push('first-end');
  });
  const second = queue.enqueue(async () => {
    order.push('second');
  });
  assert.equal(first.position, 1);
  assert.equal(second.position, 2);
  assert.throws(() => queue.enqueue(async () => {}), /Antrean penerjemahan penuh/);

  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['first-start']);
  releaseFirst();
  await Promise.all([first.promise, second.promise]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second']);
});

test('native DeepL client uses API Free endpoints without exposing file paths', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-deepl-client-test-'));
  const inputPath = path.join(tempDir, 'input.txt');
  const outputPath = path.join(tempDir, 'output.txt');
  fs.writeFileSync(inputPath, 'hello', 'utf8');
  const calls = [];

  const fakeFetch = async (url, options) => {
    calls.push({ url, method: options.method || 'GET', auth: options.headers.get('Authorization') });
    if (url.endsWith('/v2/usage')) {
      return new Response(JSON.stringify({ character_count: 5, character_limit: 1000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/v2/languages')) {
      return new Response(JSON.stringify([
        { language: 'ID', name: 'Indonesian', supports_formality: false },
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/v2/document')) {
      assert.ok(options.body instanceof FormData);
      return new Response(JSON.stringify({ document_id: 'doc-1', document_key: 'key-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/result')) {
      return new Response(Buffer.from('halo'), { status: 200 });
    }
    return new Response(JSON.stringify({
      status: 'done',
      billed_characters: 5,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const client = new DeepLClient('test-key:fx', fakeFetch);
    assert.equal((await client.getUsage()).character.limit, 1000);
    assert.equal((await client.getTargetLanguages())[0].code, 'ID');
    const handle = await client.uploadDocument(inputPath, 'ID');
    assert.equal((await client.getDocumentStatus(handle)).status, 'done');
    await client.downloadDocument(handle, outputPath);
    assert.equal(fs.readFileSync(outputPath, 'utf8'), 'halo');
    assert.ok(calls.every(call => call.url.startsWith('https://api-free.deepl.com/')));
    assert.ok(calls.every(call => call.auth === 'DeepL-Auth-Key test-key:fx'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('translate command requires attachment, target, consent, and runtime allowlist', () => {
  const data = translateCommand.data.toJSON();
  assert.equal(data.name, 'translate');
  assert.equal(data.dm_permission, false);
  assert.deepEqual(
    data.options.map(option => ({ name: option.name, required: option.required })),
    [
      { name: 'file', required: true },
      { name: 'to', required: true },
      { name: 'non_sensitive', required: true },
    ],
  );

  const previousOwner = process.env.OWNER_ID;
  const previousAllowed = process.env.TRANSLATE_ALLOWED_USER_IDS;
  process.env.OWNER_ID = 'owner-1';
  process.env.TRANSLATE_ALLOWED_USER_IDS = 'vip-1, vip-2';
  try {
    assert.equal(translateCommand.isAllowed('owner-1'), true);
    assert.equal(translateCommand.isAllowed('vip-2'), true);
    assert.equal(translateCommand.isAllowed('outsider'), false);
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previousOwner;
    if (previousAllowed === undefined) delete process.env.TRANSLATE_ALLOWED_USER_IDS;
    else process.env.TRANSLATE_ALLOWED_USER_IDS = previousAllowed;
  }
});
