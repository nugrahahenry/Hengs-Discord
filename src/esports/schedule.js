'use strict';

// Match-day facts for Hengs Analis, counted from parsed Liquipedia pages: who plays on a WIB day, the season record
// between two teams, a team's go-to heroes, the numbers of a day or an event. Pure; every number comes from the data.
const WIB = 7 * 3_600_000;
const DAY_MS = 86_400_000;

const wibDay = at => new Date(at + WIB).toISOString().slice(0, 10);
const wibMinutes = at => { const d = new Date(at + WIB); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const previousDay = day => new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
const knownTeam = team => Boolean(team?.key?.trim()) && !/^(tbd|tba|bye)$/i.test(team.key.trim());
const same = (a, b) => a.key.trim().toLowerCase() === b.key.trim().toLowerCase();
const done = match => match.finished && match.valid;
const tag = team => team.ticker || team.name;

// Every match on the watched pages with its page's league, family and event. Pages without a family are series-card
// only, so they never feed previews or recaps.
function matchesOf(pages, watch) {
  return watch.filter(w => w.family).flatMap(w => (pages?.[w.title]?.matches || [])
    .map(match => ({ ...match, league: w.league, family: w.family, event: w.event || null })));
}

// Matches of one WIB day whose two teams are known, by start time.
function dayMatches(all, day) {
  return all.filter(m => m.startAt && wibDay(m.startAt) === day && m.teams.every(knownTeam)).sort((a, b) => a.startAt - b.startAt);
}

// Head-to-head in one family, from a's side: series and game wins.
function record(all, family, a, b) {
  const series = [0, 0]; const games = [0, 0];
  for (const m of all) {
    if (m.family !== family || !done(m) || !m.teams.every(knownTeam)) continue;
    const order = same(m.teams[0], a) && same(m.teams[1], b) ? [0, 1] : same(m.teams[0], b) && same(m.teams[1], a) ? [1, 0] : null;
    if (!order) continue;
    series[order[m.winner - 1]] += 1;
    games[order[0]] += m.score[0]; games[order[1]] += m.score[1];
  }
  return { series, games };
}

// A team's most picked heroes in one family, from decided games; ties by name.
function heroPool(all, family, team, limit = 3) {
  const count = new Map();
  for (const m of all) {
    if (m.family !== family) continue;
    const side = m.teams.findIndex(t => knownTeam(t) && same(t, team));
    if (side < 0) continue;
    for (const g of m.games) if (g.winner) for (const hero of g.picks[side] || []) count.set(hero, (count.get(hero) || 0) + 1);
  }
  return [...count].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, limit).map(([name, picks]) => ({ name, picks }));
}

// On a busy day only `limit` matches get a full preview: Indonesian or Philippine teams first, then the earliest.
const LOCAL = /indonesia|philippines/i;
function featured(matches, limit = 4) {
  if (matches.length <= limit) return matches;
  const local = m => m.teams.some(t => LOCAL.test(`${t.key} ${t.name}`));
  return [...matches].sort((a, b) => (local(b) - local(a)) || a.startAt - b.startAt).slice(0, limit).sort((a, b) => a.startAt - b.startAt);
}

const seconds = length => { const [m, sec] = String(length).split(':').map(Number); return m * 60 + sec; };

// Numbers of finished matches: picks and bans (top N), the best win rate from three picks, wins by side, the longest
// and shortest game, MVPs.
function statsOf(matches, { top = 1 } = {}) {
  const finished = matches.filter(done);
  const games = finished.flatMap(m => m.games.filter(g => g.winner).map(g => ({ ...g, match: m })));
  const picks = new Map(); const bans = new Map(); const wins = new Map();
  for (const g of games) {
    for (const t of [0, 1]) {
      for (const hero of g.picks[t] || []) {
        picks.set(hero, (picks.get(hero) || 0) + 1);
        if (g.winner === t + 1) wins.set(hero, (wins.get(hero) || 0) + 1);
      }
      for (const hero of g.bans[t] || []) bans.set(hero, (bans.get(hero) || 0) + 1);
    }
  }
  const rank = map => [...map].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, top).map(([name, count]) => ({ name, count }));
  const best = [...picks].filter(([, n]) => n >= 3).map(([name, n]) => ({ name, wins: wins.get(name) || 0, picks: n }))
    .sort((x, y) => y.wins / y.picks - x.wins / x.picks || y.picks - x.picks || x.name.localeCompare(y.name))[0] || null;
  const sides = { blue: 0, red: 0, decided: 0 };
  for (const g of games) {
    const side = g.sides?.[g.winner - 1];
    if (side === 'blue' || side === 'red') { sides[side] += 1; sides.decided += 1; }
  }
  const timed = games.filter(g => /^\d{1,2}:\d{2}$/.test(g.length || ''));
  const pick = better => timed.reduce((a, g) => (!a || better(seconds(g.length), seconds(a.length)) ? g : a), null);
  return { series: finished.length, games: games.length, picks: rank(picks), bans: rank(bans), best, sides,
    longest: pick((x, y) => x > y), shortest: pick((x, y) => x < y),
    mvps: finished.filter(m => m.mvp).map(m => ({ mvp: m.mvp, match: m })) };
}

// An event is complete when every match on its pages is finished (TBD slots count as unfinished); the final is the
// finished match that started last.
function eventState(all, event) {
  const matches = all.filter(m => m.event === event);
  if (!matches.length || !matches.every(m => done(m) && m.teams.every(knownTeam))) return { complete: false, matches };
  const final = matches.reduce((a, m) => (!a || (m.startAt || 0) > (a.startAt || 0) ? m : a), null);
  return { complete: true, matches, final };
}

module.exports = { WIB, wibDay, wibMinutes, previousDay, knownTeam, matchesOf, dayMatches, record, heroPool, featured,
  statsOf, eventState, tag };
