'use strict';

// "Buku pintar": MLBB knowledge from Henry (ex competitive player) that no open source holds, such as item cores, item
// counters, jungle rotation and meta lanes. A question gets the entries whose pattern it matches, under a dated header,
// so the coach can say how old its knowledge is. Add entries here when Henry shares more, and move PATCH with them.
const { dayLabel } = require('./stats');

const CHECKED = '2026-10-24';
// Henry: patch 2.2.16a, season 42. Liquipedia (checked 2026-10-24): released 2026-10-14, newest patch page.
const PATCH = 'patch 2.2.16a rilis 14 Okt 2026, season 42';
// A Marksman build question: trinity words, or build/item next to "mm" or one of the Marksmen Henry named.
const MM = 'mm|marksman|irithel|miya|obsidia|layla|bruno|moskov|hanabi|karrie|wanwan|melissa|claude';
const MM_BUILD = new RegExp(`\\btrinity\\b|\\bsky piercer\\b|\\bcrit(ical)?\\b|\\b(build|item|core|inti)\\b[^.?!]*\\b(${MM})\\b`
  + `|\\b(${MM})\\b[^.?!]*\\b(build|item)\\b`, 'i');
// Questions about where the enemy jungler starts or rotates (an anti-gank question counts too).
const JUNGLE_START = /\bbuff\b|\brotasi\b|\bgank\b|\bjungler?\b.*\b(mulai|start|awal)\b/i;
// Item names checked against Liquipedia page titles on 2026-10-24.
const ENTRIES = Object.freeze([
  { match: MM_BUILD,
    text: "Item inti Marksman (MM) disebut trinity, ada dua tipe. Trinity critical: Haas's Claws, Berserker's Fury, "
      + 'Windtalker. Trinity biasa: Corrosion Scythe, Demon Hunter Sword, Golden Staff. Tipe yang dipakai tergantung hero.' },
  { match: MM_BUILD,
    text: "Urutan trinity critical: biasanya Windtalker dulu (efek angin-nya lebih sakit daripada Haas's Claws duluan yang "
      + "isinya lifesteal), lalu Berserker's Fury, kecuali MM yang butuh Sky Piercer seperti Obsidia. Bruno biasanya Haas's "
      + 'Claws duluan karena power spike-nya di item itu. MM yang biasa pakai trinity critical: Irithel, Layla, Bruno, Miya, '
      + 'Obsidia. Moskov dan Hanabi bisa, tapi agak susah, jadi lebih cocok trinity biasa.' },
  { match: MM_BUILD,
    text: 'Urutan trinity biasa: Corrosion Scythe dulu, lalu Golden Staff atau Demon Hunter Sword; kalau lawan banyak tank '
      + 'tebal, Demon Hunter Sword dulu baru Golden Staff. Sky Piercer bisa masuk setelah Corrosion Scythe kalau lagi menang, '
      + 'atau setelah Golden Staff atau Demon Hunter Sword kalau lagi kalah. MM yang biasa pakai trinity biasa: Karrie, '
      + 'Moskov, Hanabi, Wanwan, Melissa, Claude, juga Miya dan Obsidia (dua ini lebih condong ke trinity biasa, tapi bisa '
      + 'critical).' },
  { match: /\bcounter\b|\bblade armor\b|\bchastise\b/i,
    text: 'Counter trinity critical: Blade Armor. Counter trinity biasa: Chastise Pauldron.' },
  { match: JUNGLE_START,
    text: 'Buff awal jungler nentuin rotasinya: mulai dari buff biru biasanya rotasi ke bawah (buff biru dekat lane atas), '
      + 'mulai dari buff merah biasanya rotasi ke atas. Ini pola umum, sekitar 80% kebaca begitu, bukan pasti. Angka yang '
      + 'penting buat baca rotasi: kapan buff selesai dan mulai dari buff mana.' },
  // Henry checked these gold numbers with a friend in game.
  { match: JUNGLE_START,
    text: 'Cara baca start jungler lawan dari gold-nya di awal game (semua mulai 300): 380 berarti mulai buff merah, 379 buff '
      + 'biru, 430 kumbang yang beranak di bawah, 407-413 kadal (lizard) di atas. Di patch ini nggak semua start dari buff, '
      + 'kadang ada yang start ijo; kondisinya ada di pola jungle yang belum dicatat, tapi start ijo bisa mencegah EXP Laner '
      + 'atau Gold Laner buat cut lane.' },
  { match: /\bbuff\b|\bturtle\b|\brespawn\b|\bspawn\b|\bjungle\b|\bcamp\b/i,
    text: 'Waktu jungle (patch 2.2.16a): Buff biru dan buff merah pertama muncul di 00:25; buff dan monster jungle respawn 75 '
      + 'detik setelah diambil. Turtle pertama muncul di 02:00 dan respawn 180 detik. Waktu Lord belum ada di buku.' },
  { match: /\bchou\b|\b(dua|2|double)\s+fighter\b/i,
    text: 'Chou di kamus Liquipedia tercatat EXP Lane, tapi di meta sekarang lebih sering dipakai Roam dan bisa flex ke Gold '
      + 'Lane, apalagi di meta dua Fighter yang kuncinya assassin cepat seperti Nolan atau Hirara, atau bawa Yi Sun-shin '
      + 'di jungle dan Kimmy di mid.' },
  { match: /\bemblem\b|\btalent\b/i,
    text: 'Emblem nggak cuma ikut role, tapi tergantung hero-nya.' },
]);
const HEADER = `BUKU PINTAR MLBB (ilmu dari Henry, eks pemain kompetitif; ${PATCH}; dicek ${dayLabel(CHECKED)})`;

function textbookCard(text = '') {
  const lines = ENTRIES.filter(entry => entry.match.test(String(text ?? ''))).map(entry => `- ${entry.text}`);
  return lines.length ? [HEADER, ...lines].join('\n') : '';
}

module.exports = { textbookCard };
