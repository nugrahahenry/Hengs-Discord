'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chatPlacement, INTENTS, parseIntent, parseRoute, guideFor, createIntentClassifier, isChatChannelName, askScrimSlots } = require('../src/chat-mode');

const text = (name, extra = {}) => ({ id: String(800000000000000000n + BigInt(name.length)), type: 0, name, ...extra });
const thread = (parent) => ({ id: '810000000000000001', type: 11, name: 'diskusi', isThread: () => true, parent });

test('Hengs chats only in tanya-hengs, the old bot-commands name and bot-settings; hasil-scrim is the coach', () => {
  for (const name of ['🤖・tanya-hengs', 'tanya-hengs', '🤖・bot-commands', 'bot-settings']) assert.equal(chatPlacement(text(name)), 'chat', name);
  assert.equal(chatPlacement(text('📸・hasil-scrim')), 'coach');
  assert.equal(chatPlacement(thread(text('📸・hasil-scrim'))), 'coach'); // a thread follows its channel
  assert.equal(chatPlacement(thread(text('🤖・tanya-hengs'))), 'chat');
  for (const name of ['💬・ngobrol', 'general', 'tanya-hengs-lama', 'not-bot-commands-x']) assert.equal(chatPlacement(text(name)), 'wave', name);
  assert.equal(chatPlacement(text('🏆・hall-of-fame')), 'silent');
  assert.equal(chatPlacement(null), 'wave');
  assert.equal(isChatChannelName('🤖・tanya-hengs'), true); assert.equal(isChatChannelName('ngobrol'), false);
});

test('bot-commands is shared with other bots: Hengs chats there only until a tanya-hengs channel exists', () => {
  const botCommands = text('🤖・bot-commands');
  const before = { ...botCommands, guild: { channels: { cache: new Map([['b', botCommands]]) } } };
  assert.equal(chatPlacement(before), 'chat');
  const tanya = text('🤖・tanya-hengs', { id: '820000000000000001' });
  const after = { ...botCommands, guild: { channels: { cache: new Map([['b', botCommands], ['t', tanya]]) } } };
  assert.equal(chatPlacement(after), 'wave');
  assert.equal(chatPlacement({ ...tanya, guild: after.guild }), 'chat');
  assert.equal(chatPlacement(thread({ ...botCommands, guild: after.guild })), 'wave');
});

test('only known intents pass; anything odd is plain chat', () => {
  assert.deepEqual(INTENTS, ['chat', 'help', 'news', 'memes', 'analis', 'scrim', 'kirim', 'lapor', 'caster', 'event', 'scrim_catat', 'scrim_hapus']);
  assert.equal(parseIntent('{"intent":"news"}'), 'news');
  assert.equal(parseIntent('```json\n{"intent": "scrim"}\n```'), 'scrim');
  for (const raw of ['{"intent":"delete_server"}', 'not json', '', null, '{"intent":["news"]}']) assert.equal(parseIntent(raw), 'chat', String(raw));
});

test('guides point to the right channel and slash command, never post content, keep team data in hasil-scrim', () => {
  const channels = new Map([['1', text('📰・hengs-news', { id: '111111111111111111' })], ['2', text('😂・hengs-memes', { id: '222222222222222222' })],
    ['3', text('📸・hasil-scrim', { id: '333333333333333333' })]]);
  const guild = { channels: { cache: channels } };
  assert.match(guideFor('news', guild), /<#111111111111111111>/); assert.match(guideFor('news', guild), /\/kirim berita/);
  assert.match(guideFor('memes', guild), /<#222222222222222222>/); assert.match(guideFor('memes', guild), /\/kirim meme/);
  assert.match(guideFor('scrim', guild), /<#333333333333333333>/); assert.match(guideFor('scrim', guild), /\/scrim statku/);
  assert.match(guideFor('analis', guild), /belum dibuat/); // no analyst channel yet
  assert.match(guideFor('kirim', guild), /preview/); assert.match(guideFor('lapor', guild), /\/report/);
  assert.match(guideFor('caster', guild), /\/caster/); assert.match(guideFor('help', guild), /tanya-hengs/);
  assert.equal(guideFor('chat', guild), null);
  for (const intent of INTENTS) assert.doesNotMatch(String(guideFor(intent, guild)), /—/);
});

test('the classifier sends only the message text, at temperature 0, and falls back to chat on any failure', async () => {
  const calls = [];
  const classify = createIntentClassifier({ complete: async request => { calls.push(request); return '{"intent":"memes"}'; } });
  assert.deepEqual(await classify('ada meme baru ga'), { intent: 'memes', slots: {} });
  const [request] = calls;
  assert.equal(request.temperature, 0);
  assert.equal(request.messages.length, 2); assert.equal(request.messages[0].role, 'system');
  assert.equal(request.messages[1].content, 'ada meme baru ga');
  assert.match(request.messages[0].content, /"intent"/);
  assert.deepEqual(await createIntentClassifier({ complete: async () => { throw new Error('private-provider'); } })('halo'), { intent: 'chat', slots: {} });
  assert.deepEqual(await createIntentClassifier({ complete: null })('halo'), { intent: 'chat', slots: {} });
  assert.equal(await classify('x'.repeat(5000)).then(() => calls.at(-1).messages[1].content.length), 1500);
});

test('index.js ignores @everyone, @here and role pings, waves outside chat channels and keeps the gallery silent', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8').replace(/\r\n/g, '\n');
  assert(source.includes('msg.mentions.has(client.user, { ignoreEveryone: true, ignoreRoles: true })'));
  assert(source.includes("chatPlacement(msg.channel)"));
  assert(source.includes("msg.react('👋')"));
  // Phase 2: requester-only buttons route to the chat actions; scrim logging asks for missing slots.
  assert(source.includes("startsWith('hengs-chat:')") && source.includes('await chatActions.handleButton(interaction)'));
  assert(source.includes('chatActions.offer(msg, kirim)') && source.includes('askScrimSlots()'));
});

test('scrim logging by chat gets clean slots: a known opponent text, one of the six results, an optional note', () => {
  assert.deepEqual(parseRoute('{"intent":"scrim_catat","lawan":"  RRQ Kaito ","hasil":"kalah-draft","catatan":"telat rotasi"}'),
    { intent: 'scrim_catat', slots: { lawan: 'RRQ Kaito', hasil: 'kalah-draft', catatan: 'telat rotasi' } });
  assert.deepEqual(parseRoute('{"intent":"scrim_catat","lawan":"EVOS","hasil":"draw"}'), { intent: 'scrim_catat', slots: { lawan: 'EVOS' } });
  assert.deepEqual(parseRoute(`{"intent":"scrim_catat","lawan":"${'x'.repeat(80)}","hasil":"menang"}`).slots.lawan.length, 60);
  assert.deepEqual(parseRoute('{"intent":"scrim_hapus","lawan":"ignored"}'), { intent: 'scrim_hapus', slots: {} });
  assert.deepEqual(parseRoute('{"intent":"memes","lawan":"x"}'), { intent: 'memes', slots: {} });
  assert.equal(parseIntent('{"intent":"scrim_hapus"}'), 'scrim_hapus');
  assert.match(askScrimSlots(), /early, objective, teamfight, draft atau lainnya/);
});

test('in tanya-hengs, scrim logging points to hasil-scrim instead of collecting team data publicly', () => {
  const guild = { channels: { cache: new Map([['3', { id: '333333333333333333', type: 0, name: '📸・hasil-scrim' }]]) } };
  for (const intent of ['scrim_catat', 'scrim_hapus']) {
    assert.match(guideFor(intent, guild), /<#333333333333333333>/); assert.match(guideFor(intent, guild), /\/scrim (hasil|hapus)/);
  }
});

test('the pinned Tanya Hengs guide shows examples, the button rule, privacy and the daily cap; posting pins it', async () => {
  const { chatGuide, postChatGuide } = require('../src/chat-mode');
  const guild = { channels: { cache: new Map([['n', text('📰・hengs-news', { id: '111111111111111111' })], ['s', text('📸・hasil-scrim', { id: '333333333333333333' })]]) } };
  const guide = chatGuide(guild);
  for (const part of [/Tanya Hengs/, /kirim meme ini/, /<#111111111111111111>/, /<#333333333333333333>/, /cuma bisa dipencet yang minta/,
    /40 pesan/, /data pribadi/, /bisa salah/]) assert.match(guide.content, part);
  assert.deepEqual(guide.allowedMentions, { parse: [] }); assert.ok(guide.content.length <= 2000);
  assert.doesNotMatch(guide.content, /\u2014/);
  const pins = []; const channel = { guild, async send(p) { return { async pin() { pins.push(p); } }; } };
  assert.deepEqual(await postChatGuide(channel), { posted: true, pinned: true }); assert.equal(pins.length, 1);
  const noPin = { guild, async send() { return { async pin() { throw new Error('Missing Permissions'); } }; } };
  assert.deepEqual(await postChatGuide(noPin), { posted: true, pinned: false });
});
