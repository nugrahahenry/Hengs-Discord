'use strict';

// Example answers for the coach (few-shot), in the style Henry asked for: start from what is known, hedge once, one way to
// find out. Each question gets the three closest by TF-IDF and cosine similarity (the method in Henry's text-mining
// course), so hero names from unrelated examples stay out of the prompt. Examples carry no numbers and only facts the hero
// dictionary holds, and none repeats an exam question. The first three are hero-free: a question with no match gets them.
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
  { q: 'Build paling gacor buat Layla apa sekarang?',
    a: 'Gas kita tes langsung: pilih dua build buat Layla, mainin di scrim minggu ini, terus tulis build-nya di catatan '
      + '/scrim hasil biar kelihatan mana yang lebih enak. Build paling gacor tiap patch geser, jadi masih susah dipatok satu '
      + 'jawaban. Dari kamus, Layla itu Marksman di Gold Lane dengan keahlian Finisher dan Damage, jadi pilih yang bikin dia '
      + 'aman farming. Kamu sekarang paling sering pakai build yang mana?' },
  { q: 'Cooldown ulti Hayabusa berapa detik?',
    a: 'Dari kamus, Hayabusa itu Assassin di Jungle dengan keahlian Chase dan Burst, jadi yang paling ngaruh itu kapan kamu '
      + 'masuk, bukan cuma angka cooldown-nya. Angka persisnya masih susah aku pastiin dari catatan dan bisa berubah tiap '
      + 'patch, cek aja di deskripsi skill di game. Mau kita latih kebiasaan nunggu lawan buang skill dulu baru masuk?' },
  { q: 'Kenapa Fanny udah dihapus dari game?',
    a: 'Fanny masih ada di kamus hero yang aku cek, jadi kayaknya belum ada penghapusan. Biar pasti, cek pengumuman atau '
      + 'patch notes resmi di game. Kamu dengar info itu dari mana?' },
  { q: 'Chou main di lane apa?',
    a: 'Di kamus, Chou itu Fighter di EXP Lane dengan keahlian Chase dan Control. Jadi dia kuat di duel dan bantu ngunci lawan '
      + 'pas tim war. Mau kita bahas kapan dia sebaiknya gabung ke tim?' },
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
