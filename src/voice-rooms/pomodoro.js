'use strict';

// Pomodoro in Belajar rooms (owner request, 2026-10-28: "Room Belajar + Pomodoro dulu"), the pure part: the presets, the
// phase after this one, focus credit and the texts. Times are epoch ms; a phase starts where the last one ended, so the
// schedule never drifts with a late timer.
const MIN = 60_000;
const PRESETS = Object.freeze({
  klasik: Object.freeze({ key: 'klasik', label: 'Klasik 25/5', emoji: '🍅', focus: 25 * MIN, pause: 5 * MIN, long: 15 * MIN, every: 4, rounds: 8 }),
  panjang: Object.freeze({ key: 'panjang', label: 'Panjang 50/10', emoji: '🔥', focus: 50 * MIN, pause: 10 * MIN, long: 0, every: 0, rounds: 4 }),
});

const ts = (at, style) => `<t:${Math.floor(at / 1000)}:${style}>`;

// state: { preset, round, phase: 'fokus' | 'istirahat' | 'panjang' | 'selesai', phaseStart, endsAt, startedAt, done, tally }
function begin(presetKey, at) {
  const preset = PRESETS[presetKey];
  return preset ? { preset: preset.key, round: 1, phase: 'fokus', phaseStart: at, endsAt: at + preset.focus, startedAt: at, done: 0, tally: {} } : null;
}

// The phase after `state` ends. The last focus round ends the session (phase 'selesai').
function next(state) {
  const preset = PRESETS[state.preset]; const at = state.endsAt;
  if (state.phase !== 'fokus') return { ...state, round: state.round + 1, phase: 'fokus', phaseStart: at, endsAt: at + preset.focus };
  const done = state.done + 1;
  if (state.round >= preset.rounds) return { ...state, done, phase: 'selesai' };
  const long = preset.every > 0 && state.round % preset.every === 0;
  return { ...state, done, phase: long ? 'panjang' : 'istirahat', phaseStart: at, endsAt: at + (long ? preset.long : preset.pause) };
}

// Whole seconds a member was inside during the phase, up to `until`.
const credit = (joinedAt, phaseStart, until) => Math.max(0, Math.floor((until - Math.max(joinedAt, phaseStart)) / 1000));

const rounds = state => `${state.round}/${PRESETS[state.preset].rounds}`;
const pauseName = state => (state.phase === 'panjang' ? 'Istirahat panjang' : 'Istirahat');
const pauseEmoji = state => (state.phase === 'panjang' ? '🌿' : '☕');

// The owner panel's line for the running phase.
function phaseLine(state) {
  if (state.phase === 'fokus') return `🍅 Fokus putaran ${rounds(state)} · selesai ${ts(state.endsAt, 't')} (${ts(state.endsAt, 'R')})`;
  return `${pauseEmoji(state)} ${pauseName(state)} · fokus lagi ${ts(state.endsAt, 't')} (${ts(state.endsAt, 'R')})`;
}

// The room chat message when a phase begins; ids are the members inside, the only ones it mentions.
function alertText(state, ids) {
  const who = ids.map(id => `<@${id}> `).join('');
  if (state.phase === 'fokus') return `🍅 ${who}Fokus putaran ${rounds(state)} mulai. Selesai ${ts(state.endsAt, 't')}.`;
  const minutes = Math.round((state.endsAt - state.phaseStart) / MIN);
  return `${pauseEmoji(state)} ${who}${pauseName(state)} ${minutes} menit. Fokus lagi ${ts(state.endsAt, 't')}.`;
}

// The status inside the "lagi belajar" post in belajar-bareng.
function statusText(state) {
  if (state.phase === 'fokus') return `🍅 fokus putaran ${rounds(state)} sampai ${ts(state.endsAt, 't')}`;
  return `${pauseEmoji(state)} ${pauseName(state).toLowerCase()}`;
}

// names: [[displayName, seconds]], best first; members with less than a minute are left out.
function summaryText(state, names) {
  const people = names.filter(([, seconds]) => seconds >= 60).map(([name, seconds]) => `${name} ${Math.floor(seconds / 60)} menit`);
  return `✅ Sesi Pomodoro selesai: ${state.done} putaran fokus.${people.length ? ` ${people.join(', ')}.` : ''}`;
}

module.exports = { PRESETS, begin, next, credit, phaseLine, alertText, statusText, summaryText };
