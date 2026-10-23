'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMatches, heroName, matchHash } = require('../src/esports/wikitext');

const PAGE = 'MPL/Philippines/Season 18/Playoffs';
const picks = (team, list) => list.map((hero, i) => `|t${team}h${i + 1}=${hero}`).join(' ');
const bans = (team, list) => list.map((hero, i) => `|t${team}b${i + 1}=${hero}`).join(' ');
const map = ({ winner, side = 'blue', length = '16:48', vod = '', comment = '', p1 = [], p2 = [], b1 = [], b2 = [] }) => `{{Map|vod=${vod}
        |team1side=${side} |team2side=${side === 'blue' ? 'red' : 'blue'} |length=${length} |winner=${winner} |comment=${comment}
        <!-- Hero picks -->
        ${picks(1, p1)}
        ${picks(2, p2)}
        <!-- Hero bans -->
        ${bans(1, b1)}
        ${bans(2, b2)}
    }}`;
const FIVE = ['kalea', 'nolan', 'lapu', 'cici', 'x.borg'];
const OTHER = ['freya', 'aulus', 'kimmy', 'obsidia', 'popol and kupa'];
const WIKI = `{{DISPLAYTITLE:Synthetic Playoffs}}
{{Bracket|Bracket/4L2DSU2L1D|id=SYNTHPL
|R1M1header=Play-ins
<!-- Upper Bracket Quarterfinals -->
|R1M1={{Match
    |bestof=5|caster1=Someone|mvp=Synthetic Ace
    |opponent1={{TeamOpponent|onic philippines}}
    |opponent2={{TeamOpponent|tnc pro team}}
    |date=October 21,2026 - 15:00 {{Abbr/SGT}}
    |map1=${map({ winner: 2, vod: 'https://www.youtube.com/watch?v=abc', comment: "[[ONIC Philippines|'''ONPH''']] picked <b>[[Revealing Wisps]]</b>", p1: FIVE, p2: OTHER, b1: OTHER, b2: FIVE })}
    |map2=${map({ winner: 1, side: 'red', length: '16:05', comment: "[[TNC Pro Team|'''TNC''']] picked <b>[[Golden Turret]]</b>", p1: FIVE, p2: OTHER })}
    |map3=${map({ winner: 1, length: '14:08', p1: FIVE, p2: OTHER })}
    |map4=${map({ winner: 2, side: 'red', length: '17:00' })}
    |map5=${map({ winner: 1, length: '20:52' })}
}}
<!-- Upper Bracket Semifinals -->
|R2M1={{Match
    |bestof=5|mvp=
    |opponent1={{TeamOpponent|team falcons ph}}
    |opponent2={{TeamOpponent|onic philippines}}
    |date=October 22,2026 - 15:00 {{Abbr/SGT}}
    |map1=${map({ winner: 1, comment: "[[Team Falcons PH|'''FLCP''']] picked <b>[[Healing Turtle]]</b>" })}
    |map2=${map({ winner: 1 })}
    |map3=${map({ winner: 1 })}
    |map4={{Map|finished=skip}}
    |map5={{Map|finished=skip}}
}}
<!-- Lower Bracket Semifinal -->
|R2M3={{Match
    |bestof=5|mvp=
    |opponent1={{TeamOpponent|onic philippines}}
    |opponent2={{TeamOpponent|team liquid ph}}
    |date=November 4, 2026 - 13:00 {{Abbr/ICT}}
    |map1=${map({ winner: 1 })}
    |map2={{Map|vod=
        |team1side= |team2side= |length= |winner= |comment=
    }}
}}
<!-- Grand Final -->
|R4M1={{Match
    |bestof=7|mvp=
    |opponent1={{TeamOpponent|team falcons ph}}
    |opponent2={{TeamOpponent|}}
    |date=October 25,2026 - 17:00 {{Abbr/XYZ}}
    |map1={{Map|vod=
        |team1side= |team2side= |length= |winner= |comment=
    }}
}}
}}`;

test('series results, drafts, sides and objectives come from Match and Map templates', () => {
  const [play, upper, lower, final] = parseMatches(WIKI, { page: PAGE });
  assert.equal(play.id, `${PAGE}#R1M1#0`);
  assert.equal(play.stage, 'Play-ins'); // the round header wins over the editor comment
  assert.equal(upper.stage, 'Upper Bracket Semifinals');
  assert.equal(lower.stage, 'Lower Bracket Semifinal'); assert.equal(final.stage, 'Grand Final');
  assert.equal(play.bestof, 5); assert.equal(play.mvp, 'Synthetic Ace');
  assert.deepEqual(play.teams, [{ key: 'onic philippines', name: 'ONIC Philippines', ticker: 'ONPH' },
    { key: 'tnc pro team', name: 'TNC Pro Team', ticker: 'TNC' }]);
  assert.equal(play.startAt, Date.UTC(2026, 9, 21, 7, 0));
  assert.deepEqual(play.score, [3, 2]); assert.equal(play.finished, true); assert.equal(play.winner, 1); assert.equal(play.valid, true);
  const [first, second] = play.games;
  assert.deepEqual({ ...first, picks: undefined, bans: undefined }, { number: 1, winner: 2, sides: ['blue', 'red'], length: '16:48',
    vod: 'https://www.youtube.com/watch?v=abc', objective: { team: 1, name: 'Revealing Wisps' }, picks: undefined, bans: undefined });
  assert.deepEqual(first.picks, [['Kalea', 'Nolan', 'Lapu-Lapu', 'Cici', 'X.Borg'], ['Freya', 'Aulus', 'Kimmy', 'Obsidia', 'Popol and Kupa']]);
  assert.deepEqual(first.bans[1], ['Kalea', 'Nolan', 'Lapu-Lapu', 'Cici', 'X.Borg']);
  assert.deepEqual(second.sides, ['red', 'blue']); assert.deepEqual(second.objective, { team: 2, name: 'Golden Turret' });
  assert.deepEqual(play.games[3].picks, [[], []]);
  assert.equal(play.games.length, 5);
});

test('skipped maps end a sweep; unfinished and unknown-zone series never count as finished', () => {
  const [, upper, lower, final] = parseMatches(WIKI, { page: PAGE });
  assert.deepEqual(upper.score, [3, 0]); assert.equal(upper.finished, true); assert.equal(upper.games.length, 3);
  // Names and tickers are learned across the page; a team with no comment anywhere gets a tidied key.
  assert.deepEqual(upper.teams[1], { key: 'onic philippines', name: 'ONIC Philippines', ticker: 'ONPH' });
  assert.deepEqual(lower.score, [1, 0]); assert.equal(lower.finished, false); assert.equal(lower.startAt, Date.UTC(2026, 10, 4, 6, 0));
  assert.deepEqual(lower.teams[1], { key: 'team liquid ph', name: 'Team Liquid PH', ticker: '' });
  assert.equal(final.startAt, null); assert.equal(final.teams[1].key, ''); assert.equal(final.finished, false);
});

test('a series right after another keeps the round label, not a comment from inside the previous games', () => {
  const next = `|R2M2={{Match|bestof=5 |opponent1={{TeamOpponent|a}} |opponent2={{TeamOpponent|b}} |map1=${map({ winner: 1, p1: FIVE })}}}\n`;
  const matches = parseMatches(WIKI.replace('<!-- Lower Bracket Semifinal -->', next + '<!-- Lower Bracket Semifinal -->'), { page: PAGE });
  assert.equal(matches[2].key, 'R2M2'); assert.equal(matches[2].stage, 'Upper Bracket Semifinals');
  assert.equal(matches[3].stage, 'Lower Bracket Semifinal');
});

test('the newer mapmode field gives the objective without a team; the old comment form still names the team', () => {
  const withMode = WIKI.replace("comment=[[TNC Pro Team|'''TNC''']] picked <b>[[Golden Turret]]</b>", 'comment= |mapmode=Golden Turret');
  const [play] = parseMatches(withMode, { page: PAGE });
  assert.deepEqual(play.games[1].objective, { team: 0, name: 'Golden Turret' });
  assert.deepEqual(play.games[0].objective, { team: 1, name: 'Revealing Wisps' });
  assert.equal(play.games[2].objective, null);
});

test('inconsistent results are invalid instead of guessed', () => {
  const gap = WIKI.replace('|map1=' + map({ winner: 1, comment: "[[Team Falcons PH|'''FLCP''']] picked <b>[[Healing Turtle]]</b>" }), '|map1={{Map|winner=}}');
  const upper = parseMatches(gap, { page: PAGE })[1];
  assert.equal(upper.valid, false); assert.equal(upper.finished, false);
  const extra = WIKI.replace('|map4={{Map|finished=skip}}', `|map4=${map({ winner: 2 })}`);
  assert.equal(parseMatches(extra, { page: PAGE })[1].valid, false);
  const nobest = WIKI.replace('|bestof=7|mvp=', '|bestof=|mvp=');
  assert.equal(parseMatches(nobest, { page: PAGE })[3].valid, false);
  assert.deepEqual(parseMatches('no templates here', { page: PAGE }), []);
});

test('hero keys read as display names and data changes change the hash', () => {
  assert.equal(heroName('yu zhong'), 'Yu Zhong'); assert.equal(heroName("chang'e"), "Chang'e");
  assert.equal(heroName('yi sun-shin'), 'Yi Sun-shin'); assert.equal(heroName('  '), '');
  const [play] = parseMatches(WIKI, { page: PAGE });
  const again = parseMatches(WIKI.replace('mvp=Synthetic Ace', 'mvp=Someone Else'), { page: PAGE })[0];
  assert.notEqual(matchHash(play), matchHash(again));
  assert.equal(matchHash(play), matchHash(parseMatches(WIKI, { page: PAGE })[0]));
});
