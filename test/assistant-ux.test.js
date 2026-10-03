const assert = require('node:assert/strict');
const test = require('node:test');

const {
  THINKING_MESSAGE,
  thinkingReplyPayload,
  startTypingIndicator,
} = require('../src/assistant-ux');

test('thinking reply is fixed and mention-safe', () => {
  assert.equal(thinkingReplyPayload().content, THINKING_MESSAGE);
  assert.deepEqual(thinkingReplyPayload().allowedMentions, { parse: [] });
});

test('typing indicator refreshes once and stops cleanly', async () => {
  const calls = [];
  let scheduled = null;
  const channel = {
    async sendTyping() { calls.push('typing'); },
  };
  const stop = await startTypingIndicator(channel, {
    refreshMs: 8_000,
    setTimeoutFn(callback, delay) {
      scheduled = { callback, delay, cleared: false };
      return scheduled;
    },
    clearTimeoutFn(handle) {
      handle.cleared = true;
    },
  });
  assert.deepEqual(calls, ['typing']);
  assert.equal(scheduled.delay, 8_000);
  await scheduled.callback();
  assert.deepEqual(calls, ['typing', 'typing']);
  stop();
  assert.equal(scheduled.cleared, true);
});

test('typing indicator degrades when the channel cannot send typing', async () => {
  const stop = await startTypingIndicator({});
  assert.equal(typeof stop, 'function');
  stop();
});
