'use strict';

// Offline HTML builder and validator. No service, provider calls, publication or trust promotion.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadImage } = require('@napi-rs/canvas');
const { createScoreboardChecklist } = require('./esports-scoreboard-checklist');
const { regionValid } = require('./esports-review-workbench/model');
const UI = path.join(__dirname, 'esports-review-workbench');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
// HTML parsers normalize CRLF. Hash the same LF bytes even after a Windows Git checkout.
const readSource = file => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

// Check encoded dimensions before native decoding to bound compressed-image memory use.
function encodedDimensions(bytes, mime) {
  if (mime === 'image/png') {
    if (bytes.length < 24 || bytes.toString('ascii', 12, 16) !== 'IHDR') fail('INVALID_REVIEW_IMAGE');
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) break;
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  fail('INVALID_REVIEW_IMAGE');
}

function evidenceRegions(packet, layout) {
  if (!record(layout) || layout.sourceSha256 !== packet.source.imageSha256
    || !Array.isArray(layout.cells) || layout.cells.length > 100) fail('INVALID_REVIEW_LAYOUT');
  const cells = new Map();
  for (const cell of layout.cells) {
    if (!record(cell) || typeof cell.field !== 'string' || cell.field.length > 80 || cells.has(cell.field)
      || !regionValid(cell.source, packet.source)) fail('INVALID_REVIEW_LAYOUT');
    cells.set(cell.field, Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, cell.source[k]])));
  }
  const regions = {};
  for (const field of packet.fields) {
    let key = field.path === 'gameNumber' ? 'matchLabel' : field.path === 'durationSeconds' ? 'duration'
      : field.path.replace('teams.0.', 'left.').replace('teams.1.', 'right.');
    if (/players\.\d\.(kills|deaths|assists)$/.test(key)) key = key.replace(/\.(kills|deaths|assists)$/, '.kda');
    if (field.path === 'winnerIndex') {
      // Show both victory/defeat labels, not an assumed winner's label.
      const a = cells.get('left.outcome'), b = cells.get('right.outcome');
      if (!a || !b) fail('MISSING_REVIEW_REGION');
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      regions[field.path] = { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y };
    } else regions[field.path] = cells.get(key) || fail('MISSING_REVIEW_REGION');
  }
  return regions;
}

async function prepareSample(input) {
  const packet = createScoreboardChecklist({ candidate: input.candidate, source: input.source });
  const bytes = input.imageBytes;
  if (!Buffer.isBuffer(bytes) || bytes.length > 8 * 1024 * 1024 || bytes.length < 16
    || hash(bytes) !== packet.source.imageSha256) fail('REVIEW_IMAGE_HASH_MISMATCH');
  const mime = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : null;
  if (!mime) fail('UNSUPPORTED_REVIEW_IMAGE');
  const dimensions = encodedDimensions(bytes, mime);
  if (dimensions.width !== packet.source.width || dimensions.height !== packet.source.height) fail('REVIEW_IMAGE_DIMENSIONS_MISMATCH');
  let image;
  try { image = await loadImage(bytes); } catch { fail('INVALID_REVIEW_IMAGE'); }
  if (image.width !== packet.source.width || image.height !== packet.source.height) fail('REVIEW_IMAGE_DIMENSIONS_MISMATCH');
  return { packet, regions: evidenceRegions(packet, input.layout), imageData: `data:${mime};base64,${bytes.toString('base64')}` };
}

async function renderReviewWorkbench(inputs) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 10
    || inputs.reduce((sum, s) => sum + (s?.imageBytes?.length || 0), 0) > 32 * 1024 * 1024) fail('INVALID_REVIEW_BATCH');
  const samples = [];
  for (const input of inputs) samples.push(await prepareSample(input));
  if (new Set(samples.map(s => s.packet.candidateFingerprint)).size !== samples.length) fail('DUPLICATE_REVIEW_SAMPLE');
  const payload = JSON.stringify(samples).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const script = [readSource(path.join(__dirname, 'esports-scoreboard-fields.js')),
    readSource(path.join(UI, 'model.js')), readSource(path.join(UI, 'ui.js')),
    `mountWorkbench(${payload});`].join('\n');
  const csp = `default-src 'none'; script-src 'sha256-${createHash('sha256').update(script).digest('base64')}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return readSource(path.join(UI, 'template.html'))
    .replace('__CSP__', () => csp).replace('__STYLE__', () => readSource(path.join(UI, 'style.css')))
    .replace('__SCRIPT__', () => script);
}

function readFile(file, limit) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) fail('INVALID_REVIEW_FILE');
  return fs.readFileSync(file);
}
const readJson = file => JSON.parse(readFile(file, 256 * 1024).toString('utf8').replace(/^\uFEFF/, ''));
function confinedFile(root, name) {
  if (typeof name !== 'string' || path.isAbsolute(name) || name.includes(':')) fail('INVALID_REVIEW_PATH');
  const resolved = fs.realpathSync(path.resolve(root, name)), relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('INVALID_REVIEW_PATH');
  return resolved;
}
function readManifest(file) {
  const manifest = readJson(file), root = fs.realpathSync(path.dirname(path.resolve(file)));
  if (!record(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.samples)
    || manifest.samples.length < 1 || manifest.samples.length > 10) fail('INVALID_REVIEW_MANIFEST');
  return manifest.samples.map(entry => {
    if (!record(entry)) fail('INVALID_REVIEW_MANIFEST');
    return { candidate: readJson(confinedFile(root, entry.candidatePath)), source: entry.source,
      layout: readJson(confinedFile(root, entry.layoutPath)),
      imageBytes: readFile(confinedFile(root, entry.imagePath), 8 * 1024 * 1024) };
  });
}
async function main(args) {
  const [command, manifestFile, target, reviewFile, outputFile] = args;
  if (command === 'build' && args.length === 3) {
    const html = await renderReviewWorkbench(readManifest(manifestFile));
    fs.writeFileSync(target, html, { flag: 'wx' });
    return { code: 'OFFLINE_WORKBENCH_CREATED', providerCalls: 0 };
  }
  if (command === 'validate' && (args.length === 4 || args.length === 5)) {
    if (!/^[1-9]\d?$/.test(target)) fail('INVALID_REVIEW_SAMPLE');
    const input = readManifest(manifestFile)[Number(target) - 1];
    if (!input) fail('INVALID_REVIEW_SAMPLE');
    await prepareSample(input); // Recheck source bytes, dimensions and regions before accepting decisions.
    const review = readJson(reviewFile), packet = createScoreboardChecklist({ ...input, review });
    if (outputFile) fs.writeFileSync(outputFile, JSON.stringify(packet, null, 2) + '\n', { flag: 'wx' });
    return { code: packet.status, summary: packet.summary, issues: packet.issues, trustedForCoach: false, publishable: false };
  }
  fail('USAGE_BUILD_OR_VALIDATE');
}
if (require.main === module) main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result)))
  .catch(() => { console.error('OFFLINE_WORKBENCH_FAILED'); process.exitCode = 1; });
module.exports = { renderReviewWorkbench, prepareSample, evidenceRegions, readManifest, main };
