'use strict';

// Local preview evidence only. The operator associates source marks with teams, never a name-search guess.
const { decodeItemSource, MAX_ITEM_IMAGE_BYTES } = require('./esports-item-evidence');
const fail = code => { throw new Error(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

function reviewTeamLogos(evidence, teams) {
  if (evidence === undefined || evidence === null) return null;
  if (!record(evidence) || evidence.kind !== 'manual_screenshot_crops' || evidence.manuallyReviewed !== true
    || typeof evidence.imageFile !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}\.png$/.test(evidence.imageFile)
    || typeof evidence.imageSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(evidence.imageSha256)
    || !integer(evidence.width, 1, 4096) || !integer(evidence.height, 1, 4096)
    || evidence.width * evidence.height > 8388608 || !Array.isArray(evidence.teams)
    || evidence.teams.length !== 2) fail('INVALID_LOGO_EVIDENCE');
  const marks = evidence.teams.map((mark, index) => {
    if (!record(mark) || !teams[index].name || mark.teamName !== teams[index].name) fail('LOGO_TEAM_MISMATCH');
    let region = null;
    if (mark.region !== null) {
      const r = mark.region;
      if (!record(r) || !integer(r.x, 0, evidence.width) || !integer(r.y, 0, evidence.height)
        || !integer(r.width, 16, 512) || !integer(r.height, 16, 512)
        || r.x + r.width > evidence.width || r.y + r.height > evidence.height) fail('INVALID_LOGO_REGION');
      region = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return { teamName: mark.teamName, region };
  });
  return { kind: 'manual_screenshot_crops', manuallyReviewed: true, imageFile: evidence.imageFile,
    imageSha256: evidence.imageSha256, width: evidence.width, height: evidence.height,
    association: 'OPERATOR_MARKED', brandVersion: 'SOURCE_MATCH_ONLY', teams: marks };
}

async function decodeLogoSource(bytes, evidence) {
  // Share the bounded PNG decoder; preserve errors as logo-specific fixed codes for the operator.
  try { return await decodeItemSource(bytes, evidence); } catch (error) {
    if (error.message === 'INVALID_ITEM_IMAGE') fail('INVALID_LOGO_IMAGE');
    if (error.message === 'ITEM_SOURCE_MISMATCH') fail('LOGO_SOURCE_MISMATCH');
    throw error;
  }
}

module.exports = { reviewTeamLogos, decodeLogoSource, MAX_LOGO_IMAGE_BYTES: MAX_ITEM_IMAGE_BYTES };
