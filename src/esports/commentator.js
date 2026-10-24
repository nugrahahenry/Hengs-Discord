'use strict';

// Hengs Analis caster: an LLM writes a short caster-style caption or answer, but only from a fact card Hengs computed.
// Every number, hero and team the text names must appear in the card (or, for an answer, in the member's question).
// One retry with the rejected tokens named, then null so the caller uses its template. The textbook exam and the chat
// probes showed the model inventing MLBB facts, so nothing it adds on its own gets through.
const { heroes } = require('../scrim/mlbb-heroes.json');

const HERO_NAMES = heroes.map(hero => hero.name);
const words = text => ` ${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
const numbers = text => String(text).match(/\d+/g) || [];
const BETTING = /\b(taruhan|odds|judi|betting|voor)\b/i;
// En and em dashes become commas (UI copy has none); built from char codes so this file stays dash-free.
const DASHES = [0x2013, 0x2014].map(code => String.fromCharCode(code));
const tidy = text => DASHES.reduce((out, dash) => out.split(dash).join(','), String(text || ''))
  .replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();

function check(text, card, { teams = [], max = 250 } = {}) {
  const bad = [];
  const known = new Set(numbers(card));
  for (const n of numbers(text)) if (!known.has(n)) bad.push(n);
  const inCard = words(card); const inText = words(text);
  for (const name of [...HERO_NAMES, ...teams]) {
    const w = words(name);
    if (w.trim().length >= 2 && inText.includes(w) && !inCard.includes(w)) bad.push(name);
  }
  if (BETTING.test(text)) bad.push('taruhan');
  if (text.length > max) bad.push('terlalu panjang');
  return { ok: !bad.length, bad: [...new Set(bad)] };
}

const STYLE = 'Bahasa Indonesia santai kayak caster MLBB yang lagi semangat. Pakai cuma FAKTA yang dikasih: jangan nambah angka, '
  + 'nama tim, pemain atau hero yang nggak ada di FAKTA, dan jangan nebak hasil. Tanpa em dash, tanpa hashtag, tanpa ngomongin '
  + 'taruhan atau odds. Balas JSON {"text": "..."}.';
const CAPTION = {
  preview: `Tulis SATU caption pendek (maksimal 250 karakter) buat preview laga: bangun hype dari rekor musim atau hero andalan. ${STYLE}`,
  day: `Tulis SATU caption pendek (maksimal 250 karakter) buat rekap hari ini: soroti hasil paling menarik dan satu angka hero. ${STYLE}`,
  event: `Tulis SATU caption pendek (maksimal 250 karakter) buat rekap event: rayakan juaranya dan satu angka menarik. ${STYLE}`,
};
const ANSWER = 'Kamu Hengs, asisten Analis MLBB di Discord. Jawab pertanyaan member pakai FAKTA dari data Liquipedia di bawah '
  + '(maksimal 600 karakter). Kalau jawabannya nggak ada di FAKTA, bilang terus terang datanya belum ada dan sarankan cek '
  + '#hengs-analis atau Liquipedia. Jangan pakai kata "FAKTA" di jawaban; sebut "data Hengs" atau "data Liquipedia". '
  + STYLE;

function createCommentator({ complete = null, logger = console } = {}) {
  async function write(system, card, { question = '', teams = [], max = 250 } = {}) {
    if (!complete || !card) return null;
    const allowed = question ? `${card}\n${question}` : card;
    let note = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      let text;
      try {
        const raw = await complete([{ role: 'system', content: system },
          { role: 'user', content: `FAKTA:\n${card}${question ? `\n\nPERTANYAAN: ${question}` : ''}${note}` }]);
        text = tidy(JSON.parse(raw)?.text);
      } catch { logger.error('[esports] ESPORTS_CASTER_FAILED'); return null; }
      if (!text) return null;
      const verdict = check(text, allowed, { teams, max });
      if (verdict.ok) return text;
      note = `\n\nTulisan sebelumnya ditolak karena menyebut hal di luar fakta: ${verdict.bad.join(', ')}. Tulis ulang tanpa itu.`;
    }
    logger.error('[esports] ESPORTS_CASTER_REJECTED');
    return null;
  }
  return {
    caption: (kind, card, { teams = [] } = {}) => write(CAPTION[kind], card, { teams, max: 250 }),
    answer: (question, card, { teams = [] } = {}) => write(ANSWER, card, { question, teams, max: 600 }),
  };
}

// Groq JSON call for the caster; no client (no key) means no caster and the templates stay.
function createCasterCompletion({ client, model } = {}) {
  if (!client || !model) return null;
  return async messages => {
    const response = await client.chat.completions.create({ model, messages, temperature: 0.7, max_completion_tokens: 900,
      reasoning_effort: 'low', include_reasoning: false, response_format: { type: 'json_object' } }, { timeout: 15_000, maxRetries: 0 });
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('ESPORTS_CASTER_EMPTY');
    return content;
  };
}

module.exports = { check, createCommentator, createCasterCompletion };
