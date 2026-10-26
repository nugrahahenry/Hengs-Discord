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
const { buildAppreciationDraft, readAppreciationDraft, validateAppreciation, formatAppreciation } = require('../src/ops/appreciation');
const { appreciationFormRow, appreciationModal, appreciationRevision } = require('../src/ops/appreciation-form');
const { renderAppreciationCard, cardContent, layoutCard } = require('../src/utils/appreciation-card');
const { draftPayload, approvalRow, handleButton, handleModal, processDueSchedules } = require('../src/ops/hub');
const { parseOperationPrompt } = require('../src/prompt-operations');
const { resolvePrompt } = require('../src/prompt-assistant');
const OWNER = '123456789012345678';
const HOME = '223456789012345678';
const OTHER = '323456789012345678';
const data = { recipient: 'Tim Orion', achievement: 'Juara 1 turnamen MLBB', date: '17 Oktober 2026', players: 'Raka (Sky)\nDara' };
const template = buildAppreciationDraft(data);
const { selectedTags } = require('../src/ops/appreciation-tags');
const { handleTagSelection, publicationPayload } = require('../src/ops/hub');
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

test('explicit tag selection is private, actor-bound, member-validated and revision-safe', async t => {
  withEnv(t, { OWNER_ID: OWNER, DISCORD_GUILD_ID: HOME });
  const { draft } = store.createDraft({ ...template, appreciationTags: { memberIds: [OTHER] } });
  assert.deepEqual(selectedTags(draft), [], 'external draft input cannot opt into mentions');
  const { interaction, sent } = fixture();
  interaction.guild.id = HOME;
  interaction.guild.members = { fetch: async ({ user }) => ({ id: user, guild: { id: HOME }, user: { bot: false } }) };
  interaction.customId = `ops:tags:${draft.id}`;
  await handleButton(interaction);
  const picker = interaction.editPayload.components[0].toJSON().components[0];
  assert.equal(picker.type, 5); assert.equal(picker.max_values, 8);
  assert.deepEqual(interaction.editPayload.allowedMentions, { parse: [] });
  interaction.customId = picker.custom_id;
  interaction.isUserSelectMenu = () => true;
  interaction.values = [OTHER];
  await handleTagSelection(interaction);
  const updated = store.getDraft(draft.id);
  assert.deepEqual(selectedTags(updated), [OTHER]);
  assert.equal(sent.length, 0);
  assert.deepEqual((await draftPayload(updated)).allowedMentions, { parse: [] });
  const publicPayload = await publicationPayload(interaction.guild, updated);
  assert.deepEqual(publicPayload.allowedMentions, { parse: [], users: [OTHER], repliedUser: false });
  assert.equal(publicPayload.content, `Apresiasi buat <@${OTHER}>! 🏆`);
  assert.match(publicPayload.embeds[0].data.description, /Pemain\n• Raka \(Sky\)\n• Dara/);
  assert.doesNotMatch(publicPayload.embeds[0].data.description, /;/);
  interaction.values = [OWNER];
  await handleTagSelection(interaction); // Original selector is now stale.
  assert.deepEqual(selectedTags(store.getDraft(draft.id)), [OTHER]);
  interaction.customId = `ops:tagclear:${OWNER}:${draft.id}:${appreciationRevision(updated)}`;
  await handleTagSelection(interaction);
  assert.deepEqual(selectedTags(store.getDraft(draft.id)), []);
});

test('tag choices reject duplicate, role, bot, outsider, wrong actor and revoked editor selections', async t => {
  withEnv(t, { OWNER_ID: OWNER, DISCORD_GUILD_ID: HOME, OPS_EDITOR_ROLE_IDS: OTHER });
  for (const variant of ['duplicate', 'role', 'bot', 'outsider', 'actor', 'guild', 'revoked', 'racing-edit']) {
    const { draft } = store.createDraft({ ...template });
    const { interaction } = fixture();
    interaction.guild.id = HOME;
    interaction.customId = `ops:tagselect:${OWNER}:${draft.id}:${appreciationRevision(draft)}`;
    interaction.isUserSelectMenu = () => true;
    interaction.values = variant === 'duplicate' ? [OTHER, OTHER] : [OTHER];
    if (variant === 'actor' || variant === 'revoked') interaction.user.id = OTHER;
    if (variant === 'revoked') interaction.customId = `ops:tagselect:${OTHER}:${draft.id}:${appreciationRevision(draft)}`;
    if (variant === 'guild') interaction.guildId = OTHER;
    interaction.guild.members = { fetch: async ({ user }) => {
      if (variant === 'role') throw new Error('private provider error');
      if (variant === 'racing-edit') store.updatePendingDraft(draft.id, buildAppreciationDraft({ ...data, recipient: 'Changed' }), OWNER);
      return { id: user, guild: { id: variant === 'outsider' ? OTHER : HOME }, user: { bot: variant === 'bot' }, roles: [] };
    } };
    await handleTagSelection(interaction);
    assert.deepEqual(selectedTags(store.getDraft(draft.id)), [], variant);
  }
});

test('publication revalidates members, edits clear choices, old records stay mention-free', async t => {
  withEnv(t, { OWNER_ID: OWNER, DISCORD_GUILD_ID: HOME });
  const { draft } = store.createDraft({ ...template });
  const tagged = store.setAppreciationTags(draft.id, [OTHER], OWNER, appreciationRevision(draft));
  assert.deepEqual(selectedTags(store.getDraft(draft.id)), [OTHER]);
  await assert.rejects(publicationPayload({ id: HOME, members: { fetch: async () => null } }, tagged), /MEMBER_UNAVAILABLE/);
  await assert.rejects(publicationPayload({ id: OTHER }, tagged), /GUILD_INVALID/);
  const edited = store.updatePendingDraft(draft.id, template, OWNER);
  assert.deepEqual(selectedTags(edited), []);
  const payload = await publicationPayload({ id: HOME }, edited);
  assert.deepEqual(payload.allowedMentions, { parse: [] }); assert.equal(payload.content, undefined);
});

test('scheduled tagged delivery validates users and holds uncertain outcomes without retry', async t => {
  withEnv(t, { OWNER_ID: OWNER, DISCORD_GUILD_ID: HOME, ANNOUNCE_CHANNEL_ID: 'announcements' });
  const { draft } = store.createDraft({ ...template });
  store.setAppreciationTags(draft.id, [OTHER], OWNER, appreciationRevision(draft));
  const now = Date.now();
  store.scheduleDraft(draft.id, OWNER, new Date(now - 60000).toISOString(), now - 180000);
  const { interaction } = fixture();
  interaction.guild.id = HOME;
  interaction.guild.members = { fetch: async ({ user }) => ({ id: user, guild: { id: HOME }, user: { bot: false } }) };
  let sends = 0;
  interaction.guild.channels.cache.get('announcements').send = async payload => {
    sends++; assert.deepEqual(payload.allowedMentions.users, [OTHER]); assert.equal(payload.enforceNonce, true);
    throw new Error('SIMULATED_UNCERTAIN');
  };
  const client = { guilds: { fetch: async () => interaction.guild } };
  await processDueSchedules(client); await processDueSchedules(client);
  assert.equal(sends, 1); assert.equal(store.getDraft(draft.id).status, 'publishing');
});

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
    assert.equal(image.readUInt32BE(16), 1080);
    assert.ok(image.readUInt32BE(20) >= 1350 && image.readUInt32BE(20) <= 3600);
    assert.ok(image.length < 8 * 1024 * 1024);
    assert.deepEqual(await renderAppreciationCard(input), image);
  }
});

test('branded logo pixels are actually decoded, not merely reported as complete', async () => {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const image = await loadImage(await renderAppreciationCard({ recipient: 'Hengs Familia', achievement: 'Juara 1' }));
  const canvas = createCanvas(1080, 1350);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(251, 202, 578, 578).data;
  let bluePixels = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 2] > 90 && pixels[i + 2] > pixels[i] * 1.7) bluePixels += 1;
  }
  assert.ok(bluePixels > 5000, 'the fixed blue crest must be visible');
});

test('Crown Stage promotes only explicit rankings and preserves generic achievements', () => {
  assert.equal(cardContent(data).heading, 'JUARA 1');
  assert.equal(cardContent(data).game, 'MLBB');
  for (const achievement of ['Bantu komunitas', 'Hampir juara 1', 'Juara 1?', 'Juara 0', 'Juara 1 bersama tim lain']) {
    const content = cardContent({ ...data, achievement });
    assert.equal(content.game, '');
    assert.ok(content.detail.length > 0);
  }
  const generic = cardContent({ recipient: 'Tim Orion', achievement: 'Bantu komunitas' });
  assert.equal(generic.heading, 'APRESIASI');
  assert.equal(generic.detail, 'Bantu komunitas');
  assert.equal(generic.date, undefined);
  assert.deepEqual(generic.players, []);
  assert.deepEqual(cardContent(data).players, [{ name: 'Raka', nick: 'Sky' }, { name: 'Dara', nick: '' }]);
});

test('layout retains 0..8 players and full long text without overlapping text boxes', async () => {
  await renderAppreciationCard(data); // Register bundled fonts before measuring.
  const { createCanvas } = require('@napi-rs/canvas');
  const ctx = createCanvas(1080, 1350).getContext('2d');
  for (let count = 0; count <= 8; count += 1) {
    const input = { recipient: 'W'.repeat(80), achievement: 'W'.repeat(220), occasion: 'M'.repeat(100),
      date: '2'.repeat(48), players: Array.from({ length: count }, (_, i) => `P${i} ${'W'.repeat(55)}`).join('; ') };
    const content = cardContent(input);
    const layout = layoutCard(ctx, content, true);
    assert.equal(content.players.length, count);
    assert.ok(layout.height <= 3600);
    const text = layout.blocks.map(b => b.lines.join('')).join('').replaceAll(' ', '');
    for (const player of content.players) assert.ok(text.includes(player.name.replaceAll(' ', '')));
    assert.ok(text.includes(content.achievement));
    for (const block of layout.blocks) {
      ctx.font = `${block.size}px "${block.family}"`;
      assert.ok(block.y >= 0 && block.y + block.height <= layout.height);
      for (const line of block.lines) assert.ok(ctx.measureText(line).width <= block.width + 1, line);
    }
    for (let i = 0; i < layout.blocks.length; i += 1) {
      const a = layout.blocks[i];
      for (const b of layout.blocks.slice(i + 1)) {
        const overlapsX = Math.abs(a.x - b.x) < (a.width + b.width) / 2;
        const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height;
        assert.equal(overlapsX && overlapsY, false, 'text boxes must not overlap');
      }
    }
  }
});

test('rosters balance 0..8 players, preserve order and center each row', async () => {
  await renderAppreciationCard(data);
  const { createCanvas } = require('@napi-rs/canvas');
  const ctx = createCanvas(1080, 1350).getContext('2d');
  const expected = [[], [1], [2], [3], [2, 2], [3, 2], [3, 3], [3, 2, 2], [3, 3, 2]];
  const layouts = expected.map((counts, count) => {
    const players = Array.from({ length: count }, (_, i) => `Player ${i + 1} (Nick ${i + 1})`).join('\n');
    const layout = layoutCard(ctx, cardContent({ ...data, players }), true);
    assert.deepEqual(layout.roster.map(row => row.count), counts);
    assert.deepEqual(layout.roster.flatMap(row => row.names.map(block => block.lines.join(' '))),
      Array.from({ length: count }, (_, i) => `Player ${i + 1}`));
    const sizes = new Set(layout.roster.flatMap(row => row.names.map(block => block.size)));
    assert.ok(sizes.size <= 1, 'players have a consistent visual weight');
    for (const row of layout.roster) {
      assert.equal(row.names.reduce((sum, block) => sum + block.x, 0) / row.count, 540);
      assert.equal(new Set(row.names.map(block => block.y)).size, 1);
      assert.equal(new Set(row.nicknames.map(block => block.y)).size, 1);
      for (const block of [...row.names, ...row.nicknames]) {
        assert.ok(block.x - block.width / 2 >= 60);
        assert.ok(block.x + block.width / 2 <= 1020);
      }
    }
    return layout;
  });
  assert.ok(layouts[1].roster[0].names[0].size > layouts[3].roster[0].names[0].size);
  assert.ok(layouts[1].roster[0].names[0].width > layouts[3].roster[0].names[0].width);
});

test('wide names use roomy rows and aligned nicknames without empty nickname gaps', async () => {
  await renderAppreciationCard(data);
  const { createCanvas } = require('@napi-rs/canvas');
  const ctx = createCanvas(1080, 1350).getContext('2d');
  const players = ['WWWWWWWWWWWWWWWWWWWWWWWW (North)', 'Dara (Sky)', 'Bima', 'Nadia (Bulan 🌙)'];
  const content = cardContent({ ...data, players: players.join('\n') });
  const layout = layoutCard(ctx, content, true);
  assert.deepEqual(layout.roster.map(row => row.count), [2, 2]);
  const first = layout.roster[0];
  assert.ok(first.names[0].lines.length > first.names[1].lines.length);
  assert.equal(first.nicknames[0].y, first.nicknames[1].y);
  assert.ok(first.nicknames[0].y >= Math.max(...first.names.map(b => b.y + b.height)));
  assert.equal(layout.roster[1].nicknames.length, 1);
  assert.ok(layout.roster[1].y > first.bottom);
  const rendered = layout.roster.flatMap(row => [...row.names, ...row.nicknames])
    .map(block => block.lines.join('')).join('').replaceAll(' ', '');
  for (const player of content.players) {
    assert.ok(rendered.includes(player.name.replaceAll(' ', '')));
    assert.ok(rendered.includes(player.nick.replaceAll(' ', '')));
  }
});

test('structured revision prefills fields, redraws privately and refuses stale or unauthorized forms', async t => {
  withEnv(t, { OWNER_ID: OWNER, DISCORD_GUILD_ID: HOME, BOT_SETTINGS_CHANNEL_ID: 'settings' });
  const { draft } = store.createDraft({ ...template });
  store.setPanel(draft.id, { channelId: 'settings', messageId: 'panel' });
  const { interaction, sent, edits } = fixture();
  interaction.customId = `ops:edit:${draft.id}`;
  await handleButton(interaction);
  const modal = interaction.modal.toJSON();
  assert.match(modal.custom_id, /^ops:appreciationedit:/);
  assert.equal(modal.components[4].components[0].value, 'Raka (Sky)\nDara');
  assert.ok(modal.custom_id.length <= 100);
  const original = store.getDraft(draft.id).body;
  for (const overrides of [{ user: { id: OTHER } }, { guildId: OTHER }, { customId: `${modal.custom_id}:forged` }]) {
    const bad = fixture().interaction;
    bad.customId = modal.custom_id;
    Object.assign(bad, overrides);
    await handleModal(bad);
    assert.equal(store.getDraft(draft.id).body, original);
    assert.equal(bad.replyPayload.ephemeral, true);
  }
  interaction.customId = modal.custom_id;
  interaction.fields.getTextInputValue = key => key === 'occasion' ? 'Orion Cup' : data[key] || '';
  await handleModal(interaction);
  assert.equal(readAppreciationDraft(store.getDraft(draft.id)).occasion, 'Orion Cup');
  assert.equal(sent.length, 0, 'no public send on edit');
  assert.ok(edits[0].files[0].attachment.length);
  assert.deepEqual(edits[0].attachments, []);
  interaction.fields.getTextInputValue = key => key === 'occasion' ? 'Stale Cup' : data[key] || '';
  await handleModal(interaction);
  assert.match(interaction.replyPayload.content, /sudah berubah/);
  assert.equal(readAppreciationDraft(store.getDraft(draft.id)).occasion, 'Orion Cup');
  interaction.customId = `ops:appreciationedit:${OWNER}:${draft.id}:${appreciationRevision(store.getDraft(draft.id))}`;
  store.finalizeDraft(draft.id, 'discarded', OWNER);
  await handleModal(interaction);
  assert.match(interaction.replyPayload.content, /sudah berubah/);
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
  assert.equal(publicPayload.embeds[0].data.description, formatAppreciation(readAppreciationDraft(template)));
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
  assert.equal(failed.embeds[0].data.description, formatAppreciation(readAppreciationDraft(template)));
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

test('a competition result without tournament, date or players asks first with the tag tip; other appreciations draft at once', () => {
  const ask = parseOperationPrompt('bikin apresiasi Hengs Family karena juara 1');
  assert.equal(ask.kind, 'appreciation_missing'); assert.equal(ask.operation, 'appreciation');
  assert.deepEqual(ask.missing, ['occasion', 'date', 'players']);
  assert.deepEqual(ask.data, { recipient: 'Hengs Family', achievement: 'juara 1' });
  for (const line of ['Nama turnamen atau acaranya apa?', 'Tanggalnya kapan?', 'Siapa aja pemainnya?', 'Tag anggota']) assert.ok(ask.content.includes(line), line);
  assert.deepEqual(parseOperationPrompt('bikin apresiasi Tim Orion karena juara 1 turnamen kampus; tanggal 25 Oktober 2026').missing, ['players']);
  assert.equal(parseOperationPrompt('bikin apresiasi buat Tim Orion karena membantu komunitas').kind, 'ops_draft');
  assert.equal(parseOperationPrompt('bikin apresiasi Raka karena jadi MVP; momen Campus Cup; tanggal 1 Nov 2026; pemain Raka').kind, 'ops_draft');
});

test('pending appreciation details expire after 15 minutes and belong to one requester', () => {
  const pending = require('../src/ops/appreciation-pending');
  const key = pending.remember(OWNER, { recipient: 'A', achievement: 'juara 2' }, 1000);
  assert.match(key, /^[a-f0-9]{8}$/);
  assert.deepEqual(pending.recall(key, OWNER, 1000 + 60_000), { recipient: 'A', achievement: 'juara 2' });
  assert.equal(pending.recall(key, OTHER, 1000 + 60_000), null);
  assert.equal(pending.recall(key, OWNER, 1000 + 15 * 60_000), null);
});

test('Lengkapi opens the form with what Hengs already has; Bikin sekarang drafts once; both stay with the requester', async t => {
  withEnv(t, { OWNER_ID: OWNER, DISCORD_GUILD_ID: HOME, BOT_SETTINGS_CHANNEL_ID: 'settings' });
  const pending = require('../src/ops/appreciation-pending');
  const { appreciationAskRow } = require('../src/ops/appreciation-form');
  const key = pending.remember(OWNER, { recipient: 'Hengs Family', achievement: 'juara 1' });
  const ids = appreciationAskRow(OWNER, key)[0].toJSON().components.map(c => c.custom_id);
  assert.deepEqual(ids, [`ops:appreciationfill:${OWNER}:${key}`, `ops:appreciationnow:${OWNER}:${key}`]);
  assert.deepEqual(appreciationAskRow(OWNER, 'nothex'), []);
  const { interaction, sent } = fixture();
  interaction.customId = ids[0];
  await handleButton(interaction);
  const form = interaction.modal.toJSON();
  assert.equal(form.custom_id, `ops:appreciationform:${OWNER}`);
  assert.equal(form.components[0].components[0].value, 'Hengs Family');
  assert.equal(form.components[1].components[0].value, 'juara 1');
  const stranger = fixture().interaction;
  stranger.user = { id: OTHER }; stranger.customId = ids[1];
  await handleButton(stranger);
  assert.match(stranger.replyPayload.content, /khusus peminta/);
  interaction.customId = ids[1];
  await handleButton(interaction);
  assert.equal(sent.length, 1); assert.match(interaction.editPayload.content, /Tag anggota/);
  await handleButton(interaction);
  assert.match(interaction.replyPayload.content, /kedaluwarsa/); assert.equal(sent.length, 1);
});
