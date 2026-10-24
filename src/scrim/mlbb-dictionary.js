'use strict';

// The coach's MLBB dictionary: role, lane and specialties for heroes named in a question, plus the lane and role names
// when the question is about lanes or roles (the textbook exam showed the model mixing them up). Data is a dated
// Liquipedia snapshot (CC-BY-SA), rebuilt with scripts/build-mlbb-heroes.js when a new hero comes out.
const { heroes, retrieved } = require('./mlbb-heroes.json');

const LANE = Object.freeze({ Gold: 'Gold Lane', Exp: 'EXP Lane', Mid: 'Mid Lane', Jungle: 'Jungle', Roam: 'Roam' });
const LANE_WORDS = /\b(lane|jungle|jungler|roam|roamer|role|tank|fighter|assassin|mage|marksman|support)\b/i;
// The exams showed the lane names alone invited made-up lane positions and mechanics, so the card also counts who fills
// each lane (primary role, at least a quarter of the lane's heroes). "spesialis" came back as "skill".
function laneFill(lane) {
  const inLane = heroes.filter(hero => hero.lanes.includes(lane));
  const roles = new Map();
  for (const hero of inLane) roles.set(hero.roles[0], (roles.get(hero.roles[0]) || 0) + 1);
  const main = [...roles].filter(([, count]) => count * 4 >= inLane.length).sort((a, b) => b[1] - a[1]);
  return `${LANE[lane]} ${main.map(([role, count]) => `${count} ${role}`).join(' dan ')} dari ${inLane.length} hero`;
}
const GLOSSARY = 'Lane di MLBB: Gold Lane, EXP Lane, Mid Lane, Jungle, Roam. Role hero: Tank, Fighter, Assassin, Mage, Marksman, Support. '
  + `Isi lane di kamus (role utama hero): ${Object.keys(LANE).map(laneFill).join('; ')}. `
  + 'Posisi lane di map dan mekanik lane nggak ada di kamus: jangan ditebak.';
const words = text => ` ${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
const MAX_HEROES = 3;

// Henry 2026-10-24: Liquipedia lists Chou as EXP Lane while the meta plays him at Roam, so named heroes get a flex note.
const FLEX = 'Lane versi Liquipedia itu lane utama hero; di meta hero bisa flex ke lane lain tergantung draft.';

function heroCard(text = '') {
  const said = words(text);
  const lines = heroes.filter(hero => said.includes(words(hero.name))).slice(0, MAX_HEROES)
    .map(hero => `${hero.name} (${hero.title}): role ${hero.roles.join(' dan ')}, lane versi Liquipedia ${hero.lanes
      .map(lane => LANE[lane] || lane).join(' atau ')}, keahlian (bukan nama skill) ${hero.specialties.join(' dan ')}.`);
  if (lines.length) lines.push(FLEX);
  if (LANE_WORDS.test(text)) lines.push(GLOSSARY);
  return lines.length ? [`KAMUS MLBB (Liquipedia, dicek ${retrieved})`, ...lines].join('\n') : '';
}

module.exports = { heroCard };
