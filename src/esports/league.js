'use strict';

// Liga Tebak (owner request, 2026-10-26): the match-day guesses become a league per event. A right guess is 1 point;
// the day's Laga Panas (the voted match with the most voters, at least 3, ties included) is 2. Members are ranked from
// 3 guesses, by points, then accuracy, then number of guesses; members equal on all three share the rank. For fun
// only: nothing to win but a role and an appreciation card. Pure: no Discord, no disk.
const { cleanName, dayLabel } = require('./daily');

function hotMatchIds(matches, votesByMatch, { min = 3 } = {}) {
  const counts = matches.map(m => [m.id, Object.keys(votesByMatch[m.id] || {}).length]).filter(([, n]) => n >= min);
  const top = Math.max(0, ...counts.map(([, n]) => n));
  return new Set(counts.filter(([, n]) => n === top).map(([id]) => id));
}

// Per member for one finished match: what to add to their ledger row.
function pointsFor(picks, winner, weight) {
  return Object.fromEntries(Object.entries(picks || {}).map(([user, team]) => {
    const right = team === winner;
    return [user, { points: right ? weight : 0, right: right ? 1 : 0, votes: 1, hot: right && weight > 1 ? 1 : 0 }];
  }));
}

// Accuracy is compared by cross multiplication, so equal ratios (2 of 3, 4 of 6) stay equal.
function standings(users, { min = 3 } = {}) {
  const rows = Object.entries(users || {}).map(([user, s]) => ({ user, ...s })).filter(s => s.votes >= min);
  const same = (a, b) => a.points === b.points && a.right * b.votes === b.right * a.votes && a.votes === b.votes;
  rows.sort((a, b) => b.points - a.points || b.right * a.votes - a.right * b.votes || b.votes - a.votes || a.user.localeCompare(b.user));
  rows.forEach((row, i) => { row.rank = i && same(row, rows[i - 1]) ? rows[i - 1].rank : i + 1; });
  return rows;
}

const champions = table => table.filter(row => row.rank === 1);

function rankOf(users, userId, options) {
  const table = standings(users, options);
  return { rank: table.find(row => row.user === userId)?.rank || null, of: table.length, entry: users?.[userId] || null };
}

// The appreciation draft input for the champions (joint champions share the same numbers), or null without a usable
// name. Characters the appreciation form rejects (such as @) are dropped.
function championCard(event, winners, names, day) {
  const list = winners.map(w => cleanName(names[w.user]).replace(/@/g, '').replace(/https?:\/\/|discord\.gg/gi, '').trim())
    .filter(name => name && name !== 'Anggota');
  if (!list.length) return null;
  const [w] = winners; const joined = list.join(' dan ');
  return {
    recipient: joined.length <= 80 ? joined : 'Juara bersama Liga Tebak',
    achievement: `Juara Liga Tebak ${event} dengan ${w.points} poin (${w.right} benar dari ${w.votes} tebakan)`,
    occasion: event, date: dayLabel(day),
    ...(joined.length > 80 ? { players: list.slice(0, 8).join('; ') } : {}),
  };
}

module.exports = { hotMatchIds, pointsFor, standings, champions, rankOf, championCard };
