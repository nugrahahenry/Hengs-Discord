'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection } = require('discord.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-appreciation-'));
process.env.OPS_DATA_DIR = dir;
const store = require('../src/ops/store');
const { buildAppreciationDraft, readAppreciationDraft, validateAppreciation } = require('../src/ops/appreciation');
const { appreciationFormRow, appreciationModal } = require('../src/ops/appreciation-form');
const { renderAppreciationCard } = require('../src/utils/appreciation-card');
const { draftPayload, approvalRow, handleButton, handleModal, processDueSchedules } = require('../src/ops/hub');
const { parseOperationPrompt } = require('../src/prompt-operations');
const { resolvePrompt } = require('../src/prompt-assistant');
const OWNER = '123456789012345678';
const HOME = '223456789012345678';
const OTHER = '323456789012345678';
const data = { recipient: 'Tim Orion', achievement: 'Juara 1 turnamen MLBB', date: '17 Oktober 2026', players: 'Raka (Sky)\nDara' };
const template = buildAppreciationDraft(data);
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

function withEnv(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => Object.entries(previous).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }));
}

function fixture() {
  const sent = [];
  const edits = [];
  const panel = { id: 'panel', edit: async payload => edits.push(payload), delete: async () => {} };
  const settings = { id: 'settings', name: 'bot-settings', isTextBased: () => true,
    send: async payload => { sent.push({ destination: 'private', payload }); return panel; }, messages: { fetch: async () => panel } };
  const announcements = { id: 'announcements', isTextBased: () => true,
    send: async payload => { sent.push({ destination: 'public', payload }); return { id: 'posted' }; } };
  const guild = { channels: { cache: new Collection([[settings.id, settings], [announcements.id, announcements]]), fetch: async () => null } };
  const interaction = { id: 'form-1', customId: `ops:appreciationform:${OWNER}`, user: { id: OWNER }, guildId: HOME, guild,
    isModalSubmit: () => true, isButton: () => true, fields: { getTextInputValue: key => data[key] || '' },
    reply: async payload => { interaction.replyPayload = payload; },
    deferReply: async payload => { interaction.deferPayload = payload; },
    editReply: async payload => { interaction.editPayload = payload; },
    showModal: async value => { interaction.modal = value; }, update: async value => edits.push(value),
    followUp: async () => {}, message: panel };
  return { sent, edits, interaction };
}

test('appreciation uses reversible ordinary text with optional nicknames and no new state keys', () => {
  assert.deepEqual(Object.keys(template), ['title', 'body']);
  assert.equal(readAppreciationDraft(template).players, 'Raka (Sky); Dara');
  assert.equal(readAppreciationDraft(template).occasion, undefined);
  assert.deepEqual(buildAppreciationDraft(readAppreciationDraft(template)), template);
  assert.equal(readAppreciationDraft({ ...template, body: `${template.body}\nchanged` }), null);
  assert.equal(readAppreciationDraft({ ...template, title: 'Other title' }), null);
  assert.equal(readAppreciationDraft({ ...template, kind: 'project' }), null);
});

test('appreciation rejects unsafe, unknown, oversized and malformed input before persistence', () => {
  for (const input of [null, [], { ...data, url: 'x' }, { ...data, recipient: '@everyone' },
    { ...data, recipient: '<@123>' }, { ...data, date: 'https://example.org' },
    { ...data, achievement: 'a'.repeat(221) }, { ...data, recipient: 'bad\nname' },
    { ...data, players: Array(9).fill('Raka').join('\n') }, { ...data, players: 'a'.repeat(61) },
    { ...data, players: 'Raka\u0000' }, { ...data, recipient: 'bad\u202ename' }, { ...data, recipient: '' }]) {
    assert.throws(() => validateAppreciation(input), /APPRECIATION_INVALID/);
  }
  assert.equal(validateAppreciation({ recipient: 'Raka', achievement: 'Bantu\u2014komunitas', date: ' ' }).achievement, 'Bantu-komunitas');
});

test('explicit appreciation prompts avoid future event routing and do not infer dates or rankings', () => {
  const route = parseOperationPrompt('Bikin kartu apresiasi buat Tim Orion karena juara 1 turnamen MLBB; tanggal 17 Oktober 2026; pemain Raka (Sky), Dara');
  assert.equal(route.kind, 'ops_draft');
  assert.deepEqual(readAppreciationDraft(route.preparedDraft), validateAppreciation({ ...data, achievement: 'juara 1 turnamen MLBB' }));
  assert.equal(parseOperationPrompt('Buat pengumuman: terima kasih atas apresiasi kalian').kind, 'ops_draft');
  assert.equal(parseOperationPrompt('bikin apresiasi').operation, 'appreciation');
  assert.equal(parseOperationPrompt('bikin apresiasi buat Tim Orion karena membantu komunitas').preparedDraft.body.includes('Tanggal:'), false);
  for (const question of ['apa itu apresiasi?', 'bisa bikin kartu apresiasi?', 'jangan bikin apresiasi', 'Tim Orion menang turnamen kemarin']) {
    assert.equal(parseOperationPrompt(question), null);
  }
  assert.equal(parseOperationPrompt('bikin apresiasi Tim Orion juara 1; tanggal kemarin; tanggal hari ini').kind, 'operation_questions');
});

test('appreciation prompt admission matches form owner/editor policy, not mere administrator', t => {
  withEnv(t, { OWNER_ID: OWNER, OPS_EDITOR_ROLE_IDS: OTHER });
  const base = { prompt: 'bikin apresiasi', scopeKind: 'home', guild: { ownerId: OTHER } };
  assert.equal(resolvePrompt({ ...base, actor: { author: { id: OWNER } } }).kind, 'operation_questions');
  assert.equal(resolvePrompt({ ...base, actor: { user: { id: OTHER } } }).kind, 'permission');
  assert.equal(resolvePrompt({ ...base, actor: { user: { id: OTHER }, member: { roles: [OTHER] } } }).kind, 'operation_questions');
  assert.equal(resolvePrompt({ ...base, scopeKind: 'public', actor: { user: { id: OWNER } } }).handled, false);
});

test('native form has five bounded fields, optional roster, actor-bound ID', () => {
  assert.equal(appreciationFormRow(OWNER)[0].toJSON().components[0].custom_id, `ops:appreciationnew:${OWNER}`);
  assert.deepEqual(appreciationFormRow('invalid'), []);
  const form = appreciationModal(OWNER).toJSON();
  assert.equal(form.components.length, 5);
  assert.equal(form.components[4].components[0].required, false);
  assert.equal(form.components[4].components[0].max_length, 480);
});

test('renderer outputs deterministic bounded PNG for generic, branded, long and optional roster cases', async () => {
  for (const input of [data, { recipient: 'Hengs Familia', achievement: 'Juara 1' },
    { recipient: 'N'.repeat(80), achievement: 'A'.repeat(220), occasion: 'M'.repeat(100), players: Array(8).fill('N'.repeat(58)).join('; ') }]) {
    const image = await renderAppreciationCard(input);
    assert.equal(image.subarray(1, 4).toString(), 'PNG');
    assert.equal(image.readUInt32BE(16), 1000);
    assert.ok(image.readUInt32BE(20) >= 500 && image.readUInt32BE(20) <= 744);
    assert.ok(image.length < 8 * 1024 * 1024);
    assert.deepEqual(await renderAppreciationCard(input), image);
  }
});

test('branded logo pixels are actually decoded, not merely reported as complete', async () => {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const image = await loadImage(await renderAppreciationCard({ recipient: 'Hengs Familia', achievement: 'Juara 1' }));
  const canvas = createCanvas(1000, 500);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(620, 100, 310, 310).data;
  let bluePixels = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 2] > 90 && pixels[i + 2] > pixels[i] * 1.7) bluePixels += 1;
  }
  assert.ok(bluePixels > 5000, 'the fixed blue crest must be visible');
});

test('Markdown-like user text remains literal in both card and embed', async () => {
  const draft = { ...buildAppreciationDraft({ recipient: '*Orion*', achievement: '~~Juara 1~~' }),
    id: 'abcdef1234567890', status: 'pending', createdAt: new Date().toISOString() };
  const payload = await draftPayload(draft, { publicView: true });
  assert.match(payload.embeds[0].data.description, /\\~\\~Juara 1\\~\\~/);
  assert.match(payload.embeds[0].data.title, /\\\*Orion\\\*/);
  assert.deepEqual(payload.files[0].attachment, await renderAppreciationCard(readAppreciationDraft(draft)));
});

test('private and public payloads share exact graphic, full text and recovery ID with mentions off', async () => {
  const draft = { ...template, id: 'abcdef1234567890', status: 'pending', createdAt: new Date().toISOString() };
  const privatePayload = await draftPayload(draft);
  const publicPayload = await draftPayload(draft, { publicView: true });
  assert.deepEqual(privatePayload.files[0].attachment, publicPayload.files[0].attachment);
  assert.equal(publicPayload.embeds[0].data.description, template.body);
  assert.match(publicPayload.embeds[0].data.footer.text, /Draft ID: abcdef1234567890/);
  assert.deepEqual(publicPayload.allowedMentions, { parse: [] });
  assert.equal(publicPayload.components, undefined);
  const buttons = approvalRow(draft)[0].toJSON().components;
  assert.equal(buttons[0].disabled, undefined);
  assert.equal(buttons[1].disabled, true);
  assert.equal(buttons[2].disabled, true);
});

test('render failure and manual template edits clear stale attachment without losing full text', async () => {
  const draft = { ...template, id: 'abcdef1234567890', status: 'pending', createdAt: new Date().toISOString() };
  const logs = [];
  const failed = await draftPayload(draft, { edit: true, renderCard: () => { throw new Error('private path'); }, logger: { warn: code => logs.push(code) } });
  assert.equal(failed.files, undefined);
  assert.equal(failed.embeds[0].data.image, undefined);
  assert.deepEqual(failed.attachments, []);
  assert.equal(failed.embeds[0].data.description, template.body);
  assert.deepEqual(logs, ['[ops] APPRECIATION_CARD_UNAVAILABLE']);
  const edited = await draftPayload({ ...draft, body: 'Manual free-form revision' }, { edit: true });
  assert.equal(edited.files, undefined);
  assert.deepEqual(edited.attachments, []);
});

test('form refuses wrong actor, wrong guild, missing owner, removed editor and forged suffix', async t => {
  withEnv(t, { OWNER_ID: OWNER, DISCORD_GUILD_ID: HOME, OPS_EDITOR_ROLE_IDS: '' });
  for (const override of [{ user: { id: OTHER } }, { guildId: OTHER },
    { customId: `ops:appreciationform:${OWNER}:extra` }]) {
    const { interaction, sent } = fixture();
    Object.assign(interaction, override);
    await handleModal(interaction);
    assert.equal(interaction.replyPayload.ephemeral, true);
    assert.equal(sent.length, 0);
  }
  process.env.OWNER_ID = '';
  const { interaction, sent } = fixture();
  await handleModal(interaction);
  assert.equal(sent.length, 0);
  assert.match(interaction.replyPayload.content, /akses editor/);
});

test('form button opens only actor-bound modal and invalid data never creates draft', async t => {
  withEnv(t, { OWNER_ID: OWNER, DISCORD_GUILD_ID: HOME });
  const { interaction, sent } = fixture();
  interaction.customId = `ops:appreciationnew:${OWNER}`;
  await handleButton(interaction);
  assert.equal(interaction.modal.toJSON().custom_id, `ops:appreciationform:${OWNER}`);
  interaction.customId = `ops:appreciationform:${OWNER}`;
  interaction.fields.getTextInputValue = () => '@everyone';
  await handleModal(interaction);
  assert.equal(sent.length, 0);
  assert.match(interaction.replyPayload.content, /tanpa mention/);
});

test('form submits a private pending announcement once, persists across reload and blocks forged AI rewrite', async t => {
  withEnv(t, { OWNER_ID: OWNER, DISCORD_GUILD_ID: HOME, BOT_SETTINGS_CHANNEL_ID: 'settings' });
  const { interaction, sent } = fixture();
  await handleModal(interaction);
  await handleModal(interaction);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].destination, 'private');
  assert.ok(sent[0].payload.files[0].attachment.length);
  const id = sent[0].payload.embeds[0].data.fields.find(field => field.name === 'ID').value.replaceAll('`', '');
  const draft = store.getDraft(id);
  assert.equal(draft.kind, 'announcement');
  assert.equal(draft.status, 'pending');
  assert.deepEqual(readAppreciationDraft(draft), validateAppreciation(data));
  delete require.cache[require.resolve('../src/ops/store')];
  assert.equal(require('../src/ops/store').getDraft(id).body, template.body);
  interaction.customId = `ops:regenerate:${id}`;
  await handleButton(interaction, { agent: { draftAnnouncement: () => assert.fail('must not call model') } });
  assert.match(interaction.replyPayload.content, /manual|Edit/i);
  assert.equal(store.getDraft(id).status, 'pending');
});

test('manual publication remains owner-only and duplicate clicks publish graphic exactly once', async t => {
  withEnv(t, { OWNER_ID: OWNER, ANNOUNCE_CHANNEL_ID: 'announcements', OPS_EDITOR_ROLE_IDS: OTHER });
  const { draft } = store.createDraft({ ...template });
  const { interaction, sent } = fixture();
  interaction.customId = `ops:publishnow:${draft.id}`;
  interaction.user.id = OTHER;
  interaction.member = { roles: [OTHER] };
  await handleButton(interaction);
  assert.equal(sent.length, 0);
  interaction.user.id = OWNER;
  await Promise.all([handleButton(interaction), handleButton(interaction)]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].destination, 'public');
  assert.ok(sent[0].payload.files[0].attachment.length);
  assert.equal(store.getDraft(draft.id).status, 'published');
});

test('scheduled publication retains graphic and exactly-once claims', async t => {
  withEnv(t, { OWNER_ID: OWNER, ANNOUNCE_CHANNEL_ID: 'announcements', DISCORD_GUILD_ID: HOME });
  const { draft } = store.createDraft({ ...template });
  const now = Date.now();
  store.scheduleDraft(draft.id, OWNER, new Date(now - 60000).toISOString(), now - 180000);
  const { interaction, sent } = fixture();
  const client = { guilds: { fetch: async () => interaction.guild } };
  await Promise.all([processDueSchedules(client), processDueSchedules(client)]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].payload.files[0].attachment, await renderAppreciationCard(data));
  assert.equal(store.getDraft(draft.id).status, 'published');
});
