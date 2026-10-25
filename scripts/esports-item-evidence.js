'use strict';

// Operator-marked icon crops from a reviewed public screenshot. Never item recognition or build advice.
const { createHash } = require('node:crypto');
const MAX_ITEM_IMAGE_BYTES = 4 * 1024 * 1024;
const fail = code => { throw new Error(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

function reviewItemEvidence(evidence, teams) {
  if (evidence === undefined || evidence === null) return null;
  if (!record(evidence) || evidence.kind !== 'manual_screenshot_crops' || evidence.manuallyReviewed !== true
    || typeof evidence.imageFile !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}\.png$/.test(evidence.imageFile)
    || typeof evidence.imageSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(evidence.imageSha256)
    || !integer(evidence.width, 1, 4096) || !integer(evidence.height, 1, 4096)
    || evidence.width * evidence.height > 8388608 || !Array.isArray(evidence.rows) || evidence.rows.length !== 2) fail('INVALID_ITEM_EVIDENCE');
  const rows = evidence.rows.map((side, t) => {
    if (!Array.isArray(side) || side.length !== 5) fail('INVALID_ITEM_ROWS');
    return side.map((row, p) => {
      if (!record(row) || !Array.isArray(row.slots) || row.slots.length !== 6) fail('INVALID_ITEM_ROWS');
      if (!teams[t].players[p].name || row.playerName !== teams[t].players[p].name) fail('ITEM_PLAYER_MISMATCH');
      const slots = row.slots.map(slot => {
        if (slot === null) return null; // Not visible, not an assertion that this inventory slot is empty.
        if (!record(slot) || !integer(slot.x, 0, evidence.width) || !integer(slot.y, 0, evidence.height)
          || !integer(slot.width, 8, 96) || !integer(slot.height, 8, 96)
          || slot.x + slot.width > evidence.width || slot.y + slot.height > evidence.height) fail('INVALID_ITEM_REGION');
        return { x: slot.x, y: slot.y, width: slot.width, height: slot.height };
      });
      return { playerName: row.playerName, slots };
    });
  });
  return { kind: 'manual_screenshot_crops', manuallyReviewed: true, imageFile: evidence.imageFile,
    imageSha256: evidence.imageSha256, width: evidence.width, height: evidence.height,
    identification: 'UNVERIFIED', layout: 'SOURCE_TOP_ROW_THEN_BOTTOM_ROW', rows };
}

async function decodeItemSource(bytes, evidence) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.length > MAX_ITEM_IMAGE_BYTES
    || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') fail('INVALID_ITEM_IMAGE');
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (width !== evidence.width || height !== evidence.height || width > 4096 || height > 4096
    || width * height > 8388608 || createHash('sha256').update(bytes).digest('hex') !== evidence.imageSha256) fail('ITEM_SOURCE_MISMATCH');
  let image;
  try { image = await require('@napi-rs/canvas').loadImage(bytes); } catch { fail('INVALID_ITEM_IMAGE'); }
  if (image.width !== width || image.height !== height) fail('ITEM_SOURCE_MISMATCH');
  return image;
}

module.exports = { reviewItemEvidence, decodeItemSource, MAX_ITEM_IMAGE_BYTES };
