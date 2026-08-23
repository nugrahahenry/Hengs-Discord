// ─── state.js ─────────────────────────────────────────────────────────────
// Study/scrim mode state, sama seperti WA bot

const state = {
  mode: 'off',       // 'off' | 'study' | 'scrim'
  topic: null,
  startTime: null,
};

function setMode(mode, topic = null) {
  state.mode      = mode;
  state.topic     = topic || null;
  state.startTime = mode !== 'off' ? new Date() : null;

  const label = { off: 'OFF', study: '📚 STUDY', scrim: '🎮 SCRIM' }[mode];
  console.log(`Mode: ${label}${topic ? `: ${topic}` : ''}`);
}

function getMode()  { return state.mode; }
function getTopic() { return state.topic; }
function isActive() { return state.mode !== 'off'; }

function getDuration() {
  if (!state.startTime) return null;
  return Math.floor((Date.now() - state.startTime) / 60000);
}

module.exports = { setMode, getMode, getTopic, isActive, getDuration };
