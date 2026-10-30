'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ComponentType, MessageFlags } = require('discord.js');
const { seriesPayload, guidePayload, pageUrl, REACTIONS, isWarning } = require('../src/esports/presentation');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MATCH = { page: 'MPL/Philippines/Season 18/Playoffs', stage: 'Upper Bracket Final', score: [3, 2], winner: 1, mvp: 'KyleTzy',
  startAt: Date.UTC(2026, 9, 23, 7, 0),
  teams: [{ name: 'Team Falcons PH', ticker: 'FLCP' }, { name: 'Aurora Gaming PH', ticker: 'RORA' }],
  games: [{ number: 1, winner: 2, vod: 'https://www.youtube.com/watch?v=a1' }, { number: 2, winner: 1, vod: '' },
    { number: 3, winner: 1, vod: 'https://bad.example/x)y' }] };
const texts = payload => payload.components.flatMap(c => c.type === ComponentType.Container ? c.components : [c])
  .filter(c => c.type === ComponentType.TextDisplay).map(c => c.content).join('\n');

test('a series post attaches the card, summarises it in text and credits Liquipedia with a link', () => {
  const payload = seriesPayload(MATCH, { league: 'MPL PH S18 Playoffs' }, PNG);
  assert.equal(payload.flags, MessageFlags.IsComponentsV2); assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.deepEqual(payload.files, [{ attachment: PNG, name: 'hengs-analis.png' }]);
  const card = payload.components.find(c => c.type === ComponentType.Container);
  assert.equal(card.components[0].items[0].media.url, 'attachment://hengs-analis.png');
  assert.equal(card.components[0].items[0].description, 'Kartu hasil: Team Falcons PH 3-2 Aurora Gaming PH, Upper Bracket Final');
  const body = texts(payload);
  assert.match(body, /\*\*Team Falcons PH menang 3-2 atas Aurora Gaming PH\*\*/);
  assert.match(body, /MPL PH S18 Playoffs · Upper Bracket Final · Jumat, 23 Okt 2026 · 14:00 WIB/);
  assert.match(body, /MVP: KyleTzy/);
  assert.match(body, /VOD: \[Game 1\]\(https:\/\/www\.youtube\.com\/watch\?v=a1\)/); assert.doesNotMatch(body, /bad\.example/);
  assert.match(body, /\[Liquipedia\]\(https:\/\/liquipedia\.net\/mobilelegends\/MPL\/Philippines\/Season_18\/Playoffs\) \(CC-BY-SA 3\.0\)/);
  assert.match(body, /🔥 keren · 🤔 bingung · ⚠️ data salah/);
  assert.doesNotMatch(body, /Diperbarui/);
  assert.match(texts(seriesPayload(MATCH, {}, PNG, { updatedAt: Date.UTC(2026, 9, 23, 14, 40) })), /Diperbarui 21:40 WIB dari Liquipedia/);
  assert.doesNotMatch(JSON.stringify(payload), /—/);
});

test('the guide explains coverage, timing, reading the card, reactions, no screenshots and accuracy', () => {
  const plain = guidePayload();
  assert.equal(plain.files, undefined);
  const body = texts(plain);
  for (const part of [/## 📊 Hengs Analis/, /MPL PH dan MPL ID/, /Kapan posting/, /Cara baca kartu/, /🔥 keren · 🤔 bingung bacanya · ⚠️ datanya salah/,
    /Kenapa nggak ada screenshot/, /bukan tebakan AI/, /Liquipedia \(CC-BY-SA 3\.0\)/]) assert.match(body, part);
  assert.doesNotMatch(body, /—/);
  const banner = guidePayload({ banner: PNG });
  assert.deepEqual(banner.files, [{ attachment: PNG, name: 'hengs-analis-panduan.png' }]);
  assert.equal(banner.components[0].components[0].items[0].media.url, 'attachment://hengs-analis-panduan.png');
});

test('reaction seeds and the warning check ignore the emoji variation selector', () => {
  assert.deepEqual(REACTIONS, ['🔥', '🤔', '⚠️']);
  assert.equal(isWarning('⚠️'), true); assert.equal(isWarning('⚠'), true); assert.equal(isWarning('🔥'), false);
  assert.equal(pageUrl('MPL/Indonesia/Season 18/Playoffs'), 'https://liquipedia.net/mobilelegends/MPL/Indonesia/Season_18/Playoffs');
});

test('a preview carries the card, the caption, the Liquipedia credit and two vote buttons keyed to the match', () => {
  const { previewPayload, listPayload, VOTE_PREFIX } = require('../src/esports/presentation');
  const match = { page: 'MPL/Indonesia/Season 18/Playoffs', teams: [{ name: 'ONIC', ticker: 'ONIC' }, { name: 'RRQ Hoshi', ticker: 'RRQ' }] };
  const payload = previewPayload(match, PNG, { key: 'abc123def456', caption: '**ONIC vs RRQ Hoshi** · 15:00 WIB · Bo5' });
  const json = JSON.stringify(payload.components);
  assert.equal(payload.files[0].name, 'hengs-preview.png');
  assert.match(json, /hengs-analis:vote:abc123def456:1/); assert.match(json, /hengs-analis:vote:abc123def456:2/);
  assert.match(json, /Tebak ONIC/); assert.match(json, /Tebak RRQ/); assert.match(json, /Liquipedia/);
  assert.match(json, /"custom_id":"hengs-analis:nobar"/); assert.match(json, /Ingetin aku/); // the 🔔 Nobar row (2026-10-30)
  assert.match(texts(guidePayload()), /\*\*Nobar\*\*[\s\S]*Ingetin aku[\s\S]*Mode siaran/);
  assert.equal(VOTE_PREFIX, 'hengs-analis:vote:');
  const list = listPayload(PNG, 'Rekap 4 Nov', '**Rekap Rabu, 4 Nov 2026**: ONIC menang 2-0.');
  assert.equal(list.files[0].name, 'hengs-rekap.png'); assert.deepEqual(list.allowedMentions, { parse: [] });
});

test('a series card can carry one draft image per game in the same gallery', () => {
  const drafts = [{ name: 'hengs-draft-1.png', png: PNG, description: 'Draft GAME 1' }, { name: 'hengs-draft-2.png', png: PNG, description: 'Draft GAME 2' }];
  const payload = seriesPayload(MATCH, { league: 'MPL PH S18 Playoffs' }, PNG, { drafts });
  assert.deepEqual(payload.files.map(f => f.name), ['hengs-analis.png', 'hengs-draft-1.png', 'hengs-draft-2.png']);
  assert.match(JSON.stringify(payload.components), /attachment:\/\/hengs-draft-2\.png/);
  assert.deepEqual(seriesPayload(MATCH, { league: 'MPL' }, PNG).files.map(f => f.name), ['hengs-analis.png']);
});
