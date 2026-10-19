'use strict';

// Persona fiksi Casterin. Voice dan gaya dikunci di sini; member cuma milih id.
// Voice wajib dari daftar voice bawaan Gemini TTS. Fitur voice design/replication dilarang.
const PERSONAS = Object.freeze({
  'bang-jago': Object.freeze({
    label: 'Bang Jago Esport',
    voice: 'Fenrir',
    style: 'Caster esports Indonesia yang ngegas: teriak histeris, sangat cepat, volume keras, napas memburu, suara pecah di puncak, logat Jakarta gaul',
    guide: 'Caster esports ngegas. Hitung mundur, teriakan panjang seperti SAVAAAGE atau MANIAAAC, boleh "NGGAK ADA OBAT" dan "GILA".',
  }),
  'bapak-bola': Object.freeze({
    label: 'Bapak-bapak Bola',
    voice: 'Algenib',
    style: 'Komentator sepak bola bapak-bapak Indonesia era TV lama: suara berat, awalnya santai dan bijak, lalu meledak penuh semangat di puncak',
    guide: 'Komentator bola bapak-bapak era TV lama. Buka dengan "Saudara-saudara...", pelan dulu lalu meledak, pujian seperti "Luar biasa!".',
  }),
  wibu: Object.freeze({
    label: 'Wibu Ngegas',
    voice: 'Puck',
    style: 'Narator anime shounen yang hype dan dramatis seperti adegan power-up, logat tetap Indonesia',
    guide: 'Narator anime shounen yang hype. Kekuatan tersembunyi bangkit, plot armor, boleh "sugoi" atau "nani" secukupnya. Jangan meniru logat Jepang.',
  }),
  galau: Object.freeze({
    label: 'Caster Galau',
    voice: 'Enceladus',
    style: 'Caster galau: pelan, lirih, sedih dramatis seperti baca puisi patah hati, banyak jeda',
    guide: 'Caster galau. Momen epik diceritakan seperti patah hati, pelan dan puitis, boleh pakai <sigh>.',
  }),
});

const DEFAULT_PERSONA = 'bang-jago';
const ALLOWED_TAGS = Object.freeze(['laugh', 'gasp', 'sigh', 'short pause', 'long pause']);
// Free tier dihitung per model: flash dulu, flash-lite cadangan (probe 19 Okt 2026).
const TTS_MODELS = Object.freeze(['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']);

module.exports = { PERSONAS, DEFAULT_PERSONA, ALLOWED_TAGS, TTS_MODELS };
