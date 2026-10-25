'use strict';

// Versioned public artwork, resolved offline within an explicit region/season. Never a web search at render time.
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../assets/esports/teams/catalog.json');
const { decodeLogoSource } = require('./esports-team-logos');
const ROOT = path.resolve(__dirname, '../assets/esports/teams');
const normalize = value => typeof value === 'string' ? value.trim().toUpperCase().replace(/[.\s-]+/g, ' ') : '';
const fail = code => { throw new Error(code); };

function resolveTeamBrands(collectionId, teams) {
  if (collectionId === null || collectionId === undefined) return null;
  const collection = catalog.collections.find(c => c.id === collectionId);
  if (!collection) fail('TEAM_CATALOG_UNAVAILABLE');
  const result = teams.map(team => {
    const matches = collection.teams.filter(t => t.aliases.some(alias => normalize(alias) === normalize(team.name)));
    if (matches.length !== 1) return null; // Unknown/ambiguous names never select a guessed logo.
    const t = matches[0];
    return { id: t.id, name: t.name, ticker: t.ticker, sha256: t.sha256, plate: t.plate === 'light' ? 'light' : null,
      sourceUrl: collection.sourceBase + t.sourceFile };
  });
  return { collectionId: collection.id, region: collection.region, season: collection.season,
    verifiedAt: collection.verifiedAt, sourcePage: collection.sourcePage,
    association: 'EXACT_ALIAS_WITHIN_COLLECTION', teams: result };
}

async function loadCatalogLogo(collectionId, teamId) {
  const collection = catalog.collections.find(c => c.id === collectionId);
  const entry = collection?.teams.find(t => t.id === teamId);
  if (!entry || !/^[a-z0-9-]+$/.test(collection.id) || !/^[a-z0-9-]+$/.test(entry.id)) fail('TEAM_CATALOG_UNAVAILABLE');
  const directory = path.join(ROOT, collection.id); const file = path.join(directory, `${entry.id}.png`);
  for (const part of [path.resolve(ROOT, '../..'), path.dirname(ROOT), ROOT, directory, file]) {
    if (fs.lstatSync(part).isSymbolicLink()) fail('CATALOG_LOGO_LINK_REJECTED');
  }
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 1048576) fail('INVALID_LOGO_IMAGE');
  return decodeLogoSource(fs.readFileSync(file), { width: entry.width, height: entry.height, imageSha256: entry.sha256 });
}

module.exports = { resolveTeamBrands, loadCatalogLogo };
