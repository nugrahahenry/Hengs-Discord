'use strict';

// "Buku pintar": MLBB knowledge from Henry (ex competitive player) that no open source holds, such as item cores, item
// counters, jungle rotation and meta lanes. A question gets the entries whose pattern it matches, under a dated header,
// so the coach can say how old its knowledge is. Add entries here when Henry shares more; set PATCH once he names it.
const { dayLabel } = require('./stats');

const CHECKED = '2026-10-24';
const PATCH = null;
const ENTRIES = Object.freeze([
  { match: /\btrinity\b|\b(build|item|core|inti)\s+(mm|marksman)\b|\b(mm|marksman)\s+(build|item)\b|\bcrit(ical)?\b/i,
    text: "Item inti Marksman (MM) disebut trinity, ada dua tipe. Trinity critical: Haas's Claws, Berserker's Fury, "
      + 'Windtalker. Trinity biasa: Corrosion Scythe, Demon Hunter Sword, Golden Staff. Yang sering bikin bingung itu '
      + 'urutan belinya; urutannya belum ada di buku.' },
  { match: /\bcounter\b|\bblade armor\b|\bchastise\b/i,
    text: 'Counter trinity critical: Blade Armor. Counter trinity biasa: Chastise Pauldron.' },
  { match: /\bbuff\b|\brotasi\b|\bgank\b|\bjungler?\b.*\b(mulai|start|awal)\b/i,
    text: 'Buff awal jungler nentuin rotasinya: mulai dari buff biru biasanya rotasi ke bawah (buff biru dekat lane atas), '
      + 'mulai dari buff merah biasanya rotasi ke atas. Ini pola umum, sekitar 80% kebaca begitu, bukan pasti. Angka yang '
      + 'penting buat baca rotasi: kapan buff selesai dan mulai dari buff mana; angka waktu buff belum ada di buku.' },
  { match: /\bchou\b|\b(dua|2|double)\s+fighter\b/i,
    text: 'Chou di kamus Liquipedia tercatat EXP Lane, tapi di meta sekarang lebih sering dipakai Roam dan bisa flex ke Gold '
      + 'Lane, apalagi di meta dua Fighter yang kuncinya assassin cepat seperti Nolan atau Hirara, atau bawa Yi Sun-shin '
      + 'di jungle dan Kimmy di mid.' },
  { match: /\bemblem\b|\btalent\b/i,
    text: 'Emblem nggak cuma ikut role, tapi tergantung hero-nya.' },
]);
const HEADER = `BUKU PINTAR MLBB (ilmu dari Henry, eks pemain kompetitif; dicek ${dayLabel(CHECKED)}, `
  + `${PATCH ? `patch ${PATCH}` : 'patch belum dicatat'})`;

function textbookCard(text = '') {
  const lines = ENTRIES.filter(entry => entry.match.test(String(text ?? ''))).map(entry => `- ${entry.text}`);
  return lines.length ? [HEADER, ...lines].join('\n') : '';
}

module.exports = { textbookCard };
