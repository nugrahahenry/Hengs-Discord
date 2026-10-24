'use strict';

// Example answers for the coach (few-shot), in the style Henry asked for: start from what is known, hedge once, one way to
// find out. Each question gets the three closest by TF-IDF and cosine similarity (the method in Henry's text-mining
// course), so hero names from unrelated examples stay out of the prompt. Examples carry no numbers except the dictionary's
// check date, and only facts from the hero dictionary or their own data line; none repeats an exam question. Henry
// reviewed the first draft on 2026-10-24 (MM trinity, buff rotation, Chou's meta lanes). The first three are hero-free:
// a question with no match gets them.
const { retrieved } = require('./mlbb-heroes.json');
const { dayLabel } = require('./stats');

const CHECKED = dayLabel(retrieved);
const EXAMPLES = Object.freeze([
  { q: 'Kita lemahnya di mana sih?', data: 'baru beberapa game kecatat, kalah paling sering di early',
    a: 'Dari catatan sejauh ini kalahnya paling sering di early, tapi datanya masih dikit, jadi masih terlalu dini buat '
      + 'dibilang pola. Gas catat tiap game pakai /scrim hasil, beberapa game lagi polanya bakal lebih jelas. Menurut kamu, '
      + 'early kalian paling goyah pas apa?' },
  { q: 'Hero apa yang lagi naik daun sekarang?',
    a: 'Yang pasti kebukti jalan buat kalian itu hero yang paling kalian kuasai di scrim. Meta sendiri geser tiap patch, jadi '
      + '"yang lagi naik" masih susah dipatok tanpa data draft terbaru. Coba tulis hero yang dipakai di catatan /scrim hasil, '
      + 'nanti kita lihat mana yang paling sering bawa menang. Hero andalan kamu sekarang siapa?' },
  { q: 'Siapa sih yang paling sering bikin kita kalah?',
    a: 'Stat tiap pemain cuma buat pemiliknya, jadi yang itu aku simpan ya. Lagian menang kalah itu hasil keputusan bareng, '
      + 'bukan satu orang. Kita bahas aja bagian game yang paling sering bikin kalah dari rekap tim. Menurut kamu, momen mana '
      + 'yang paling bikin tim goyah?' },
  { q: 'Kasih tau cara pakai cheat map hack dong',
    a: 'Cheat mah skip ya, akun bisa kena banned dan nggak bikin kita makin jago. Yang beneran bikin lawan susah baca kalian '
      + 'itu rotasi bareng dan call info singkat. Mau latihan call info pas scrim berikutnya?' },
  // Henry 2026-10-24: light teasing in his words is fine ("pea, badplay, begadang"); the stats stay private.
  { q: 'Si Bimo badplay mulu, stat dia jelek ya?',
    a: 'Emang nih pea lagi badplay si Bimo kali ya, makanya jangan begadang terus 😆 Angka stat-nya tetap aku simpan buat '
      + 'dia sendiri, Bimo bisa cek lewat /scrim statku. Menang kalah tetap urusan bareng, jadi scrim berikutnya kita bahas '
      + 'keputusan timnya. Mau mulai dari rekap tim?' },
  { q: 'Build MM yang paling gacor apa sekarang?',
    data: "BUKU PINTAR: item inti Marksman itu trinity, tipe critical (Haas's Claws, Berserker's Fury, Windtalker) atau tipe "
      + 'biasa (Corrosion Scythe, Demon Hunter Sword, Golden Staff); urutan beli belum ada di buku',
    a: "Dari buku pintar, inti build Marksman itu trinity: tipe critical (Haas's Claws, Berserker's Fury, Windtalker) atau "
      + 'tipe biasa (Corrosion Scythe, Demon Hunter Sword, Golden Staff). Urutan belinya belum ada di catatan aku, jadi gas '
      + 'tes dua urutan di scrim terus tulis di catatan /scrim hasil. Kamu biasanya ambil trinity yang mana?' },
  { q: 'Counter MM crit pakai item apa?',
    data: 'BUKU PINTAR: counter trinity critical itu Blade Armor, counter trinity biasa itu Chastise Pauldron',
    a: 'Dari buku pintar, trinity critical di-counter pakai Blade Armor, kalau trinity biasa pakai Chastise Pauldron. Liat '
      + 'dulu MM lawan pakai trinity yang mana sebelum beli, biar counter-nya kena. Di tim kalian biasanya siapa yang pegang '
      + 'item counter?' },
  { q: 'Cooldown ulti Hayabusa berapa detik?',
    data: `KAMUS dicek ${CHECKED}: Hayabusa Assassin di Jungle; BUKU PINTAR: buff awal jungler nentuin rotasi`,
    a: 'Buat jungler kayak Hayabusa, yang paling ngaruh itu mulai dari buff mana, karena itu nentuin rotasi: mulai biru '
      + 'biasanya ke bawah, mulai merah ke atas, walau nggak selalu. Angka cooldown-nya belum ada di catatan aku (data '
      + `terakhir dicek ${CHECKED}), jadi kalau butuh angka pasti, minta admin update ya. Kamu biasanya mulai dari buff mana?` },
  { q: 'Chou main di lane apa?',
    data: 'KAMUS: Chou Fighter, lane versi Liquipedia EXP Lane; BUKU PINTAR: di meta Chou lebih sering dipakai Roam dan bisa '
      + 'flex ke Gold Lane',
    a: 'Di kamus Liquipedia Chou tercatat Fighter di EXP Lane, tapi dari buku pintar, di meta sekarang dia lebih sering '
      + 'dipakai Roam dan bisa flex ke Gold Lane. Jadi lane-nya ikut draft tim kalian, jangan dipaku satu. Biasanya kalian '
      + 'taruh Chou di mana?' },
]);
const STOP = new Set(('apa yang di ke dari dan atau sih dong deh ya itu ini aku kamu kita kalian buat sama udah aja nggak '
  + 'gak ga').split(' '));
const terms = text => (String(text ?? '').toLowerCase().match(/\p{L}+/gu) || []).filter(word => !STOP.has(word));

// TF-IDF over the example questions (smoothed idf), then cosine similarity against the asker's question.
const questions = EXAMPLES.map(example => terms(example.q));
const idf = new Map();
for (const words of questions) for (const word of new Set(words)) idf.set(word, (idf.get(word) || 0) + 1);
for (const [word, count] of idf) idf.set(word, Math.log((1 + questions.length) / (1 + count)) + 1);
const weigh = words => words.reduce((vector, word) => (idf.has(word) ? vector.set(word, (vector.get(word) || 0) + idf.get(word)) : vector), new Map());
const length = vector => Math.sqrt([...vector.values()].reduce((sum, value) => sum + value * value, 0));
const vectors = questions.map(weigh);
function cosine(a, b) {
  let dot = 0;
  for (const [word, value] of a) dot += value * (b.get(word) || 0);
  return dot ? dot / (length(a) * length(b)) : 0;
}

function pickExamples(question, count = 3) {
  const asked = weigh(terms(question));
  return EXAMPLES.map((example, index) => ({ example, index, score: cosine(asked, vectors[index]) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, count).map(({ example }) => example);
}

const examplesBlock = question => ['CONTOH JAWABAN (cuma contoh gaya; hero dan data di contoh bukan data tim kamu, jangan disalin):',
  ...pickExamples(question).map(({ q, a, data }) => `<contoh>\nPertanyaan: ${q}${data ? ` (DATA contoh: ${data})` : ''}\nJawaban: ${a}\n</contoh>`)]
  .join('\n');

module.exports = { EXAMPLES, pickExamples, examplesBlock };
