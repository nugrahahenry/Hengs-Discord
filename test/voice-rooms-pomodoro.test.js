'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { begin, next, credit, phaseLine, alertText, statusText, summaryText } = require('../src/voice-rooms/pomodoro');

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 2, 12); // 19:00 WIB
const ts = (at, style) => `<t:${Math.floor(at / 1000)}:${style}>`;
const walk = state => {
  const seen = [];
  while (state.phase !== 'selesai') { seen.push(`${state.phase}${state.round}:${(state.endsAt - state.phaseStart) / MIN}`); state = next(state); }
  return { seen, state };
};

test('klasik runs 25/5 with a long break after the 4th focus and ends after the 8th', () => {
  const first = begin('klasik', T0);
  assert.deepEqual(first, { preset: 'klasik', round: 1, phase: 'fokus', phaseStart: T0, endsAt: T0 + 25 * MIN, startedAt: T0, done: 0, tally: {} });
  const { seen, state } = walk(first);
  assert.deepEqual(seen, ['fokus1:25', 'istirahat1:5', 'fokus2:25', 'istirahat2:5', 'fokus3:25', 'istirahat3:5', 'fokus4:25',
    'panjang4:15', 'fokus5:25', 'istirahat5:5', 'fokus6:25', 'istirahat6:5', 'fokus7:25', 'istirahat7:5', 'fokus8:25']);
  assert.equal(state.done, 8);
  assert.equal(state.endsAt - T0, 245 * MIN); // each phase starts where the last one ended, so nothing drifts
});

test('panjang runs 50/10 without a long break and ends after the 4th focus; unknown presets do not start', () => {
  const { seen, state } = walk(begin('panjang', T0));
  assert.deepEqual(seen, ['fokus1:50', 'istirahat1:10', 'fokus2:50', 'istirahat2:10', 'fokus3:50', 'istirahat3:10', 'fokus4:50']);
  assert.equal(state.done, 4);
  assert.equal(begin('nope', T0), null);
});

test('credit counts the seconds inside during the phase, never before it began and never below zero', () => {
  assert.equal(credit(T0 - 10 * MIN, T0, T0 + 25 * MIN), 25 * 60); // already inside when it began
  assert.equal(credit(T0 + 10 * MIN, T0, T0 + 25 * MIN), 15 * 60); // came in late
  assert.equal(credit(T0, T0, T0 + 90_500), 90); // whole seconds
  assert.equal(credit(T0 + 30 * MIN, T0, T0 + 25 * MIN), 0);
});

test('texts use Discord timestamps, mention only the members given and carry no em dash', () => {
  const focus = begin('klasik', T0); const pause = next(focus);
  let long = focus; for (let i = 0; i < 7; i++) long = next(long);
  assert.equal(long.phase, 'panjang');
  const texts = [
    [phaseLine(focus), `🍅 Fokus putaran 1/8 · selesai ${ts(focus.endsAt, 't')} (${ts(focus.endsAt, 'R')})`],
    [phaseLine(pause), `☕ Istirahat · fokus lagi ${ts(pause.endsAt, 't')} (${ts(pause.endsAt, 'R')})`],
    [phaseLine(long), `🌿 Istirahat panjang · fokus lagi ${ts(long.endsAt, 't')} (${ts(long.endsAt, 'R')})`],
    [alertText(focus, ['a', 'b']), `🍅 <@a> <@b> Fokus putaran 1/8 mulai. Selesai ${ts(focus.endsAt, 't')}.`],
    [alertText(pause, []), `☕ Istirahat 5 menit. Fokus lagi ${ts(pause.endsAt, 't')}.`],
    [alertText(long, ['a']), `🌿 <@a> Istirahat panjang 15 menit. Fokus lagi ${ts(long.endsAt, 't')}.`],
    [statusText(focus), `🍅 fokus putaran 1/8 sampai ${ts(focus.endsAt, 't')}`],
    [statusText(pause), '☕ istirahat'],
    [statusText(long), '🌿 istirahat panjang'],
    [summaryText({ ...pause, done: 3 }, [['Andi', 4500], ['Sinta', 3000], ['Lewat', 30]]),
      '✅ Sesi Pomodoro selesai: 3 putaran fokus. Andi 75 menit, Sinta 50 menit.'],
    [summaryText(focus, []), '✅ Sesi Pomodoro selesai: 0 putaran fokus.'],
  ];
  for (const [actual, expected] of texts) { assert.equal(actual, expected); assert.doesNotMatch(actual, /—/); }
});
