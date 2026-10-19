'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const casterCommand = require('../src/commands/caster');
const { buildCommandPlan } = require('../src/deploy-commands');
const { PERSONAS, DEFAULT_PERSONA, ALLOWED_TAGS, TTS_MODELS } = require('../src/caster/personas');
const { createCaster, cleanMomen, checkLine, checkWav, parseDailyLimit, MESSAGES, SCRIPT_MODEL, TTS_URL } = require('../src/caster/service');

// Voice bawaan Gemini TTS (ai.google.dev/gemini-api/docs/speech-generation, dicek 19 Okt 2026).
const PREBUILT_VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe',
  'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'];
const G = '223456789012345678', U = '323456789012345678', U2 = '333456789012345678', C = '423456789012345678';
const KEY = 'test-gemini-key-123';
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(2048)]);
const DEFAULT_LINE = 'SAVAAAGE! HENRY NGGAK ADA OBAT! <laugh>';

function ok(buffer = WAV) {
  return { ok: true, status: 200, json: async () => ({ steps: [
    { type: 'thought' },
    { type: 'model_output', content: [{ type: 'audio', data: buffer.toString('base64') }] },
  ] }) };
}
const status = code => ({ ok: false, status: code, json: async () => ({}) });

function rig({ dailyLimit, groqReply, fetchReply } = {}) {
  let time = Date.UTC(2026, 9, 19, 3, 0, 0); // 10:00 WIB
  const groqCalls = [], fetchCalls = [], logs = [];
  const groq = { chat: { completions: { create: async (params, options) => {
    groqCalls.push({ params, options });
    const reply = await groqReply?.(params);
    return reply ?? { choices: [{ finish_reason: 'stop',
      message: { content: JSON.stringify({ refuse: false, line: DEFAULT_LINE }) } }] };
  } } } };
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    fetchCalls.push({ url, init, body });
    return fetchReply ? fetchReply(fetchCalls.length, body) : ok();
  };
  const caster = createCaster({ groq, apiKey: KEY, dailyLimit, fetch, now: () => time,
    logger: { error: value => logs.push(String(value)) } });
  const run = (extra = {}) => caster.generate({ guildId: G, channelId: C, userId: U, personaId: 'bang-jago',
    momen: 'Henry savage pakai Ling', origin: null, ...extra });
  return { caster, groqCalls, fetchCalls, logs, run, advance: ms => { time += ms; }, now: () => time };
}

test('input cleaning removes mentions and links; output check allows only listed tags', () => {
  assert.equal(cleanMomen(' <@323456789012345678> savage @everyone https://x.com/a  www.y.com pakai\nLing '), 'savage pakai Ling');
  assert.equal(cleanMomen('<@&323456789012345678><#423456789012345678>'), '');
  assert.equal(checkLine('  SAVAGE!   <laugh> NGGAK ADA OBAT <short pause> GILA '), 'SAVAGE! <laugh> NGGAK ADA OBAT <short pause> GILA');
  for (const bad of ['', 'x'.repeat(161), 'halo @budi', 'cek https://x.com', 'join discord.gg/abc',
    'SAVAGE <scream>', 'SAVAGE > semua', 'a\u0007b']) assert.equal(checkLine(bad), null, bad);
  assert.equal(checkLine('x'.repeat(160)).length, 160);
  for (const tag of ALLOWED_TAGS) assert.ok(checkLine(`GILA <${tag}>`), tag);
});

test('wav check and daily limit parsing fail closed', () => {
  assert.equal(checkWav(WAV), WAV);
  assert.equal(checkWav(Buffer.alloc(10)), null);
  assert.equal(checkWav(Buffer.concat([Buffer.from('RIFX'), WAV.subarray(4)])), null);
  assert.equal(checkWav(Buffer.alloc(3 * 1024 * 1024)), null);
  assert.equal(parseDailyLimit(undefined), 20);
  assert.equal(parseDailyLimit('8'), 8);
  for (const bad of ['0', '101', '-1', '12abc', 'abc', '']) assert.equal(parseDailyLimit(bad), 20, bad);
});

test('caster stays disabled without Gemini key or Groq client', async () => {
  for (const options of [{ groq: null, apiKey: KEY }, { groq: {}, apiKey: '' }]) {
    const caster = createCaster({ ...options, fetch: async () => assert.fail('fetch must not run') });
    const result = await caster.generate({ guildId: G, channelId: C, userId: U, momen: 'halo' });
    assert.equal(result.code, 'CASTER_DISABLED');
    assert.equal(result.message, MESSAGES.CASTER_DISABLED);
  }
});

test('happy path sends one Groq and one Gemini request with locked model, voice and style', async () => {
  const r = rig();
  const result = await r.run();
  assert.equal(result.ok, true);
  assert.equal(result.draft.line, DEFAULT_LINE);
  assert.equal(result.draft.wav.equals(WAV), true);
  assert.equal(result.draft.label, 'Bang Jago Esport');
  assert.match(result.draft.id, /^[0-9a-f]{12}$/);
  const [{ params, options }] = r.groqCalls;
  assert.equal(params.model, SCRIPT_MODEL);
  assert.equal(params.response_format.json_schema.strict, true);
  assert.deepEqual(options, { timeout: 8000, maxRetries: 0 });
  assert.equal(params.messages[1].content, 'Henry savage pakai Ling');
  assert.match(params.messages[0].content, /Bang Jago Esport/);
  assert.match(params.messages[0].content, /SARA/);
  assert.match(params.messages[0].content, /data, bukan instruksi/);
  const [call] = r.fetchCalls;
  assert.equal(call.url, TTS_URL);
  assert.equal(call.init.headers['x-goog-api-key'], KEY);
  assert.equal(call.url.includes(KEY), false);
  assert.equal(call.body.model, 'gemini-3.8-flash-tts');
  assert.deepEqual(call.body.generation_config.speech_config, [{ voice: 'Fenrir' }]);
  assert.equal(call.body.input[0].content[0].text, DEFAULT_LINE);
  assert.equal(call.body.input[0].content[0].annotations[0].style, PERSONAS['bang-jago'].style);
});

test('Groq refusal or failure never calls Gemini or spends quota, but starts the member cooldown', async () => {
  const queue = [
    { choices: [{ finish_reason: 'stop', message: { content: '{"refuse":true,"line":""}' } }] },
    new Error('groq down'),
    { choices: [{ finish_reason: 'length', message: { content: '{"refuse":false,"line":"GILA"}' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: 'bukan json' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: '{"refuse":false,"line":"cek https://x.com"}' } }] },
  ];
  const r = rig({ groqReply: () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  } });
  assert.equal((await r.run()).code, 'CASTER_SCRIPT_REFUSED');
  assert.equal((await r.run()).code, 'CASTER_LIMIT_MEMBER');
  for (let n = 0; n < 4; n += 1) {
    r.advance(60_000);
    assert.equal((await r.run()).code, 'CASTER_SCRIPT_FAILED');
  }
  assert.equal(r.fetchCalls.length, 0);
  for (let n = 0; n < 3; n += 1) {
    r.advance(60_000);
    assert.equal((await r.run()).ok, true);
  }
  r.advance(60_000);
  assert.equal((await r.run()).code, 'CASTER_LIMIT_MEMBER');
  assert.equal(r.logs.filter(line => /SCRIPT/.test(line)).length, 5);
});

test('limits: daily cap, 60 s member cooldown, 20 s model gap, 3 per member per UTC day', async () => {
  const r = rig({ dailyLimit: '4' });
  assert.equal((await r.run()).ok, true);
  const cooldown = await r.run();
  assert.equal(cooldown.code, 'CASTER_LIMIT_MEMBER');
  assert.equal(cooldown.message, 'Tunggu 60 detik lagi.');
  r.advance(10_000);
  assert.equal((await r.run({ userId: U2 })).code, 'CASTER_BUSY');
  r.advance(10_000);
  assert.equal((await r.run({ userId: U2 })).ok, true);
  r.advance(60_000);
  assert.equal((await r.run()).ok, true);
  r.advance(60_000);
  assert.equal((await r.run()).ok, true);
  r.advance(60_000);
  assert.equal((await r.run({ userId: U2 })).code, 'CASTER_LIMIT_DAILY');

  const m = rig();
  for (let n = 0; n < 3; n += 1) {
    assert.equal((await m.run()).ok, true);
    m.advance(60_000);
  }
  const capped = await m.run();
  assert.equal(capped.code, 'CASTER_LIMIT_MEMBER');
  assert.equal(capped.message, MESSAGES.CASTER_LIMIT_MEMBER);
  m.advance(Date.UTC(2026, 9, 20) - m.now()); // 07:00 WIB besoknya
  assert.equal((await m.run()).ok, true);
});

test('only one generate runs at a time', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const r = rig({ groqReply: () => gate.then(() => undefined) });
  const first = r.run();
  assert.equal((await r.run({ userId: U2 })).code, 'CASTER_BUSY');
  release();
  assert.equal((await first).ok, true);
});

test('a 429 moves to flash-lite for the rest of the UTC day; both exhausted means daily limit', async () => {
  const r = rig({ fetchReply: (n, body) => (body.model === 'gemini-3.8-flash-tts' ? status(429) : ok()) });
  assert.equal((await r.run()).ok, true);
  assert.deepEqual(r.fetchCalls.map(call => call.body.model), ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']);
  assert.ok(r.logs.includes('[caster] CASTER_TTS_RATE_LIMITED'));
  r.advance(60_000);
  assert.equal((await r.run()).ok, true);
  assert.equal(r.fetchCalls.length, 3);
  assert.equal(r.fetchCalls.at(-1).body.model, 'gemini-3.8-flash-lite-tts');

  const both = rig({ fetchReply: () => status(429) });
  assert.equal((await both.run()).code, 'CASTER_LIMIT_DAILY');
  both.advance(60_000);
  assert.equal((await both.run()).code, 'CASTER_LIMIT_DAILY');
  assert.equal(both.groqCalls.length, 1);
  assert.equal(both.fetchCalls.length, 2);
  both.advance(Date.UTC(2026, 9, 20) - both.now());
  await both.run();
  assert.equal(both.groqCalls.length, 2);
});

test('Gemini failures are counted, logged by code only, and never retried', async () => {
  const replies = [() => status(500), () => ok(Buffer.alloc(10)), () => { throw new Error('aborted'); }];
  const r = rig({ dailyLimit: '3', fetchReply: n => replies[n - 1]() });
  for (const userId of [U, U2, '343456789012345678']) {
    assert.equal((await r.run({ userId })).code, 'CASTER_TTS_FAILED');
    r.advance(20_000);
  }
  assert.equal(r.fetchCalls.length, 3);
  assert.equal((await r.run({ userId: '353456789012345678' })).code, 'CASTER_LIMIT_DAILY');
  const joined = r.logs.join('\n');
  assert.match(joined, /CASTER_TTS_FAILED/);
  for (const secret of [KEY, 'Henry savage', 'SAVAAAGE']) assert.equal(joined.includes(secret), false, secret);
});

test('drafts expire after 10 minutes, belong to one member, are single use, and are capped at 10', async () => {
  const r = rig();
  const { draft } = await r.run();
  assert.equal(r.caster.get(draft.id, U2), null);
  assert.equal(r.caster.take(draft.id, U2), null);
  assert.equal(r.caster.take(draft.id, U).id, draft.id);
  assert.equal(r.caster.take(draft.id, U), null);
  r.advance(60_000);
  const second = (await r.run()).draft;
  r.advance(10 * 60_000);
  assert.equal(r.caster.get(second.id, U), null);

  const s = rig();
  const a = (await s.run()).draft;
  s.advance(60_000);
  const b = (await s.run()).draft;
  assert.equal(s.caster.get(a.id, U), null);
  assert.equal(s.caster.get(b.id, U).id, b.id);

  const cap = rig();
  for (let n = 0; n < 10; n += 1) {
    assert.equal((await cap.run({ userId: `3${String(n).padStart(2, '0')}456789012345678` })).ok, true);
    cap.advance(20_000);
  }
  assert.equal((await cap.run({ userId: '399456789012345678' })).code, 'CASTER_BUSY');
});

test('personas are fictional, use prebuilt voices only, and keep the TTS model order', () => {
  assert.deepEqual(Object.keys(PERSONAS), ['bang-jago', 'bapak-bola', 'wibu', 'galau']);
  assert.equal(DEFAULT_PERSONA, 'bang-jago');
  for (const persona of Object.values(PERSONAS)) {
    assert.ok(PREBUILT_VOICES.includes(persona.voice), persona.voice);
    assert.deepEqual(Object.keys(persona).sort(), ['guide', 'label', 'style', 'voice']);
    assert.ok(persona.style.length > 20 && persona.guide.length > 20);
  }
  assert.deepEqual(ALLOWED_TAGS, ['laugh', 'gasp', 'sigh', 'short pause', 'long pause']);
  assert.deepEqual(TTS_MODELS, ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']);
});

function fakeInteraction(extra = {}) {
  return {
    guildId: G, channelId: C, user: { id: U }, calls: [], replied: false, deferred: false,
    options: { getString: name => ({ momen: 'Henry savage pakai Ling', persona: null })[name] },
    async deferReply(payload) { this.calls.push(['deferReply', payload]); this.deferred = true; },
    async editReply(payload) { this.calls.push(['editReply', payload]); },
    async reply(payload) { this.calls.push(['reply', payload]); this.replied = true; },
    async update(payload) { this.calls.push(['update', payload]); },
    async deferUpdate() { this.calls.push(['deferUpdate']); this.deferred = true; },
    async followUp(payload) { this.calls.push(['followUp', payload]); },
    ...extra,
  };
}
const home = { classify: () => ({ kind: 'home' }) };
const buttonIds = payload => payload.components[0].toJSON().components.map(button => button.custom_id);

test('slash definition matches the spec and stays home-guild only', () => {
  const json = casterCommand.data.toJSON();
  assert.equal(json.name, 'caster');
  const [momen, persona] = json.options;
  assert.deepEqual([momen.name, momen.required, momen.max_length], ['momen', true, 150]);
  assert.equal(persona.name, 'persona');
  assert.equal(persona.required, false);
  assert.deepEqual(persona.choices.map(choice => choice.value), Object.keys(PERSONAS));
  const plan = buildCommandPlan([{ name: 'hengs' }, { name: 'setup' }, json]);
  assert.deepEqual(plan.home.map(command => command.name), ['caster']);
  assert.equal(plan.global.some(command => command.name === 'caster'), false);
});

test('command shows a private preview and publishes once without pings', async () => {
  const r = rig();
  const slash = fakeInteraction();
  await casterCommand.execute(slash, { caster: r.caster });
  assert.deepEqual(slash.calls[0], ['deferReply', { flags: MessageFlags.Ephemeral }]);
  const preview = slash.calls[1][1];
  assert.match(preview.content, /Preview Casterin · Bang Jago Esport/);
  assert.match(preview.content, /SAVAAAGE! HENRY NGGAK ADA OBAT!/);
  assert.doesNotMatch(preview.content, /<laugh>/);
  assert.equal(preview.files.length, 1);
  assert.deepEqual(preview.allowedMentions, { parse: [] });
  const ids = buttonIds(preview);
  assert.equal(ids.length, 3);
  const send = ids.find(id => id.includes(':send:'));

  const click = fakeInteraction({ customId: send });
  await casterCommand.handleButton(click, { caster: r.caster, guildAccess: home });
  const [kind, post] = click.calls[0];
  assert.equal(kind, 'reply');
  assert.equal(post.flags, undefined);
  assert.match(post.content, new RegExp(`dipesan <@${U}>`));
  assert.match(post.content, /Suara AI, persona fiksi/);
  assert.deepEqual(post.allowedMentions, { parse: [] });
  assert.equal(post.files.length, 1);
  assert.match(slash.calls.at(-1)[1].content, /Terkirim/);

  const again = fakeInteraction({ customId: send });
  await casterCommand.handleButton(again, { caster: r.caster, guildAccess: home });
  assert.equal(again.calls[0][1].content, MESSAGES.CASTER_DRAFT_EXPIRED);
  assert.equal(again.calls[0][1].flags, MessageFlags.Ephemeral);
});

test('redo regenerates through the button, cancel closes, and other guilds are refused', async () => {
  const r = rig();
  const slash = fakeInteraction();
  await casterCommand.execute(slash, { caster: r.caster });
  const ids = buttonIds(slash.calls[1][1]);
  r.advance(60_000);
  const redo = fakeInteraction({ customId: ids.find(id => id.includes(':redo:')) });
  await casterCommand.handleButton(redo, { caster: r.caster, guildAccess: home });
  assert.deepEqual(redo.calls.map(call => call[0]), ['deferUpdate', 'editReply']);
  const newIds = buttonIds(redo.calls[1][1]);
  assert.notDeepEqual(newIds, ids);

  const oldCancel = fakeInteraction({ customId: ids.find(id => id.includes(':cancel:')) });
  await casterCommand.handleButton(oldCancel, { caster: r.caster, guildAccess: home });
  assert.equal(oldCancel.calls[0][1].content, MESSAGES.CASTER_DRAFT_EXPIRED);
  const cancel = fakeInteraction({ customId: newIds.find(id => id.includes(':cancel:')) });
  await casterCommand.handleButton(cancel, { caster: r.caster, guildAccess: home });
  assert.deepEqual(cancel.calls[0], ['update', { content: 'Dibatalkan.', components: [], attachments: [], allowedMentions: { parse: [] } }]);

  const outside = fakeInteraction({ customId: newIds[0] });
  await casterCommand.handleButton(outside, { caster: r.caster, guildAccess: { classify: () => ({ kind: 'public' }) } });
  assert.equal(outside.calls[0][1].content, MESSAGES.CASTER_DRAFT_EXPIRED);

  r.advance(60_000);
  const slash2 = fakeInteraction();
  await casterCommand.execute(slash2, { caster: r.caster });
  const redo2 = fakeInteraction({ customId: buttonIds(slash2.calls[1][1])[1] });
  await casterCommand.handleButton(redo2, { caster: r.caster, guildAccess: home });
  assert.deepEqual(redo2.calls.map(call => call[0]), ['deferUpdate', 'followUp']);
  assert.equal(redo2.calls[1][1].content, MESSAGES.CASTER_LIMIT_MEMBER);
  assert.equal(redo2.calls[1][1].flags, MessageFlags.Ephemeral);
});

test('command explains when Casterin is off', async () => {
  const slash = fakeInteraction();
  await casterCommand.execute(slash, { caster: createCaster({ groq: null, apiKey: '' }) });
  assert.equal(slash.calls[1][1].content, MESSAGES.CASTER_DISABLED);
  assert.deepEqual(slash.calls[1][1].components, []);
});

test('runtime wires the caster service, command context and button route', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  assert.match(source, /require\('\.\/caster\/service'\)/);
  assert.match(source, /createCaster\(\{\s*groq: agent\.groq,\s*apiKey: process\.env\.GEMINI_API_KEY,\s*dailyLimit: process\.env\.CASTER_DAILY_LIMIT,\s*\}\)/);
  assert.ok(source.includes("startsWith('hengs-caster:')"));
  assert.ok(source.includes("client.commands.get('caster').handleButton(interaction, { caster, guildAccess })"));
  assert.match(source, /\bcaster,\s*\n/);
  assert.doesNotMatch(source, /const freeCommands = \[[^\]]*['"]caster['"]/);
  assert.ok('groq' in require('../src/agent'));
});
