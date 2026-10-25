'use strict';

// Member predictions on match previews: a short key for the button id and the share who guessed right. Points and
// standings live in league.js (Liga Tebak).
const crypto = require('node:crypto');

const voteKey = matchId => crypto.createHash('sha256').update(String(matchId)).digest('hex').slice(0, 12);

function shareRight(votes = {}, winner) {
  const all = Object.values(votes || {});
  const right = all.filter(team => team === winner).length;
  return { voters: all.length, right, share: all.length ? Math.round((right / all.length) * 100) : 0 };
}

module.exports = { voteKey, shareRight };
