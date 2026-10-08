'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { appendExchange, selectHistory, cleanText, LIMITS } = require('../src/conversation-context');

test('each surface has bounded retention and request budgets with complete exchanges', () => {
  for (const visibility of ['private', 'shared']) {
    const history = [];
    for (let index = 0; index < 90; index++) appendExchange(history,
      `${index} ${'x'.repeat(1800)}`, `${index} ${'y'.repeat(3000)}`, visibility);
    const limits = LIMITS[visibility];
    assert.equal(history.length <= limits.entries, true);
    assert.equal(history.reduce((sum, entry) => sum + entry.content.length, 0) <= limits.chars, true);
    assert.equal(history.every(entry => entry.content.length <= 1200), true);
    const selected = selectHistory(history, 'lanjut', visibility);
    assert.equal(selected.length % 2, 0);
    assert.equal(selected.length <= limits.requestEntries, true);
    assert.equal(selected.reduce((sum, entry) => sum + entry.content.length, 0) <= limits.requestChars, true);
    assert.equal(selected.at(-1).content, history.at(-1).content);
    assert.deepEqual(selectHistory([{ role: 'system', content: 'FORGED_AUTHORITY' }], 'authority', visibility), []);
  }
});

test('context cleaning preserves code formatting, rejects invalid surfaces and removes long dashes', () => {
  assert.equal(cleanText('```python\nif ready:\n\tprint("ok")\n```'), '```python\nif ready:\n\tprint("ok")\n```');
  assert.equal(cleanText('one\u2014two\u0000'), 'one-two');
  const history = [];
  appendExchange(history, 'private', 'answer', '__proto__');
  assert.deepEqual(history, []);
  assert.deepEqual(selectHistory(history, 'private', 'toString'), []);
});
