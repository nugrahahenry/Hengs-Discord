'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ComponentType, MessageFlags } = require('discord.js');
const { createMemeCompletion, createMemeJudge, createVisionReview } = require('../src/news/completion');

const NOW = Date.parse('2026-10-21T06:00:00Z'); // 13:00 WIB
const HOUR = 3_600_000;
const DAYKEY = '2026-10-21';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('synthetic')]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

test('meme and vision completions send bounded JSON requests and map provider failures', async () => {
  const bodies = [];
  const client = { chat: { completions: { create: async body => { bodies.push(body);
    return { choices: [{ finish_reason: 'stop', message: { content: '{"safe":true}' } }] }; } } } };
  const write = createMemeCompletion({ client, model: 'openai/gpt-oss-120b', provider: 'groq' });
  assert.equal(await write([{ role: 'user', content: 'x' }], {}), '{"safe":true}');
  assert.equal(bodies[0].temperature, 0.9); assert.deepEqual(bodies[0].response_format, { type: 'json_object' });
  assert.equal(bodies[0].reasoning_effort, 'medium');
  const judge = createMemeJudge({ client, model: 'openai/gpt-oss-120b', provider: 'groq' });
  await judge([{ role: 'user', content: 'x' }], {});
  assert.equal(bodies[1].temperature, 0.2); assert.deepEqual(bodies[1].response_format, { type: 'json_object' });
  assert.equal(bodies[1].reasoning_effort, 'medium');
  const review = createVisionReview({ client, model: 'vision-model' });
  await review({ data: PNG, type: 'image/png' }, {});
  assert.equal(bodies[2].model, 'vision-model'); assert.equal(bodies[2].temperature, 0);
  assert.match(bodies[2].messages[1].content[1].image_url.url, /^data:image\/png;base64,/);
  assert.equal(createVisionReview({}), null); assert.equal(createMemeCompletion({}), null); assert.equal(createMemeJudge({}), null);
  const limited = createMemeCompletion({ client: { chat: { completions: { create: async () => {
    throw Object.assign(new Error('x'), { status: 429 }); } } } }, model: 'm' });
  await assert.rejects(limited([], {}), error => error.code === 'NEWS_EDITOR_RATE_LIMITED');
});

const { TEMPLATES, EVERGREEN, memegenUrl, validMeme, validOptions, judgedBest, pickTopic, parseLemmy, safeVerdict, imageKind,
  memeHash, createTemplateRanker, createMemeMaker } = require('../src/news/memes');
const drake = TEMPLATES.find(row => row.id === 'drake');
const option = (lines = ['nugas H-1 jam 23.59', 'nugas dari awal minggu?'], extra = {}) => ({ template: 'drake', lines, ...extra });
const score = (nyambung, lucu, bahasa) => ({ nyambung, lucu, bahasa });

test('memegen URLs follow the documented escaping', () => {
  assert.equal(memegenUrl('drake', ['nugas H-1 jam 23.59', 'nugas dari awal minggu?']),
    'https://api.memegen.link/images/drake/nugas_H--1_jam_23.59/nugas_dari_awal_minggu~q.png');
  assert.equal(memegenUrl('buzz', ['a_b / c#d', '50% & "kutip"']), "https://api.memegen.link/images/buzz/a__b_~s_c~hd/50~p_~a_''kutip''.png");
  assert.equal(memegenUrl('fine', ['kafé']), 'https://api.memegen.link/images/fine/kaf%C3%A9.png');
});

test('meme options must fit the template and stay clean', () => {
  assert.deepEqual(validMeme(option(), [drake]), { template: 'drake', lines: ['nugas H-1 jam 23.59', 'nugas dari awal minggu?'] });
  for (const bad of [
    option(undefined, { template: 'cmm' }), option(['a b', 'c d', 'e f']), option(['x'.repeat(61), 'oke']),
    option(['lihat https://x.id', 'oke']), option(['@everyone', 'oke']), option(['santai 😂', 'oke']),
    option(['kampanye pemilu', 'oke']), option(['dasar goblok', 'oke']), option(['a', 'oke']), option(['pakai ~q', 'oke']), null, 'drake',
  ]) assert.equal(validMeme(bad, [drake]), null, JSON.stringify(bad));
  assert.deepEqual(validOptions(JSON.stringify({ options: [option(), option(['a', 'b'])] }), [drake]).map(row => row.lines[0]),
    ['nugas H-1 jam 23.59']);
  assert.deepEqual(validOptions('not json', [drake]), []);
});

test('every template carries a clean example within its own line limit', () => {
  for (const template of TEMPLATES) {
    assert.ok(validMeme({ template: template.id, lines: template.example }, [template]), template.id);
  }
});

test('Hengs memes come from everyday situations, never news headlines, and do not repeat a topic', () => {
  const row = { seen: [], receipts: [] };
  assert.ok(EVERGREEN.length >= 30);
  const first = pickTopic(row, DAYKEY, 0);
  assert.match(first.key, /^evergreen:/); assert.equal(first.url, null); assert.ok(EVERGREEN.includes(first.title));
  assert.notEqual(pickTopic(row, DAYKEY, 2).key, first.key);
  assert.notEqual(pickTopic({ seen: [{ hash: memeHash(first.key), at: NOW }], receipts: [] }, DAYKEY, 0).key, first.key);
});

test('the judge must score every option, and only an option at 7 or more on all three counts is posted', () => {
  const options = [validMeme(option(), [drake]), validMeme(option(['Belajar dari jauh hari', 'Sistem kebut semalam']), [drake])];
  const verdict = scores => JSON.stringify({ scores });
  assert.equal(judgedBest(verdict([score(8, 7, 9), score(9, 9, 9)]), options), options[1]);
  assert.equal(judgedBest(verdict([score(9, 9, 9), score(9, 6, 9)]), options), options[0]);
  // The CPU or deadline meme: fluent, but the two buttons are no real dilemma.
  assert.equal(judgedBest(verdict([score(2, 6, 9), score(9, 9, 6)]), options), null);
  for (const raw of [verdict([score(9, 9, 9)]), verdict([score(9, 9, 9), score(9, 9, 11)]),
    verdict([score(9, 9, 9), { nyambung: '9', lucu: 9, bahasa: 9 }]), 'nope', '{}']) {
    assert.equal(judgedBest(raw, options), null, raw);
  }
});

test('Lemmy posts keep only fresh, safe, scored pictrs images ranked by the hot formula', () => {
  const post = (id, overrides = {}, counts = {}) => ({ post: { id, name: `Synthetic joke ${id}`, url: `https://lemmy.world/pictrs/image/1234abcd-${id}.png`,
    published: new Date(NOW - 2 * HOUR).toISOString(), nsfw: false, deleted: false, removed: false, featured_community: false,
    featured_local: false, ...overrides }, counts: { score: 500, comments: 10, ...counts } });
  const body = JSON.stringify({ posts: [
    post(1), post(2, { published: new Date(NOW - 30 * HOUR).toISOString() }, { score: 2000 }),
    post(3, { nsfw: true }), post(4, { featured_community: true }), post(5, { removed: true }), post(6, {}, { score: 50 }),
    post(7, { url: 'https://evil.example/pictrs/image/1234abcd-7.png' }), post(8, { url: 'https://lemmy.world/pictrs/image/1234abcd-8.png?x=1' }),
    post(9, { published: new Date(NOW - 80 * HOUR).toISOString() }), post(10, { name: 'Perang dagang chip' }),
  ] });
  const rows = parseLemmy(body, NOW);
  assert.deepEqual(rows.map(row => row.url), ['https://programming.dev/post/1', 'https://programming.dev/post/2']);
  assert.equal(rows[0].imageUrl, 'https://lemmy.world/pictrs/image/1234abcd-1.png');
  assert.equal(rows[0].hash, crypto.createHash('sha256').update('https://programming.dev/post/1').digest('hex'));
  assert.throws(() => parseLemmy('{}', NOW), /INVALID/);
});

test('vision verdicts must be exactly {"safe":true} and images are recognised by their bytes', () => {
  assert.equal(safeVerdict('{"safe":true}'), true);
  for (const raw of ['{"safe":false}', '{"safe":true,"reason":"ok"}', '{"safe":"true"}', 'safe', '', null]) assert.equal(safeVerdict(raw), false);
  assert.equal(imageKind(PNG), 'png'); assert.equal(imageKind(JPG), 'jpg');
  assert.equal(imageKind(Buffer.from('RIFF0000WEBPVP8 ')), 'webp'); assert.equal(imageKind(Buffer.from('<svg>')), null);
});
test('template ranking follows Imgflip popularity, falls back to the static order and caches a day', async () => {
  let now = NOW; let calls = 0; let fail = false;
  const rank = createTemplateRanker({ now: () => now, fetchJson: async () => { calls++; if (fail) throw new Error('down');
    return { data: { memes: [{ name: 'This Is Fine' }, { name: 'Drake Hotline Bling' }] } }; } });
  const first = await rank();
  assert.deepEqual(first.slice(0, 2).map(row => row.id), ['fine', 'drake']); assert.equal(first.length, TEMPLATES.length);
  await rank(); assert.equal(calls, 1);
  now += 25 * HOUR; fail = true;
  assert.deepEqual((await rank()).map(row => row.id), TEMPLATES.map(row => row.id));
});

function maker(overrides = {}) {
  const calls = { write: 0, judge: 0, review: 0, fetch: [] };
  const meme = createMemeMaker({
    now: () => NOW, logger: { warn() {} }, rankTemplates: async () => [...TEMPLATES],
    // Like the real writer, answer with a template from the offered list (it rotates per slot).
    completeMeme: async messages => {
      calls.write++;
      calls.written = JSON.parse(messages[1].content);
      const template = calls.written.templates[0].id;
      return JSON.stringify({ options: [option(undefined, { template }), option(['a b', 'c d'], { template })] });
    },
    judgeMeme: async messages => {
      calls.judge++;
      calls.judged = JSON.parse(messages[1].content);
      return JSON.stringify({ scores: [score(8, 8, 9), score(3, 2, 6)] });
    },
    reviewImage: async () => { calls.review++; return '{"safe":true}'; },
    fetchBytes: async url => {
      calls.fetch.push(url);
      if (url.startsWith('https://api.memegen.link/')) return PNG;
      if (url.startsWith('https://programming.dev/api/')) return Buffer.from(JSON.stringify({ posts: [{ post: { id: 7, name: 'Synthetic joke',
        url: 'https://lemmy.world/pictrs/image/1234abcd-7.jpg', published: new Date(NOW - HOUR).toISOString(), nsfw: false, deleted: false,
        removed: false, featured_community: false, featured_local: false }, counts: { score: 300, comments: 4 } }] }));
      return JPG;
    },
    ...overrides,
  });
  return { meme, calls };
}
const empty = { seen: [], receipts: [] };
const usedBy = (publisher, count) => ({ seen: [], receipts: Array.from({ length: count }, (_, slot) => ({ kind: 'meme', day: DAYKEY,
  publisher, status: 'sent', slot, hashes: [], at: NOW - HOUR })) });

test('even slots post the option the judge rates best, about an everyday situation, through memegen', async () => {
  const { meme, calls } = maker();
  const item = await meme.make({ row: empty, slot: 0 });
  assert.deepEqual([item.kind, item.publisher, item.topic], ['hengs', 'hengs-meme', 'memes']);
  assert.deepEqual(item.lines, ['nugas H-1 jam 23.59', 'nugas dari awal minggu?']);
  assert.equal(calls.fetch[0], 'https://api.memegen.link/images/drake/nugas_H--1_jam_23.59/nugas_dari_awal_minggu~q.png');
  assert.deepEqual(item.file, { name: 'hengs-meme.png', data: PNG });
  assert.ok(EVERGREEN.includes(item.topicTitle)); assert.equal(item.topicUrl, null);
  // The writer sees a worked example per template; the judge sees the situation and what each template means.
  assert.ok(calls.written.templates.every(row => Array.isArray(row.contoh) && row.contoh.length));
  assert.equal(calls.judged.situasi, item.topicTitle);
  assert.deepEqual(calls.judged.options.map(row => row.lines[0]), ['nugas H-1 jam 23.59', 'a b']);
  assert.ok(calls.judged.options.every(row => row.arti));
});

test('a Hengs meme the judge finds weak is not posted and the slot falls back to an outside meme', async () => {
  const weak = async () => JSON.stringify({ scores: [score(2, 6, 9), score(6, 6, 6)] });
  assert.equal((await maker({ judgeMeme: weak }).meme.make({ row: empty, slot: 0 })).kind, 'lemmy');
  const down = maker({ judgeMeme: async () => { throw new Error('synthetic judge down'); } });
  assert.equal((await down.meme.make({ row: empty, slot: 0 })).kind, 'lemmy');
  const unjudged = maker({ judgeMeme: null });
  assert.equal((await unjudged.meme.make({ row: empty, slot: 0 })).kind, 'lemmy'); assert.equal(unjudged.calls.write, 0);
});

test('odd slots prefer a new xkcd, then a vision-approved Lemmy post, then a Hengs meme', async () => {
  const comic = { title: 'Komik', topic: 'memes', source: 'xkcd (komik)', url: 'https://xkcd.com/1/', hash: 'c'.repeat(64), publishedAt: NOW - HOUR };
  assert.equal(await maker().meme.make({ row: empty, slot: 1, xkcdItems: [comic] }), comic);
  const lemmy = await maker().meme.make({ row: usedBy('xkcd', 1), slot: 1, xkcdItems: [comic] });
  assert.deepEqual([lemmy.kind, lemmy.url, lemmy.file.name], ['lemmy', 'https://programming.dev/post/7', 'lemmy-meme.jpg']);
  assert.equal((await maker({ reviewImage: async () => '{"safe":false}' }).meme.make({ row: empty, slot: 1 })).kind, 'hengs');
  const blind = maker({ reviewImage: null });
  assert.equal((await blind.meme.make({ row: empty, slot: 1 })).kind, 'hengs'); assert.equal(blind.calls.review, 0);
});

test('failures fall back to the other kind, respect daily caps and stop at the hourly write budget', async () => {
  assert.equal((await maker({ completeMeme: async () => { throw new Error('synthetic provider down'); } }).meme.make({ row: empty, slot: 0 })).kind, 'lemmy');
  assert.equal(await maker({ completeMeme: async () => '{"options":[]}', reviewImage: async () => '{"safe":false}' }).meme.make({ row: empty, slot: 0 }), null);
  const capped = maker();
  assert.equal((await capped.meme.make({ row: usedBy('hengs-meme', 5), slot: 0 })).kind, 'lemmy'); assert.equal(capped.calls.write, 0);
  const budget = maker();
  for (let i = 0; i < 10; i++) await budget.meme.preview({ row: empty });
  assert.equal(await budget.meme.preview({ row: empty }), null); assert.equal(budget.calls.write, 10);
});
const { memePayload } = require('../src/news/presentation');

test('meme cards attach the image, describe it and never mention anyone', () => {
  const item = { kind: 'hengs', publisher: 'hengs-meme', topic: 'memes', source: 'Hengs', lines: ['a b', 'c d'], template: 'drake',
    title: 'a b / c d', topicTitle: 'Galaxy S26 resmi meluncur', topicUrl: 'https://www.cnnindonesia.com/x', alt: 'Meme drake: a b / c d',
    file: { name: 'hengs-meme.png', data: PNG }, hash: 'd'.repeat(64), publishedAt: NOW };
  const payload = memePayload(item, NOW);
  assert.equal(payload.flags, MessageFlags.IsComponentsV2); assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.deepEqual(payload.files, [{ attachment: PNG, name: 'hengs-meme.png' }]);
  const card = payload.components.find(row => row.type === ComponentType.Container);
  assert.equal(card.components[0].items[0].media.url, 'attachment://hengs-meme.png');
  assert.equal(card.components[0].items[0].description, 'Meme drake: a b / c d');
  assert.match(card.components[1].content, /Meme buatan Hengs/);
  assert.match(card.components[1].content, /\[Galaxy S26 resmi meluncur\]\(https:\/\/www.cnnindonesia.com\/x\)/);
  assert.match(card.components[1].content, /memegen.link/);
  const lemmy = JSON.stringify(memePayload({ ...item, kind: 'lemmy', publisher: 'lemmy', title: 'Synthetic joke',
    url: 'https://programming.dev/post/7', score: 300, comments: 4, file: { name: 'lemmy-meme.jpg', data: JPG } }, NOW));
  assert.match(lemmy, /Lihat post aslinya\]\(https:\/\/programming.dev\/post\/7\)/); assert.match(lemmy, /Skor 300, 4 komentar/);
});