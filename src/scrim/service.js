'use strict';

// /scrim hasil: a Hengs Family member submits a scrim screenshot with structured fields,
// previews it privately, then Hengs posts it in hasil-scrim and records the result.
const crypto = require('node:crypto');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, PermissionFlagsBits: P, escapeMarkdown,
} = require('discord.js');
const { GAMES } = require('./store');

const PREFIX = 'hengs-scrim:';
const ROLE_NAME = 'Hengs Family';
const CHANNEL_NAME = '📸・hasil-scrim';
const CHANNEL_KEY = 'hasil-scrim';
const TTL = 10 * 60_000;
const MAX_DRAFTS = 100;
const MAX_IMAGE = 8 * 1024 * 1024;
const IMAGE_TYPES = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']]);
const IMAGE_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const BOT_PERMISSIONS = [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.AttachFiles, P.EmbedLinks];
const OUTCOME_LABEL = Object.freeze({ menang: 'Menang', kalah: 'Kalah', seri: 'Seri' });
const MESSAGES = Object.freeze({
  SCRIM_ACCESS: 'Kirim hasil scrim cuma tersedia di server utama Hengs.',
  SCRIM_ROLE_MISSING: 'Role Hengs Family belum ada. Minta admin jalankan /admin setup lalu pilih Scrim tim.',
  SCRIM_CHANNEL_MISSING: 'Channel hasil-scrim belum ada. Minta admin jalankan /admin setup lalu pilih Scrim tim.',
  SCRIM_ROLE_CONFLICT: 'Ada lebih dari satu role bernama Hengs Family. Rapikan dulu supaya Hengs tidak menebak.',
  SCRIM_CHANNEL_CONFLICT: 'Ada lebih dari satu channel hasil-scrim, atau namanya dipakai jenis channel lain. Rapikan dulu.',
  SCRIM_NOT_TEAM: 'Kirim hasil scrim khusus anggota role Hengs Family. Minta admin menambahkan role-nya.',
  SCRIM_FIELDS_INVALID: 'Lawan wajib diisi dan skor pakai format angka-angka, misalnya 2-1.',
  SCRIM_IMAGE_INVALID: 'SS harus gambar PNG, JPG atau WebP, maksimal 8 MB.',
  SCRIM_BOT_PERMISSIONS: 'Hengs perlu izin lihat, baca riwayat, kirim, lampirkan file dan embed di hasil-scrim.',
  SCRIM_STALE: 'Preview sudah kedaluwarsa atau berubah. Jalankan /scrim hasil lagi; belum ada yang dikirim.',
  SCRIM_BUSY: 'Masih ada kiriman yang diproses. Tunggu sebentar ya.',
  SCRIM_LIMIT: 'Lagi banyak preview yang terbuka. Coba lagi sebentar lagi.',
});
const quiet = { allowedMentions: { parse: [] } };
const normalize = name => String(name).toLowerCase().replace(/^[^a-z0-9]+/, '');
// Control and format characters (zero-width, bidi), angle brackets and @ never reach a post.
const clean = (value, max) => String(value ?? '').replace(/[\p{Cc}\p{Cf}<>@]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const shown = value => escapeMarkdown(value);

// Like the channel, the role may carry an emoji prefix ("🫂 Hengs Family"); two candidates still conflict.
async function findTeamRole(guild) {
  const roles = await guild.roles.fetch();
  const matches = [...roles.values()].filter(role => normalize(role?.name) === normalize(ROLE_NAME));
  if (matches.length > 1) throw new Error('SCRIM_ROLE_CONFLICT');
  return matches[0] || null;
}

function findScrimChannel(channels) {
  const matches = channels.filter(channel => normalize(channel?.name) === CHANNEL_KEY);
  if (matches.length > 1 || (matches[0] && matches[0].type !== ChannelType.GuildText)) throw new Error('SCRIM_CHANNEL_CONFLICT');
  return matches[0] || null;
}

function parseScore(value) {
  const match = /^(\d{1,2})\s*[-:]\s*(\d{1,2})$/.exec(String(value || '').trim());
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function readSubmission(options) {
  const attachment = options.getAttachment('ss', true);
  const opponent = clean(options.getString('lawan', true), 60);
  const score = parseScore(options.getString('skor', true));
  const outcome = options.getString('hasil', true);
  const game = options.getString('game') || 'MLBB';
  const note = clean(options.getString('catatan') || '', 300);
  if (!opponent || !score || !OUTCOME_LABEL[outcome] || !GAMES.includes(game)) throw new Error('SCRIM_FIELDS_INVALID');
  let url;
  try { url = new URL(attachment?.url); } catch { throw new Error('SCRIM_IMAGE_INVALID'); }
  if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname) || !IMAGE_TYPES.has(attachment.contentType)
    || !Number.isInteger(attachment.size) || attachment.size <= 0 || attachment.size > MAX_IMAGE) throw new Error('SCRIM_IMAGE_INVALID');
  return { opponent, score, outcome, game, note, image: { url: url.href, type: attachment.contentType } };
}

function card(draft, userId) {
  return [`🎮 **Hasil scrim ${draft.game}: ${OUTCOME_LABEL[draft.outcome]} ${draft.score[0]}-${draft.score[1]}**`,
    `Lawan: ${shown(draft.opponent)}`, `Dikirim oleh <@${userId}>`,
    draft.note ? `Catatan: ${shown(draft.note)}` : null].filter(Boolean).join('\n');
}

function createScrimResults({ store, fetchImpl = fetch, now = Date.now, logger = console } = {}) {
  const drafts = new Map();
  const busy = new Set();
  const keyFor = i => `${i.guildId}:${i.user?.id}`;
  function sweep() { for (const [key, draft] of drafts) if (now() >= draft.expires) drafts.delete(key); }
  const reply = (i, code) => i.reply({ content: MESSAGES[code] || MESSAGES.SCRIM_STALE, flags: MessageFlags.Ephemeral, ...quiet });

  // Re-read role, channel and permissions from Discord; names are the setup contract.
  async function destination(i) {
    if (!i.guild || i.guild.id !== i.guildId || !i.user?.id || i.user.bot) throw new Error('SCRIM_ACCESS');
    const role = await findTeamRole(i.guild);
    if (!role) throw new Error('SCRIM_ROLE_MISSING');
    const channel = findScrimChannel([...(await i.guild.channels.fetch()).values()]);
    if (!channel) throw new Error('SCRIM_CHANNEL_MISSING');
    const [member, me] = await Promise.all([i.guild.members.fetch({ user: i.user.id, force: true }), i.guild.members.fetchMe({ force: true })]);
    if (member?.id !== i.user.id || !member.roles?.cache?.has(role.id)) throw new Error('SCRIM_NOT_TEAM');
    if (!channel.permissionsFor(me)?.has(BOT_PERMISSIONS)) throw new Error('SCRIM_BOT_PERMISSIONS');
    return { role, channel };
  }

  async function download(image) {
    const response = await fetchImpl(image.url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    const type = String(response.headers?.get?.('content-type') || '').split(';')[0].trim();
    if (!response.ok || type !== image.type || Number(response.headers?.get?.('content-length') || 0) > MAX_IMAGE) throw new Error('SCRIM_IMAGE_INVALID');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE) throw new Error('SCRIM_IMAGE_INVALID');
    return buffer;
  }

  return {
    async preview(i, { guildAccess } = {}) {
      if (guildAccess?.classify(i.guildId)?.kind !== 'home') return reply(i, 'SCRIM_ACCESS');
      sweep();
      const key = keyFor(i);
      if (busy.has(key)) return reply(i, 'SCRIM_BUSY');
      if (drafts.size >= MAX_DRAFTS && !drafts.has(key)) return reply(i, 'SCRIM_LIMIT');
      drafts.delete(key);
      let submission;
      try {
        submission = readSubmission(i.options);
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const { channel } = await destination(i);
        const draft = { ...submission, id: crypto.randomBytes(12).toString('hex'), source: i.channelId,
          target: channel.id, expires: now() + TTL };
        drafts.set(key, draft);
        await i.editReply({ content: [card(draft, i.user.id), `Tujuan: <#${channel.id}>`,
          '-# Cuma kamu yang lihat. Hangus 10 menit. Belum dikirim.'].join('\n'),
          embeds: [{ image: { url: draft.image.url } }], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`${PREFIX}${draft.id}:send`).setLabel('Kirim ke hasil-scrim').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`${PREFIX}${draft.id}:cancel`).setLabel('Batal').setStyle(ButtonStyle.Secondary),
          )], ...quiet });
      } catch (error) {
        logger.error('[scrim] PREVIEW_FAILED');
        drafts.delete(key);
        const content = MESSAGES[error.message] || 'Preview hasil scrim belum bisa dibuat. Belum ada yang dikirim.';
        if (i.deferred || i.replied) await i.editReply({ content, embeds: [], components: [], ...quiet });
        else await i.reply({ content, flags: MessageFlags.Ephemeral, ...quiet });
      }
    },

    async handleButton(i) {
      if (!i.isButton?.() || !String(i.customId).startsWith(PREFIX)) return false;
      sweep();
      const key = keyFor(i);
      const match = /^hengs-scrim:([a-f0-9]{24}):(send|cancel)$/.exec(i.customId);
      const draft = drafts.get(key);
      if (!match || !draft || draft.id !== match[1] || draft.source !== i.channelId || busy.has(key)) {
        await reply(i, 'SCRIM_STALE');
        return true;
      }
      // Consume before awaiting Discord so a double click can never post twice.
      drafts.delete(key);
      busy.add(key);
      let dispatched = false;
      try {
        await i.deferUpdate();
        if (match[2] === 'cancel') {
          await i.editReply({ content: 'Dibatalkan. Tidak ada yang dikirim.', embeds: [], components: [], ...quiet });
          return true;
        }
        const { channel } = await destination(i);
        if (channel.id !== draft.target || now() >= draft.expires) throw new Error('SCRIM_STALE');
        const buffer = await download(draft.image);
        const nonce = BigInt(`0x${crypto.createHash('sha256').update(`${PREFIX}${i.id}:${draft.id}`).digest('hex').slice(0, 16)}`).toString();
        dispatched = true;
        const sent = await channel.send({ content: `${card(draft, i.user.id)}\n-# Dikirim lewat /scrim hasil`,
          files: [{ attachment: buffer, name: `hasil-scrim.${IMAGE_TYPES.get(draft.image.type)}` }],
          nonce, enforceNonce: true, ...quiet });
        try {
          store.add(i.guildId, { messageId: sent.id, at: now(), submitterId: i.user.id, game: draft.game,
            opponent: draft.opponent, score: draft.score, outcome: draft.outcome, note: draft.note });
        } catch {
          logger.error('[scrim] RECORD_FAILED');
          await i.editReply({ content: `Hasil scrim terkirim ke <#${channel.id}>, tapi datanya belum tersimpan untuk rekap. Kabari admin; tidak dicoba ulang otomatis.`, embeds: [], components: [], ...quiet });
          return true;
        }
        await i.editReply({ content: `Hasil scrim terkirim ke <#${channel.id}> dan tercatat untuk rekap tim.`, embeds: [], components: [], ...quiet });
      } catch (error) {
        logger.error('[scrim] SEND_FAILED');
        const content = dispatched ? 'Hasil kiriman belum bisa dipastikan. Cek hasil-scrim dulu; Hengs tidak mencoba ulang otomatis.'
          : MESSAGES[error.message] || 'Hasil scrim belum terkirim. Cek channel hasil-scrim; Hengs tidak mencoba ulang otomatis.';
        if (i.deferred || i.replied) await i.editReply({ content, embeds: [], components: [], ...quiet });
        else await i.reply({ content, flags: MessageFlags.Ephemeral, ...quiet });
      } finally { busy.delete(key); }
      return true;
    },
  };
}

module.exports = { PREFIX, ROLE_NAME, CHANNEL_NAME, CHANNEL_KEY, BOT_PERMISSIONS, MESSAGES,
  findTeamRole, findScrimChannel, parseScore, readSubmission, createScrimResults };
