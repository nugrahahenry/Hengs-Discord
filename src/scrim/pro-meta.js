'use strict';

// Pro draft numbers for the coach, counted from the Liquipedia pages Hengs Analis already parses (picks, bans, winner per
// game). Only decided games with full 5v5 picks count, and every line carries its sample size. Liquipedia text is
// CC-BY-SA, so a coach reply that used this card (or the hero dictionary) gets LIQUIPEDIA_CREDIT.
const LIQUIPEDIA_CREDIT = '-# Data: Liquipedia (CC-BY-SA 3.0)';
// "MPL/Philippines/Season 18/Playoffs" reads as "MPL PH S18 Playoffs"; no need to load the whole esports service for it.
const league = title => title.replace('/Philippines', ' PH').replace('/Indonesia', ' ID').replace(/\/Season (\d+)/, ' S$1')
  .replace(/\//g, ' ');
const META_WORDS = /\b(meta|pro|mpl|pick|picks|ban|bans|draft|tier|op)\b/i;
const words = text => ` ${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

function proMetaCard(pages, { text = '' } = {}) {
  const leagues = []; const games = [];
  for (const [title, page] of Object.entries(pages || {})) {
    const decided = (page?.matches || []).flatMap(match => match.games || [])
      .filter(game => game.winner && game.picks?.[0]?.length === 5 && game.picks?.[1]?.length === 5);
    if (decided.length) { leagues.push(league(title)); games.push(...decided); }
  }
  if (!games.length) return '';
  const heroes = new Map();
  const entry = name => heroes.get(name) || heroes.set(name, { picks: 0, wins: 0, bans: 0 }).get(name);
  for (const game of games) {
    for (const team of [0, 1]) {
      for (const name of game.picks[team]) { const hero = entry(name); hero.picks += 1; if (game.winner === team + 1) hero.wins += 1; }
      for (const name of game.bans?.[team] || []) entry(name).bans += 1;
    }
  }
  const said = words(text);
  const named = [...heroes.keys()].filter(name => words(name).trim().length >= 3 && said.includes(words(name)));
  if (!META_WORDS.test(text) && !named.length) return '';
  const top = key => [...heroes].filter(([, hero]) => hero[key]).sort((a, b) => b[1][key] - a[1][key] || a[0].localeCompare(b[0]))
    .slice(0, 5).map(([name, hero]) => `${name} ${hero[key]}`).join(', ');
  return [`META PRO (data draft Liquipedia: ${leagues.join(', ')}; ${games.length} game dengan draft lengkap)`,
    `Paling sering dipick: ${top('picks')} (dari ${games.length} game).`,
    `Paling sering diban: ${top('bans') || 'belum ada'}.`,
    ...named.slice(0, 3).map(name => {
      const hero = heroes.get(name);
      return `${name}: dipick ${hero.picks} kali (W ${hero.wins} dari ${hero.picks}), diban ${hero.bans} kali.`;
    }),
    // The exam showed the model dropping these caveats when only the rules carried them.
    `Catatan: ini pola tim pro dari ${games.length} game, belum tentu cocok buat tim sendiri${games.length < 20 ? '; sampelnya kecil, jangan disimpulin' : ''}.`,
  ].join('\n');
}

module.exports = { LIQUIPEDIA_CREDIT, proMetaCard };
