'use strict';

const TYPING_REFRESH_MS = 8_000;
const THINKING_MESSAGE = '🤔 Hengs sedang menyusun jawaban...';

function thinkingReplyPayload() {
  return {
    content: THINKING_MESSAGE,
    allowedMentions: { parse: [] },
  };
}

async function startTypingIndicator(channel, {
  refreshMs = TYPING_REFRESH_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (!channel || typeof channel.sendTyping !== 'function') return () => {};

  let stopped = false;
  let timer = null;
  const pulse = async () => {
    if (stopped) return;
    await Promise.resolve(channel.sendTyping()).catch(() => {});
    if (!stopped) {
      timer = setTimeoutFn(pulse, refreshMs);
      timer.unref?.();
    }
  };

  await pulse();
  return () => {
    stopped = true;
    if (timer) clearTimeoutFn(timer);
  };
}

module.exports = { THINKING_MESSAGE, thinkingReplyPayload, startTypingIndicator };
