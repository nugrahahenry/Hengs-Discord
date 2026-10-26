'use strict';

const { createHash } = require('node:crypto');
const { crc32, inflateSync } = require('node:zlib');
const { ModalBuilder, LabelBuilder, FileUploadBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { fetchBounded } = require('../news/http');
const { readAppreciationDraft } = require('./appreciation');
const { appreciationRevision } = require('./appreciation-form');
const { isEditor, isOwner, configuredEditorRoleIds } = require('./permissions');
const store = require('./store');
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 8_000_000;
const MAX_EDGE = 8192;
const TYPES = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg' });
const snowflake = value => typeof value === 'string' && /^\d{15,22}$/.test(value);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const binding = draft => digest(JSON.stringify([draft.title, draft.body]));
const error = () => new Error('APPRECIATION_CERTIFICATE_INVALID');
let transfers = 0;

function validReference(ref, draft) {
  return ref?.version === 1 && ['guildId', 'channelId', 'messageId', 'attachmentId'].every(key => snowflake(ref[key]))
    && Object.hasOwn(TYPES, ref.type) && Number.isInteger(ref.size) && ref.size > 0 && ref.size <= MAX_BYTES
    && /^[a-f0-9]{64}$/.test(ref.sha256) && ref.contentHash === binding(draft)
    && Object.keys(ref).length === 9;
}

function attachmentUrl(file) {
  let url;
  try { url = new URL(file?.url); } catch { throw error(); }
  const parts = url.pathname.match(/^\/(?:ephemeral-attachments|attachments)\/(\d{15,22})\/(\d{15,22})\/[^/]+$/);
  if (!snowflake(file.id) || !parts || parts[2] !== file.id || url.protocol !== 'https:'
    || url.hostname !== 'cdn.discordapp.com' || url.port || url.username || url.password || url.hash
    || !Object.hasOwn(TYPES, file.contentType) || !Number.isInteger(file.size) || file.size < 1 || file.size > MAX_BYTES) throw error();
  return url.href;
}

// Inspect bytes without feeding user uploads to the native Canvas decoder in the bot process.
function dimensions(bytes, type) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES) throw error();
  if (type === 'image/png' && bytes.length >= 33
    && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR') {
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (type === 'image/jpeg' && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) throw error();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 2 > bytes.length) throw error();
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) throw error();
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
      offset += length;
    }
  }
  throw error();
}

function validateStructure(bytes, type, width, height) {
  if (type === 'image/jpeg') {
    if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw error();
    return;
  }
  let offset = 8;
  let ended = false;
  const compressed = [];
  const depth = bytes[24]; const color = bytes[25]; const interlaced = bytes[28];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth) || (color === 3 && depth === 16)
    || (color !== 0 && color !== 3 && depth < 8) || bytes[26] || bytes[27] || interlaced > 1) throw error();
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw error();
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw error();
    if (kind === 'acTL' || (kind === 'IHDR' && offset !== 8)) throw error();
    if (kind === 'IDAT') compressed.push(bytes.subarray(offset + 8, end - 4));
    if (kind === 'IEND') { if (length || end !== bytes.length) throw error(); ended = true; }
    offset = end;
  }
  if (!ended || !compressed.length) throw error();
  const passes = interlaced ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
    [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows = passes.map(([x, y, dx, dy]) => {
    const w = Math.max(0, Math.ceil((width - x) / dx)); const h = Math.max(0, Math.ceil((height - y) / dy));
    return [Math.ceil(w * channels * depth / 8) + 1, w ? h : 0];
  });
  const expected = rows.reduce((sum, [length, count]) => sum + length * count, 0);
  const decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
  if (decoded.length !== expected) throw error();
  let rowOffset = 0;
  for (const [length, count] of rows) for (let y = 0; y < count; y++) {
    if (decoded[rowOffset] > 4) throw error();
    rowOffset += length;
  }
}

async function download(file, fetchBytes = fetchBounded) {
  const url = attachmentUrl(file);
  const bytes = await fetchBytes(url, { hosts: ['cdn.discordapp.com'], types: [file.contentType],
    maxBytes: MAX_BYTES, timeoutMs: 15_000, userAgent: 'Hengs-Appreciation/1.0' });
  if (!Buffer.isBuffer(bytes) || bytes.length !== file.size) throw error();
  const [width, height] = dimensions(bytes, file.contentType);
  if (!width || !height || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) throw error();
  validateStructure(bytes, file.contentType, width, height);
  return bytes;
}

function privateChannel(channel, guild) {
  if (!channel || channel.guildId !== guild.id || !channel.messages?.fetch || !channel.send || !guild.roles?.everyone
    || channel.permissionsFor?.(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel) !== false
    || !channel.permissionOverwrites?.cache?.values) return false;
  const editors = configuredEditorRoleIds();
  // Denying everyone alone is insufficient when a general Member role has a view allow.
  return [...channel.permissionOverwrites.cache.values()].every(overwrite => {
    if (!overwrite.allow.has(PermissionFlagsBits.ViewChannel, false)) return true;
    if (overwrite.type === 1) return [process.env.OWNER_ID, guild.client.user.id].includes(overwrite.id);
    if (overwrite.type !== 0) return false;
    const role = guild.roles.cache?.get(overwrite.id);
    return editors.has(overwrite.id) || role?.tags?.botId === guild.client.user.id
      || role?.permissions.has(PermissionFlagsBits.Administrator) === true;
  });
}

function certificateModal(actor, draft) {
  return new ModalBuilder().setCustomId(`ops:certupload:${actor}:${draft.id}:${appreciationRevision(draft)}`)
    .setTitle('Lampirkan sertifikat')
    .addLabelComponents(new LabelBuilder().setLabel('Satu gambar sertifikat')
      .setDescription('PNG atau JPG, maksimal 8 MB. Gambar asli disimpan di ruang review. Belum diumumkan.')
      .setFileUploadComponent(new FileUploadBuilder().setCustomId('certificate').setMinValues(1).setMaxValues(1).setRequired(true)));
}

function admitted(interaction) {
  return snowflake(interaction.user?.id) && Boolean(process.env.DISCORD_GUILD_ID)
    && interaction.guildId === process.env.DISCORD_GUILD_ID && interaction.guild?.id === interaction.guildId && isEditor(interaction);
}

async function stillAdmitted(interaction) {
  if (!admitted(interaction)) return false;
  if (isOwner(interaction.user.id)) return true;
  const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
  return member?.guild?.id === interaction.guildId && isEditor({ user: interaction.user, member });
}

async function handleCertificate(interaction, { findSettingsChannel, editStoredPanel, fetchBytes = fetchBounded }) {
  const open = interaction.customId.match(/^ops:(certificate|certclear):([a-f0-9]{12}|[a-f0-9]{16})(?::([a-f0-9]{16}))?$/);
  const match = open ? [open[0], open[1], interaction.user?.id, open[2], open[3]]
    : interaction.customId.match(/^ops:(certupload):(\d{15,22}):([a-f0-9]{12}|[a-f0-9]{16}):([a-f0-9]{16})$/);
  const reply = content => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });
  if (!match || !admitted(interaction) || match[2] !== interaction.user.id
    || !(match[1] === 'certupload' ? interaction.isModalSubmit?.() : interaction.isButton?.())) {
    await reply('Tombol ini khusus editor yang membuka form di server utama.'); return true;
  }
  const draft = store.getDraft(match[3]);
  if (!draft || draft.status !== 'pending' || !readAppreciationDraft(draft)
    || (match[1] !== 'certificate' && appreciationRevision(draft) !== match[4])) {
    await reply('Draft sudah berubah. Buka Sertifikat dari preview terbaru ya.'); return true;
  }
  if (match[1] === 'certificate') { await interaction.showModal(certificateModal(interaction.user.id, draft)); return true; }
  if (transfers >= 2) { await reply('Dua gambar sedang diproses. Coba lagi sebentar ya.'); return true; }
  const channel = findSettingsChannel(interaction.guild);
  if (!privateChannel(channel, interaction.guild)) { await reply('Ruang review belum privat atau tidak tersedia. Sertifikat belum disimpan.'); return true; }
  const claimed = store.claimRevision(draft.id, interaction.user.id, 'certificate');
  if (!claimed) { await reply('Draft sedang diproses. Sertifikat belum berubah.'); return true; }
  transfers++;
  let receipt;
  let committed = false;
  try {
    await interaction.deferReply({ ephemeral: true });
    let ref = null;
    if (match[1] === 'certupload') {
      const files = interaction.fields.getUploadedFiles('certificate', true);
      if (files?.size !== 1) throw error();
      const file = files.first();
      const bytes = await download(file, fetchBytes);
      if (!await stillAdmitted(interaction) || !privateChannel(channel, interaction.guild)) throw error();
      const filename = `sertifikat.${TYPES[file.contentType]}`;
      receipt = await channel.send({ content: `Sertifikat asli untuk draft ${draft.id}. Belum diumumkan.`,
        files: [{ attachment: bytes, name: filename, description: 'Sertifikat kiriman editor. Keaslian belum diverifikasi oleh Hengs.' }],
        allowedMentions: { parse: [] }, nonce: interaction.id, enforceNonce: true });
      const saved = receipt.attachments?.first();
      if (receipt.author?.id !== interaction.client.user.id || receipt.channelId !== channel.id
        || !saved || saved.size !== bytes.length || saved.contentType !== file.contentType) throw error();
      attachmentUrl(saved);
      ref = { version: 1, guildId: interaction.guildId, channelId: channel.id, messageId: receipt.id,
        attachmentId: saved.id, type: file.contentType, size: bytes.length, sha256: digest(bytes), contentHash: binding(draft) };
      if (!validReference(ref, draft)) throw error();
    }
    if (!await stillAdmitted(interaction)) throw error();
    const updated = store.setAppreciationCertificate(draft.id, ref, interaction.user.id);
    if (!updated) throw error();
    committed = true;
    let refreshed = false;
    try { refreshed = await editStoredPanel(interaction.guild, updated); }
    catch { console.warn('[ops] APPRECIATION_CERTIFICATE_PANEL_FAILED'); }
    await interaction.editReply({ content: [ref ? 'Sertifikat sudah terpasang di draft.' : 'Sertifikat dilepas dari draft.',
      '• Gambar asli di ruang review tetap tersimpan.',
      ref ? '• Gambar ikut terkirim saat kamu Publish ke pengumuman.' : '• Publikasi berikutnya tidak menyertakan sertifikat.',
      refreshed ? '• Cek preview sebelum Publish. Belum diumumkan.' : '• Panel belum diperbarui. Cek `/ops status` sebelum Publish.'].join('\n'), allowedMentions: { parse: [] } });
  } catch {
    console.warn('[ops] APPRECIATION_CERTIFICATE_FAILED');
    if (receipt && !committed && receipt.author?.id === interaction.client.user.id && receipt.channelId === channel.id) {
      try { await receipt.delete(); } catch { console.warn('[ops] APPRECIATION_CERTIFICATE_CLEANUP_FAILED'); }
    }
    const content = committed ? 'Sertifikat tersimpan, tetapi balasan belum selesai. Cek draft terbaru sebelum mencoba lagi.'
      : 'Sertifikat belum berubah. Pilih satu PNG atau JPG di bawah 8 MB dan 8 juta piksel. Kalau file sudah sesuai, cek akses ruang review lalu coba lagi.';
    try { await (interaction.deferred ? interaction.editReply({ content }) : reply(content)); }
    catch { console.warn('[ops] APPRECIATION_CERTIFICATE_REPLY_FAILED'); }
  } finally {
    // A new edit/upload may begin while the success reply is pending. Never unlock its claim.
    try { if (!committed) store.releaseRevision(draft.id); } finally { transfers--; }
  }
  return true;
}

async function publicationCertificate(guild, draft, { fetchBytes = fetchBounded } = {}) {
  const ref = draft.appreciationCertificate;
  if (!ref) return null;
  if (!readAppreciationDraft(draft) || !validReference(ref, draft) || guild.id !== ref.guildId
    || guild.id !== process.env.DISCORD_GUILD_ID) throw error();
  if (transfers >= 2) throw error();
  transfers++;
  try {
    const channel = await guild.channels.fetch(ref.channelId);
    if (channel?.id !== ref.channelId || !privateChannel(channel, guild)) throw error();
    const message = await channel.messages.fetch({ message: ref.messageId, force: true, cache: false });
    const file = message?.attachments?.get(ref.attachmentId);
    if (message?.author?.id !== guild.client.user.id || message.id !== ref.messageId || message.channelId !== ref.channelId
      || !file || file.contentType !== ref.type || file.size !== ref.size
      || new URL(attachmentUrl(file)).pathname.split('/').slice(1, 4).join('/') !== `attachments/${ref.channelId}/${ref.attachmentId}`) throw error();
    const bytes = await download(file, fetchBytes);
    if (digest(bytes) !== ref.sha256) throw error();
    const name = `sertifikat.${TYPES[ref.type]}`;
    return { file: { attachment: bytes, name, description: 'Sertifikat asli kiriman editor. Keaslian belum diverifikasi oleh Hengs.' },
      embed: new EmbedBuilder().setTitle('Sertifikat dari panitia').setDescription('Lampiran kiriman editor. Keaslian belum diverifikasi oleh Hengs.')
        .setImage(`attachment://${name}`) };
  } catch { throw error(); }
  finally { transfers--; }
}

module.exports = { MAX_BYTES, MAX_PIXELS, validReference, binding, attachmentUrl, dimensions, download, certificateModal,
  handleCertificate, publicationCertificate, privateChannel };
