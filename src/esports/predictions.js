'use strict';

// Member predictions on match previews: a short key for the button id, who guessed right, the event's top guessers.
// For fun only: no points, prizes or odds.
const crypto = require('node:crypto');

const voteKey = matchId => crypto.createHash('sha256').update(String(matchId)).digest('hex').slice(0, 12);

function shareRight(votes = {}, winner) {
  const all = Object.values(votes || {});
  const right = all.filter(team => team === winner).length;
  return { voters: all.length, right, share: all.length ? Math.round((right / all.length) * 100) : 0 };
}

// Members with the most right guesses over finished matches (at least `min` votes), best first.
function topGuessers(votesByMatch, matches, { min = 3, limit = 3 } = {}) {
  const score = new Map();
  for (const match of matches) {
    if (!match.finished || !match.valid) continue;
    for (const [user, team] of Object.entries(votesByMatch[match.id] || {})) {
      const s = score.get(user) || { user, right: 0, votes: 0 };
      s.votes += 1; if (team === match.winner) s.right += 1;
      score.set(user, s);
    }
  }
  return [...score.values()].filter(s => s.votes >= min)
    .sort((a, b) => b.right - a.right || b.votes - a.votes || a.user.localeCompare(b.user)).slice(0, limit);
}

module.exports = { voteKey, shareRight, topGuessers };
