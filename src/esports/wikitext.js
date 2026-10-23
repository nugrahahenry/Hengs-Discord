'use strict';

// Reads Liquipedia MLBB wikitext ({{Match}} with {{Map}} games) into plain series objects. Only what the page says:
// a series is finished only when the decided games add up; anything inconsistent is marked invalid, never guessed.
const crypto = require('node:crypto');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december'];
// Hours ahead of UTC for the zones Liquipedia writes on MLBB pages; an unknown zone gives no start time.
const ZONES = { UTC: 0, GMT: 0, CET: 1, CEST: 2, EET: 2, EEST: 3, TRT: 3, AST: 3, GST: 4, WIB: 7, ICT: 7,
  SGT: 8, PHT: 8, PST: 8, MYT: 8, WITA: 8, CST: 8, JST: 9, KST: 9, WIT: 9 };
// Template aliases and names that plain capitalisation gets wrong.
const HEROES = { lapu: 'Lapu-Lapu', 'lapu-lapu': 'Lapu-Lapu', 'x.borg': 'X.Borg', xborg: 'X.Borg',
  'popol and kupa': 'Popol and Kupa', popol: 'Popol and Kupa', yss: 'Yi Sun-shin' };
const UPPER = new Set(['ph', 'id', 'my', 'sg', 'mm', 'kh', 'onic', 'evos', 'rrq', 'tnc', 'btr', 'geek', 'omg', 'ae', 'blck']);

const capital = word => word ? word[0].toUpperCase() + word.slice(1) : '';
function heroName(key) {
  const clean = String(key || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return HEROES[clean] || clean.split(' ').map(capital).join(' ');
}
const tidyTeam = key => key.split(/\s+/).filter(Boolean)
  .map(word => UPPER.has(word.toLowerCase()) ? word.toUpperCase() : capital(word)).join(' ');

// Index just past the "}}" that closes the template opening at `start`, or -1.
function closing(text, start) {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; } else if (text[i] === '}' && text[i + 1] === '}') {
      depth--; i++;
      if (!depth) return i + 1;
    }
  }
  return -1;
}

// Template body -> { name: value } for named params and [positional] for the rest, split at top-level pipes.
function params(body) {
  const parts = [];
  let depth = 0; let link = 0; let from = 0;
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{') { depth++; i++; } else if (two === '}}') { depth--; i++; }
    else if (two === '[[') { link++; i++; } else if (two === ']]') { link--; i++; }
    else if (body[i] === '|' && !depth && !link) { parts.push(body.slice(from, i)); from = i + 1; }
  }
  parts.push(body.slice(from));
  const named = {}; const positional = [];
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    const name = eq > 0 ? part.slice(0, eq).trim() : '';
    if (/^[\w ]+$/.test(name)) named[name] = part.slice(eq + 1).trim(); else positional.push(part.trim());
  }
  return { named, positional };
}

function startAt(value) {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*-\s*(\d{1,2}):(\d{2})\s*\{\{\s*Abbr\/([A-Z]{2,5})\s*\}\}/.exec(value || '');
  const month = m && MONTHS.indexOf(m[1].toLowerCase());
  if (!m || month < 0 || !(m[6] in ZONES)) return null;
  return Date.UTC(Number(m[3]), month, Number(m[2]), Number(m[4]) - ZONES[m[6]], Number(m[5]));
}

const LINK = /\[\[([^\]|]+)\|'''([^']+)'''\]\]/g;
const OBJECTIVE = /\[\[([^\]|]+)\|'''[^']+'''\]\]\s*picked\s*(?:<b>)?\s*\[\[([^\]|]+)/i;

function game(number, value, teams) {
  const { named } = params(value.replace(/^\{\{|\}\}$/g, ''));
  const winner = Number(named.winner);
  const side = s => ['blue', 'red'].includes(String(s).toLowerCase()) ? String(s).toLowerCase() : '';
  const heroes = (team, kind) => [1, 2, 3, 4, 5].map(i => heroName(named[`t${team}${kind}${i}`])).filter(Boolean);
  // Old form: "[[Team|'''TAG''']] picked [[Mode]]" in the comment (names the team). Since 2026-10-15 Liquipedia
  // also has |mapmode= (mode only), which its bot fills from the comments; read both.
  const pick = OBJECTIVE.exec(named.comment || '');
  const team = pick ? teams.findIndex(t => t.key && t.key.toLowerCase() === pick[1].trim().toLowerCase()) + 1 : 0;
  const mode = (named.mapmode || '').replace(/\[\[|\]\]/g, '').trim();
  return {
    number, winner: winner === 1 || winner === 2 ? winner : 0,
    skipped: /^skip$/i.test(named.finished || ''),
    sides: [side(named.team1side), side(named.team2side)],
    length: /^\d{1,2}:\d{2}$/.test(named.length || '') ? named.length : '',
    vod: /^https:\/\/\S+$/.test(named.vod || '') ? named.vod : '',
    objective: team ? { team, name: pick[2].trim() } : mode ? { team: 0, name: mode } : null,
    picks: [heroes(1, 'h'), heroes(2, 'h')], bans: [heroes(1, 'b'), heroes(2, 'b')],
  };
}

function parseMatches(wikitext, { page = '' } = {}) {
  const raw = String(wikitext || '');
  // Comments are labels, not data: blank them out (same length, so positions still line up).
  const labels = [...raw.matchAll(/<!--([\s\S]*?)-->/g)].map(m => ({ at: m.index, text: m[1].trim() }));
  const text = raw.replace(/<!--[\s\S]*?-->/g, c => ' '.repeat(c.length));
  const headers = [...text.matchAll(/\|\s*R(\d+)M(\d+)header\s*=\s*([^|\n]*)/g)]
    .map(m => ({ round: Number(m[1]), match: Number(m[2]), text: m[3].trim() }));
  const known = new Map();
  for (const m of text.matchAll(LINK)) known.set(m[1].trim().toLowerCase(), { name: m[1].trim(), ticker: m[2].trim() });
  const spans = [...text.matchAll(/\{\{\s*Match\s*\|/g)].map(m => [m.index, closing(text, m.index)]).filter(s => s[1] > 0);
  // Round labels are the comments between series, never the "Hero picks" notes inside a series' games.
  const between = labels.filter(l => !spans.some(([from, to]) => l.at > from && l.at < to));
  const seen = new Map(); const out = [];
  for (const [index, end] of spans) {
    const m = { index };
    const key = /\|\s*(\w+)\s*=\s*$/.exec(text.slice(Math.max(0, m.index - 40), m.index))?.[1] || 'M';
    const ordinal = seen.get(key) || 0; seen.set(key, ordinal + 1);
    const { named } = params(text.slice(m.index + 2, end - 2));
    const teams = [1, 2].map(n => {
      const team = params((named[`opponent${n}`] || '').replace(/^\{\{|\}\}$/g, ''));
      const teamKey = (team.named.template || team.positional[0] || '').trim();
      const found = known.get(teamKey.toLowerCase());
      return { key: teamKey, name: found?.name || tidyTeam(teamKey), ticker: found?.ticker || '' };
    });
    const round = /^R(\d+)M(\d+)$/.exec(key);
    const header = round && headers.filter(h => h.round === Number(round[1]) && h.match <= Number(round[2]))
      .sort((a, b) => b.match - a.match)[0];
    const comment = between.filter(l => l.at < m.index).at(-1);
    const games = Object.keys(named).filter(name => /^map\d+$/.test(name)).sort((a, b) => a.slice(3) - b.slice(3))
      .map(name => game(Number(name.slice(3)), named[name], teams)).filter(g => !g.skipped);
    const bestof = Number(named.bestof);
    const need = Number.isInteger(bestof) && bestof > 0 && bestof % 2 ? (bestof + 1) / 2 : 0;
    const decided = games.filter(g => g.winner);
    const score = [1, 2].map(t => decided.filter(g => g.winner === t).length);
    // Valid: decided games come first, nobody passes the needed wins, nothing is decided after the clinching game.
    const valid = Boolean(need) && games.every((g, i) => !g.winner || games.slice(0, i).every(x => x.winner))
      && decided.length <= bestof && score.every(s => s <= need)
      && decided.every((g, i) => i === decided.length - 1 || Math.max(...[1, 2].map(t => decided.slice(0, i + 1)
        .filter(x => x.winner === t).length)) < need);
    const finished = valid && Math.max(...score) === need;
    out.push({
      id: `${page}#${key}#${ordinal}`, page, key, stage: header?.text || comment?.text || '', bestof: bestof || 0,
      mvp: (named.mvp || '').replace(/\[\[|\]\]/g, '').trim(), teams, startAt: startAt(named.date),
      games: games.map(({ skipped, ...g }) => g), score, valid, finished, winner: finished ? (score[0] === need ? 1 : 2) : 0,
    });
  }
  return out;
}

// What a card shows; a different hash means the posted card is out of date.
function matchHash(match) {
  const { teams, score, mvp, games, stage } = match;
  return crypto.createHash('sha256').update(JSON.stringify({ teams, score, mvp, games, stage })).digest('hex').slice(0, 16);
}

module.exports = { parseMatches, heroName, matchHash, startAt };
