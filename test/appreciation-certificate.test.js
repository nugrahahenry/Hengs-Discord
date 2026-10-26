'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-certificate-'));
process.env.OPS_DATA_DIR = dir;
const OWNER = '123456789012345678';
const HOME = '223456789012345678';
const OTHER = '323456789012345678';
const CHANNEL = '423456789012345678';
const MESSAGE = '523456789012345678';
const FILE = '623456789012345678';
const BOT = '723456789012345678';
process.env.OWNER_ID = OWNER;
process.env.DISCORD_GUILD_ID = HOME;
const bytes = createCanvas(40, 30).toBuffer('image/png');
let downloading = async () => bytes;
// Offline dependency seam: never reach Discord, DNS or a real provider in this suite.
require('../src/news/http').fetchBounded = (...args) => downloading(...args);
const certificate = require('../src/ops/appreciation-certificate');
const store = require('../src/ops/store');
const { buildAppreciationDraft, formatAppreciation } = require('../src/ops/appreciation');
const { appreciationRevision, appreciationModal } = require('../src/ops/appreciation-form');
const { publicationPayload, approvalRow, handleButton, handleModal, processDueSchedules } = require('../src/ops/hub');
const { buildOperationQuestions } = require('../src/prompt-operations');
const template = buildAppreciationDraft({ recipient: 'Hengs Family X SYN', achievement: 'Juara 1', occasion: 'Anti Squad Organizer' });
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
test.beforeEach(() => { downloading = async () => bytes; });

function fixture() {
  const { draft } = store.createDraft(template);
  const sent = [];
  const original = { id: FILE, url: `https://cdn.discordapp.com/ephemeral-attachments/${CHANNEL}/${FILE}/upload.png?ex=test`,
    contentType: 'image/png', size: bytes.length };
  const saved = { ...original, url: `https://cdn.discordapp.com/attachments/${CHANNEL}/${FILE}/sertifikat.png?ex=renewed` };
  let deleted = 0;
  const message = { id: MESSAGE, channelId: CHANNEL, author: { id: BOT }, attachments: new Collection([[FILE, saved]]),
    delete: async () => { deleted++; } };
  const channel = { id: CHANNEL, guildId: HOME, permissionsFor: () => ({ has: () => false }), isTextBased: () => true,
    permissionOverwrites: { cache: new Collection() },
    name: 'bot-settings', messages: { fetch: async () => message }, send: async payload => { sent.push(payload); return message; } };
  const guild = { id: HOME, roles: { everyone: {} }, client: { user: { id: BOT } },
    channels: { cache: new Collection([[CHANNEL, channel]]), fetch: async () => channel } };
  const interaction = { id: '823456789012345678', customId: certificate.certificateModal(OWNER, draft).data.custom_id,
    user: { id: OWNER }, guildId: HOME, guild, client: guild.client, isModalSubmit: () => true, isButton: () => true,
    fields: { getUploadedFiles: () => new Collection([[FILE, original]]) },
    deferReply: async () => { interaction.deferred = true; }, editReply: async payload => { interaction.result = payload; },
    reply: async payload => { interaction.result = payload; }, showModal: async value => { interaction.modal = value; } };
  const dependencies = { findSettingsChannel: () => channel, editStoredPanel: async () => true };
  return { draft, interaction, dependencies, original, saved, channel, guild, message, sent, deleted: () => deleted };
}

test('native upload form is actor/revision-bound and accepts exactly one file', () => {
  const { draft } = fixture();
  const modal = certificate.certificateModal(OWNER, draft).toJSON();
  assert.match(modal.custom_id, new RegExp(`^ops:certupload:${OWNER}:${draft.id}:`));
  const upload = modal.components[0].component;
  assert.equal(upload.type, 19); assert.equal(upload.min_values, 1); assert.equal(upload.max_values, 1);
  assert.equal(upload.required, true);
  const buttons = approvalRow(draft).flatMap(row => row.toJSON().components);
  assert.ok(buttons.some(button => button.custom_id === `ops:certificate:${draft.id}`));
  const name = appreciationModal(OWNER).toJSON().components[0].components[0];
  assert.match(name.placeholder, /Hengs Family/); assert.match(name.placeholder, /tidak perlu/);
});

test('copy uses separate points, literal names, and no semicolon or long dash', () => {
  const text = formatAppreciation({ recipient: 'Hengs Family', achievement: 'Juara 1', players: 'Henry (StarGod); Sam' });
  assert.match(text, /• Penerima Hengs Family/); assert.doesNotMatch(text, /Tim Hengs|[;\u2013\u2014]/);
  assert.match(text, /Pemain\n• Henry \(StarGod\)\n• Sam/);
  const guide = buildOperationQuestions('appreciation');
  assert.match(guide, /Sertifikat/); assert.match(guide, /Tidak perlu/);
  assert.doesNotMatch(guide, /[;\u2013\u2014]/);
});

test('original PNG is preserved privately, persisted without URL/bytes, and published as a separate image', async () => {
  const f = fixture();
  await certificate.handleCertificate(f.interaction, f.dependencies);
  const draft = store.getDraft(f.draft.id);
  assert.equal(draft.status, 'pending'); assert.ok(certificate.validReference(draft.appreciationCertificate, draft));
  assert.equal(f.sent.length, 1); assert.deepEqual(f.sent[0].files[0].attachment, bytes);
  assert.deepEqual(f.sent[0].allowedMentions, { parse: [] });
  assert.doesNotMatch(JSON.stringify(draft.appreciationCertificate), /https|base64|filename/);
  assert.match(f.interaction.result.content, /sudah terpasang/);
  const payload = await publicationPayload(f.guild, draft);
  assert.equal(payload.files.length, 2); assert.equal(payload.embeds.length, 2);
  assert.deepEqual(payload.files[1].attachment, bytes);
  assert.equal(payload.embeds[1].data.image.url, 'attachment://sertifikat.png');
  assert.deepEqual(payload.allowedMentions, { parse: [] });
});

test('JPEG original is supported, and content mismatch or giant image is rejected before decode', async () => {
  const jpeg = createCanvas(30, 20).toBuffer('image/jpeg');
  const f = fixture();
  assert.deepEqual(certificate.dimensions(jpeg, 'image/jpeg'), [30, 20]);
  assert.deepEqual(await certificate.download({ ...f.original, contentType: 'image/jpeg', size: jpeg.length }, async () => jpeg), jpeg);
  const giant = Buffer.from(bytes); giant.writeUInt32BE(100000, 16);
  await assert.rejects(certificate.download(f.original, async () => giant), /INVALID/);
  await assert.rejects(certificate.download(f.original, async () => jpeg), /INVALID/);
  await assert.rejects(certificate.download(f.original, async () => Buffer.alloc(bytes.length)), /INVALID/);
  await assert.rejects(certificate.download(f.original, async () => bytes.subarray(0, 12)), /INVALID/);
});

test('download only admits validated Discord file metadata and limits', async () => {
  const f = fixture(); let calls = 0;
  const fetchBytes = async () => { calls++; return bytes; };
  for (const patch of [
    { url: `https://example.org/attachments/${CHANNEL}/${FILE}/a.png` },
    { url: `https://cdn.discordapp.com.evil.org/attachments/${CHANNEL}/${FILE}/a.png` },
    { url: `https://a:b@cdn.discordapp.com/attachments/${CHANNEL}/${FILE}/a.png` },
    { url: `http://cdn.discordapp.com/attachments/${CHANNEL}/${FILE}/a.png` },
    { url: `https://cdn.discordapp.com/attachments/${CHANNEL}/${OTHER}/a.png` },
    { url: `https://cdn.discordapp.com/attachments/${CHANNEL}/${FILE}/a.png#bad` },
    { contentType: 'image/svg+xml' }, { contentType: 'application/pdf' }, { size: 0 }, { size: certificate.MAX_BYTES + 1 },
  ]) await assert.rejects(certificate.download({ ...f.original, ...patch }, fetchBytes), /INVALID/);
  assert.equal(calls, 0);
});

test('review denies broad member-role grants even when everyone cannot view', () => {
  const f = fixture();
  f.channel.permissionOverwrites.cache.set(OTHER, { id: OTHER, type: 0, allow: { has: () => true } });
  assert.equal(certificate.privateChannel(f.channel, f.guild), false);
  f.channel.permissionOverwrites.cache.clear();
  f.channel.permissionOverwrites.cache.set(OWNER, { id: OWNER, type: 1, allow: { has: () => true } });
  assert.equal(certificate.privateChannel(f.channel, f.guild), true);
  f.channel.permissionOverwrites.cache.set(OTHER, { id: OTHER, type: 1, allow: { has: () => true } });
  assert.equal(certificate.privateChannel(f.channel, f.guild), false);
});

test('late editor revocation is caught before a receipt is sent', async () => {
  const f = fixture();
  process.env.OPS_EDITOR_ROLE_IDS = OTHER;
  f.interaction.user.id = OTHER;
  f.interaction.member = { roles: [OTHER] };
  f.interaction.customId = certificate.certificateModal(OTHER, f.draft).data.custom_id;
  f.guild.members = { fetch: async () => ({ guild: { id: HOME }, roles: [] }) };
  try {
    await certificate.handleCertificate(f.interaction, f.dependencies);
    assert.equal(f.sent.length, 0); assert.equal(store.getDraft(f.draft.id).status, 'pending');
  } finally { delete process.env.OPS_EDITOR_ROLE_IDS; }
});

test('wrong actor, foreign guild, revoked editor, stale draft, public review and oversized upload are blocked', async () => {
  for (const variant of ['actor', 'guild', 'editor', 'stale', 'public', 'size', 'multiple']) {
    const f = fixture();
    if (variant === 'actor') f.interaction.user.id = OTHER;
    if (variant === 'guild') f.interaction.guildId = OTHER;
    if (variant === 'editor') {
      f.interaction.user.id = OTHER;
      f.interaction.customId = certificate.certificateModal(OTHER, f.draft).data.custom_id;
    }
    if (variant === 'stale') store.updatePendingDraft(f.draft.id, template, OWNER);
    if (variant === 'public') f.channel.permissionsFor = () => ({ has: () => true });
    if (variant === 'size') f.original.size = certificate.MAX_BYTES + 1;
    if (variant === 'multiple') f.interaction.fields.getUploadedFiles = () => new Collection([[FILE, f.original], [OTHER, f.original]]);
    await certificate.handleCertificate(f.interaction, f.dependencies);
    assert.equal(f.sent.length, 0, variant); assert.equal(store.getDraft(f.draft.id).appreciationCertificate, undefined, variant);
    assert.equal(store.getDraft(f.draft.id).status, 'pending', variant);
  }
});

test('upload claim excludes publish, edit, second upload, then stores exactly once', async () => {
  const f = fixture(); let finish; let started;
  const ready = new Promise(resolve => { started = resolve; });
  downloading = async () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const first = certificate.handleCertificate(f.interaction, f.dependencies);
  await ready;
  assert.equal(store.claimPublish(f.draft.id, OWNER), null);
  assert.equal(store.updatePendingDraft(f.draft.id, template, OWNER), null);
  await certificate.handleCertificate({ ...f.interaction }, f.dependencies);
  finish(bytes); await first;
  assert.equal(f.sent.length, 1); assert.equal(store.getDraft(f.draft.id).status, 'pending');
});

test('replacement and unlink invalidate old forms without deleting the private original', async () => {
  const f = fixture(); await certificate.handleCertificate(f.interaction, f.dependencies);
  const attached = store.getDraft(f.draft.id);
  await certificate.handleCertificate(f.interaction, f.dependencies);
  assert.equal(f.sent.length, 1, 'stale upload cannot overwrite');
  f.interaction.customId = certificate.certificateModal(OWNER, attached).data.custom_id;
  await certificate.handleCertificate(f.interaction, f.dependencies);
  assert.equal(f.sent.length, 2, 'replacement is an explicit new upload');
  const replaced = store.getDraft(attached.id);
  f.interaction.customId = `ops:certclear:${attached.id}:${appreciationRevision(replaced)}`;
  await certificate.handleCertificate(f.interaction, f.dependencies);
  assert.equal(store.getDraft(attached.id).appreciationCertificate, undefined);
  assert.equal(f.deleted(), 0);
});

test('receipt cleanup on failed persistence is scoped and successful reply cannot unlock a later claim', async () => {
  const failed = fixture();
  failed.message.id = 'invalid';
  await certificate.handleCertificate(failed.interaction, failed.dependencies);
  assert.equal(failed.deleted(), 1);
  assert.equal(store.getDraft(failed.draft.id).status, 'pending');
  assert.equal(store.getDraft(failed.draft.id).appreciationCertificate, undefined);
  const success = fixture();
  success.interaction.editReply = async () => store.claimRevision(success.draft.id, OWNER, 'certificate');
  await certificate.handleCertificate(success.interaction, success.dependencies);
  assert.equal(store.getDraft(success.draft.id).status, 'revising', 'later claim must remain locked');
  store.releaseRevision(success.draft.id);
});

test('malformed PNG checksum, compression overflow, truncated JPEG and transport errors are rejected', async () => {
  const f = fixture();
  const corrupt = Buffer.from(bytes); corrupt[corrupt.length - 1] ^= 1;
  await assert.rejects(certificate.download(f.original, async () => corrupt));
  const smaller = Buffer.from(bytes); smaller.writeUInt32BE(1, 16); smaller.writeUInt32BE(1, 20);
  smaller.writeUInt32BE(require('node:zlib').crc32(smaller.subarray(12, 29)), 29);
  await assert.rejects(certificate.download(f.original, async () => smaller));
  const jpeg = createCanvas(30, 20).toBuffer('image/jpeg'); jpeg[jpeg.length - 1] = 0;
  await assert.rejects(certificate.download({ ...f.original, size: jpeg.length, contentType: 'image/jpeg' }, async () => jpeg));
  await assert.rejects(certificate.download(f.original, async () => { throw new Error('transport'); }));
});

test('file edits invalidate the binding and unknown external metadata is ignored', async () => {
  const f = fixture(); await certificate.handleCertificate(f.interaction, f.dependencies);
  const before = store.getDraft(f.draft.id);
  const external = store.createDraft({ ...template, appreciationCertificate: before.appreciationCertificate }).draft;
  assert.equal(external.appreciationCertificate, undefined);
  assert.equal(store.updatePendingDraft(f.draft.id, template, OWNER).appreciationCertificate, undefined);
  assert.equal(await certificate.publicationCertificate(f.guild, external), null);
});

test('restart preserves attachment references and interrupted uploads recover without inventing success', async () => {
  const f = fixture(); await certificate.handleCertificate(f.interaction, f.dependencies);
  delete require.cache[require.resolve('../src/ops/store')];
  const reopened = require('../src/ops/store');
  assert.ok(reopened.getDraft(f.draft.id).appreciationCertificate);
  const other = reopened.createDraft(template).draft;
  reopened.claimRevision(other.id, OWNER, 'certificate'); reopened.recoverRevisingDrafts();
  assert.equal(reopened.getDraft(other.id).status, 'pending');
  assert.equal(reopened.getDraft(other.id).appreciationCertificate, undefined);
});

test('missing, swapped, wrong-author, changed bytes and wrong-guild certificates stop publication', async () => {
  for (const variant of ['missing', 'swapped', 'author', 'bytes', 'guild', 'type', 'public']) {
    const f = fixture(); await certificate.handleCertificate(f.interaction, f.dependencies);
    const draft = store.getDraft(f.draft.id);
    if (variant === 'missing') f.channel.messages.fetch = async () => null;
    if (variant === 'swapped') f.message.channelId = OTHER;
    if (variant === 'author') f.message.author.id = OTHER;
    if (variant === 'bytes') downloading = async () => { throw new Error('PRIVATE_PROVIDER_DETAIL'); };
    if (variant === 'guild') f.guild.id = OTHER;
    if (variant === 'type') f.saved.contentType = 'image/jpeg';
    if (variant === 'public') f.channel.permissionsFor = () => ({ has: () => true });
    await assert.rejects(publicationPayload(f.guild, draft), /APPRECIATION_CERTIFICATE_INVALID/, variant);
    downloading = async () => bytes;
  }
});

test('native hub routes show upload form and submit certificate without public send', async () => {
  const f = fixture(); f.interaction.customId = `ops:certificate:${f.draft.id}`;
  await handleButton(f.interaction);
  assert.equal(f.interaction.modal.toJSON().components[0].component.type, 19);
  f.interaction.customId = f.interaction.modal.data.custom_id;
  await handleModal(f.interaction);
  assert.equal(f.sent.length, 1); assert.ok(store.getDraft(f.draft.id).appreciationCertificate);
});

test('scheduled publication includes unchanged certificate and never silently drops a missing attachment', async () => {
  const f = fixture(); await certificate.handleCertificate(f.interaction, f.dependencies);
  const announcements = { id: 'announcements', isTextBased: () => true, send: async payload => {
    assert.deepEqual(payload.files[1].attachment, bytes); return { id: 'posted' };
  } };
  process.env.ANNOUNCE_CHANNEL_ID = announcements.id;
  f.guild.channels.cache.set(announcements.id, announcements);
  const now = Date.now();
  store.scheduleDraft(f.draft.id, OWNER, new Date(now - 1000).toISOString(), now - 2000);
  await processDueSchedules({ guilds: { fetch: async () => f.guild } });
  assert.equal(store.getDraft(f.draft.id).status, 'published');
  const g = fixture(); await certificate.handleCertificate(g.interaction, g.dependencies);
  let sends = 0;
  g.guild.channels.cache.set(announcements.id, { ...announcements, send: async () => { sends++; } });
  g.channel.messages.fetch = async () => null;
  store.scheduleDraft(g.draft.id, OWNER, new Date(now - 1000).toISOString(), now - 2000);
  await processDueSchedules({ guilds: { fetch: async () => g.guild } });
  assert.equal(sends, 0); assert.notEqual(store.getDraft(g.draft.id).status, 'published');
});
