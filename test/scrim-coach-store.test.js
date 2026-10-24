'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCoachStore } = require('../src/scrim/coach-store');

const G = '223456789012345678', U = '323456789012345678';
const NOW = Date.UTC(2026, 9, 24, 5, 0);

test('the coach store keeps one team target and the last debrief day per guild in its own strict file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrim-coach-'));
  const file = path.join(dir, 'scrim-coach.json');
  try {
    const store = createCoachStore({ filePath: file });
    assert.deepEqual(store.get(G), { target: null, debriefDay: null });
    const target = { text: 'semua kumpul sebelum objective pertama', setBy: U, at: NOW };
    store.setTarget(G, target);
    store.markDebrief(G, 20385);
    assert.deepEqual(store.get(G), { target, debriefDay: 20385 });
    assert.deepEqual(createCoachStore({ filePath: file }).get(G), { target, debriefDay: 20385 });
    assert.deepEqual(fs.readdirSync(dir), ['scrim-coach.json']);
    for (const bad of [{ ...target, text: '' }, { ...target, text: 'ping <@1>' }, { ...target, text: 'x'.repeat(121) },
      { ...target, setBy: 'abc' }, { ...target, extra: 1 }]) {
      assert.throws(() => store.setTarget(G, bad), /COACH_STATE_INVALID/);
    }
    assert.throws(() => store.setTarget('not-a-guild', target), /COACH_STATE_INVALID/);
    fs.writeFileSync(file, '{"schemaVersion":1,"guilds":[{"guildId":"223456789012345678"}]}');
    assert.throws(() => store.get(G), /COACH_STATE_INVALID/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const seen = [];
  const missing = { readFileSync(file) { seen.push(file); throw Object.assign(new Error('missing'), { code: 'ENOENT' }); } };
  assert.deepEqual(createCoachStore({ fsImpl: missing }).get(G), { target: null, debriefDay: null });
  assert.ok(seen[0].endsWith(path.join('data', 'scrim-coach.json')));
});
