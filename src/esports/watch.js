'use strict';

// What Hengs Analis watches on Liquipedia. family groups the pages of one season or tournament (head-to-head and hero
// pools count across it); event names the tournament an event recap covers, null for record-only pages. Entries
// without a family (older callers, tests) stay series-card only. stream is the official live link for the kickoff
// reminder, only where it was checked (MPL Indonesia YouTube, detikInet 23 Oct 2026).
const MPL_ID_LIVE = 'https://www.youtube.com/@MPLIndonesia';
const WATCH = Object.freeze([
  { title: 'MPL/Philippines/Season 18/Playoffs', league: 'MPL PH S18 Playoffs', family: 'MPL/Philippines/Season 18', event: 'MPL PH S18 Playoffs' },
  { title: 'MPL/Indonesia/Season 18/Regular Season', league: 'MPL ID S18', family: 'MPL/Indonesia/Season 18', event: null, stream: MPL_ID_LIVE },
  { title: 'MPL/Indonesia/Season 18/Playoffs', league: 'MPL ID S18 Playoffs', family: 'MPL/Indonesia/Season 18', event: 'MPL ID S18 Playoffs',
    stream: MPL_ID_LIVE },
  { title: 'Esports Nations Cup/2026/Group Stage', league: 'Esports Nations Cup 2026', family: 'Esports Nations Cup/2026', event: 'Esports Nations Cup 2026' },
  { title: 'Esports Nations Cup/2026/Playoffs', league: 'Esports Nations Cup 2026 Playoffs', family: 'Esports Nations Cup/2026', event: 'Esports Nations Cup 2026' },
  { title: 'M8 World Championship', league: 'M8 World Championship', family: 'M8 World Championship', event: 'M8 World Championship' },
]);

// Stage pages of a world championship appear weeks before it starts; one prefix search a day finds them
// (VERIFIED 2026-10-24: only the main M8 page exists yet).
const DISCOVER = Object.freeze([{ prefix: 'M8 World Championship/', short: 'M8', family: 'M8 World Championship', event: 'M8 World Championship' }]);
const NOT_MATCHES = /\/(Statistics|Media|Broadcasts?|Teams|Players|Coaches)(\/|$)/i;

function discoveredEntries(titles, known) {
  const out = [];
  for (const rule of DISCOVER) {
    for (const title of titles) {
      if (!title.startsWith(rule.prefix) || NOT_MATCHES.test(title)
        || known.some(w => w.title === title) || out.some(w => w.title === title)) continue;
      out.push({ title, league: `${rule.short} ${title.slice(rule.prefix.length).replace(/\//g, ' ')}`, family: rule.family, event: rule.event });
    }
  }
  return out;
}

module.exports = { WATCH, DISCOVER, discoveredEntries };
