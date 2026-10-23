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
