'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const { isPublicChannelAllowed } = require('../guilds/public-channel-policy');
const { safeVerdict, imageKind } = require('./memes');

const PREFIX = 'hengs-share:';
const TTL = 10 * 60_000;
const GAP = 60_000;
const MAX = 100;
const IMAGE_TYPES = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']]);
const IMAGE_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const MAX_IMAGE = 8 * 1024 * 1024;
const safe = content => ({ content, components: [], allowedMentions: { parse: [], repliedUser: false }, flags: MessageFlags.SuppressEmbeds });
const literal = text => String(text).replace(/[\u0000-\u0008\u000b-\u001f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
  .replace(/@/g, '@\u200b').replace(/([\\`*_~|>\[\]])/g, '\\$1');
const GUIDE = 'Channel news dan memes cuma Hengs yang posting. Kirim meme lewat `/kirim meme` (lampirkan gambarnya) atau berita lewat `/kirim berita` di tanya-hengs, atau pakai `/hengs ask` → `bagikan joke: teksmu`. Hengs menampilkan preview; kamu sendiri yang konfirmasi. Gambar dicek otomatis; isi kiriman bukan verifikasi Hengs.';

function parseShare(prompt) {
  const text = String(prompt || '').trim();
  const match = /^(?:(?:tolong|coba)\s+)?(?:bagikan|kirim|share|ajukan)\s+(berita|news|memes?|jokes?|lelucon)\s*:\s*([\s\S]*)$/i.exec(text);
  if (!match) return null;
  return { kind: /^(berita|news)$/i.test(match[1]) ? 'news' : /^meme/i.test(match[1]) ? 'meme' : 'joke', body: match[2].trim() };
}

function publicLink(value) {
  if (value.length > 1000 || /[\s\\<>"`]/.test(value)) throw new Error('SHARE_LINK_INVALID');
  let url;
  try { url = new URL(value); } catch { throw new Error('SHARE_LINK_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || net.isIP(url.hostname)
    || !url.hostname.includes('.') || /(?:^|\.)(localhost|local|internal|invalid|test)$/.test(url.hostname)
    || /[\[\]]/.test(url.hostname) || url.href.length > 1000) throw new Error('SHARE_LINK_INVALID');
  // Links are displayed with embeds suppressed, never fetched by Hengs or sent to its LLM.
  return url.href;
}

function attachedImage(attachment) {
  let url;
  try { url = new URL(attachment?.url); } catch { throw new Error('SHARE_IMAGE_INVALID'); }
  if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname) || !IMAGE_TYPES.has(attachment.contentType)
    || !Number.isInteger(attachment.size) || attachment.size <= 0 || attachment.size > MAX_IMAGE) throw new Error('SHARE_IMAGE_INVALID');
  return { url: url.href, type: attachment.contentType };
}

const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

function createCommunitySharing({ getSettings, guildAccess, reviewImage = null, fetchImpl = fetch, now = Date.now, logger = console } = {}) {
  const drafts = new Map(); const busy = new Set(); const cooldowns = new Map();
  const leases = new Map(); const sendingGuilds = new Set();
  let stopped = false;
  const keyFor = i => `${i.guildId}:${i.user.id}`;
  function sweep() {
    for (const [key, row] of drafts) if (now() >= row.expires) drafts.delete(key);
    for (const [key, until] of cooldowns) if (now() >= until) cooldowns.delete(key);
  }
  function rowFor(i) {
    const scope = guildAccess?.classify(i.guildId);
    if (!['home', 'public'].includes(scope?.kind) || !i.guild || i.guild.id !== i.guildId || !i.user?.id || i.user.bot) throw new Error('SHARE_ACCESS_DENIED');
    const row = getSettings(i.guildId);
    if (!row) throw new Error('SHARE_ROUTE_MISSING');
    return { row, scope };
  }
  // The destination may be read-only for members: they only need to see it. Hengs posts there.
  async function checked(i, kind, expected, { files = false } = {}) {
    const { row, scope } = rowFor(i);
    const destinationId = kind === 'news' ? row.settings.channelId : row.settings.memeChannelId;
    if (!destinationId) throw new Error('SHARE_ROUTE_MISSING');
    if (expected && (expected.revision !== row.revision || expected.target !== destinationId || expected.source !== i.channelId)) throw new Error('SHARE_STALE');
    const [source, target, member, me] = await Promise.all([
      i.guild.channels.fetch(i.channelId), i.guild.channels.fetch(destinationId),
      i.guild.members.fetch({ user: i.user.id, force: true }), i.guild.members.fetchMe({ force: true }),
    ]);
    const homeCommand = process.env.BOT_CHANNEL_ID
      ? source?.id === process.env.BOT_CHANNEL_ID : /(?:^|[・│|\s])(?:tanya-hengs|bot-commands)$/u.test(source?.name || '');
    const intake = scope.kind === 'home' ? homeCommand : isPublicChannelAllowed(scope.config, i.channelId);
    if (!intake || source?.id !== i.channelId || target?.id !== destinationId || source?.id === target?.id
      || [source, target].some(c => !c || c.guildId !== i.guildId || c.type !== ChannelType.GuildText)
      || member?.id !== i.user.id || member.user?.bot || member.pending
      || (member.communicationDisabledUntilTimestamp || 0) > now()
      || !source.permissionsFor(member)?.has([P.ViewChannel, P.SendMessages, P.ReadMessageHistory])
      || !target.permissionsFor(member)?.has([P.ViewChannel])
      || !source.permissionsFor(me)?.has([P.ViewChannel, P.ReadMessageHistory])
      || !target.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, ...(files ? [P.AttachFiles] : [])])) throw new Error('SHARE_ACCESS_DENIED');
    // Relaying must not bypass Discord's per-member native slowmode clock.
    if ((target.rateLimitPerUser || 0) > 0) throw new Error('SHARE_SLOWMODE');
    return { row, target, source, member };
  }
  async function sourceProof(i, body, source) {
    const match = /^https:\/\/discord\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})$/.exec(body);
    if (!match || match[1] !== i.guildId || match[2] !== source.id) throw new Error('SHARE_MESSAGE_INVALID');
    const message = await source.messages.fetch({ message: match[3], cache: false, force: true });
    const attachments = [...(message?.attachments?.values?.() || [])];
    if (message?.id !== match[3] || message.guildId !== i.guildId || message.channelId !== source.id
      || message.author?.id !== i.user.id || message.author.bot || message.webhookId
      || attachments.length !== 1 || !/^image\/(png|jpeg|webp|gif)$/.test(attachments[0].contentType || '')
      || !Number.isInteger(attachments[0].size) || attachments[0].size <= 0 || attachments[0].size > 8 * 1024 * 1024
      || !/^https:\/\/cdn\.discordapp\.com\/attachments\/\d+\/\d+\/[^\s]+$/.test(attachments[0].url || '')) throw new Error('SHARE_MESSAGE_INVALID');
    return crypto.createHash('sha256').update(JSON.stringify([message.id, message.content,
      attachments.map(a => [a.id, a.size, a.contentType])])).digest('hex');
  }
  // The bytes must really be the declared PNG, JPG or WebP: the vision check and the post use exactly these.
  async function download(image) {
    const response = await fetchImpl(image.url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    const type = String(response.headers?.get?.('content-type') || '').split(';')[0].trim();
    if (!response.ok || type !== image.type || Number(response.headers?.get?.('content-length') || 0) > MAX_IMAGE) throw new Error('SHARE_IMAGE_INVALID');
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length || data.length > MAX_IMAGE || imageKind(data) !== IMAGE_TYPES.get(image.type)) throw new Error('SHARE_IMAGE_INVALID');
    return data;
  }
  const buttons = draft => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}${draft.ticketId}:send`).setLabel('Kirim kirimanku').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${PREFIX}${draft.ticketId}:cancel`).setLabel('Batal').setStyle(ButtonStyle.Secondary),
  );
  function failure(error) {
    const messages = {
      SHARE_ACCESS_DENIED: 'Kamu perlu bisa melihat channel tujuan dan mengirim di channel ini, dan tidak sedang timeout.',
      SHARE_ROUTE_MISSING: 'Tujuan belum diatur. Minta pemilik server memilih channel news dan meme dulu.',
      SHARE_STALE: 'Preview sudah berubah, kedaluwarsa atau tidak cocok. Buat preview baru; belum dikirim.',
      SHARE_LINK_INVALID: 'Berita perlu satu link HTTPS publik. Hengs tidak membuka link atau menjamin isinya aman.',
      SHARE_MESSAGE_INVALID: 'Pakai link pesan Discord milikmu di channel ini, dengan satu gambar PNG/JPG/WebP/GIF maksimal 8 MB. Lebih gampang: /kirim meme lalu lampirkan gambarnya.',
      SHARE_IMAGE_INVALID: 'Meme harus gambar PNG, JPG atau WebP, maksimal 8 MB.',
      SHARE_IMAGE_REJECTED: 'Gambar ini tidak lolos cek otomatis untuk komunitas umum, jadi tidak dikirim.',
      SHARE_REVIEW_UNAVAILABLE: 'Gambar belum bisa dicek otomatis sekarang, jadi meme belum dikirim. Coba lagi nanti.',
      SHARE_BUSY: 'Tunggu sebentar, ada kiriman yang diproses atau jeda antikiriman belum selesai.',
      SHARE_LIMIT: 'Sesi berbagi sedang penuh. Coba lagi beberapa menit lagi.',
      SHARE_SLOWMODE: 'Channel tujuan memakai slowmode, jadi Hengs tidak meneruskan kiriman ke sana.',
    };
    return safe(messages[error.message] || 'Kiriman belum bisa disiapkan. Tidak ada yang dikirim; coba lagi nanti.');
  }
  return {
    canHandle: prompt => Boolean(parseShare(prompt)),
    async handle(i, prompt) {
      const request = parseShare(prompt);
      if (!request) return null;
      sweep(); const key = keyFor(i);
      if (stopped || busy.has(key)) return failure(new Error('SHARE_BUSY'));
      if (busy.size >= MAX || (drafts.size >= MAX && !drafts.has(key))) return failure(new Error('SHARE_LIMIT'));
      busy.add(key); drafts.delete(key);
      const draft = { source: i.channelId, kind: request.kind, body: request.body,
        ticketId: crypto.randomBytes(12).toString('hex'), expires: now() + TTL };
      drafts.set(key, draft);
      leases.set(key, draft);
      try {
        if (!draft.body || draft.body.length > 1400) return safe('Isi kiriman perlu 1 sampai 1400 karakter. ' + GUIDE);
        const { row, target, source } = await checked(i, draft.kind);
        if (draft.kind === 'news') draft.body = publicLink(draft.body);
        if (draft.kind === 'meme') draft.proof = await sourceProof(i, draft.body, source);
        if (draft.kind === 'joke' && /https?:\/\/|<@|@everyone|@here/i.test(draft.body)) return safe('Joke memakai teks saja, tanpa link atau mention.');
        if (literal(draft.body).length > 1400) return safe('Teks setelah diformat terlalu panjang. Pendekkan dulu supaya preview dan kiriman tetap terbaca.');
        if (stopped || draft.cancelled || drafts.get(key) !== draft || now() >= draft.expires) throw new Error('SHARE_STALE');
        const current = rowFor(i).row;
        if (current.revision !== row.revision) throw new Error('SHARE_STALE');
        draft.revision = row.revision; draft.target = target.id; draft.ready = true;
        const content = `**Preview kiriman komunitas**\nTujuan: <#${target.id}>\nJenis: ${draft.kind === 'news' ? 'berita' : draft.kind}\n\n${literal(draft.body)}\n\n${draft.kind === 'meme' ? 'Yang diteruskan adalah link pesanmu, bukan salinan gambar. ' : ''}Dicantumkan sebagai kirimanmu, bukan hasil verifikasi Hengs. Belum dikirim.`;
        return { ...safe(content), components: [buttons(draft)] };
      } catch (error) { logger.error('[community-share] PREVIEW_FAILED'); return failure(error); }
      finally { busy.delete(key); leases.delete(key); if (!draft.ready && drafts.get(key) === draft) drafts.delete(key); }
    },
    // /kirim meme|berita: the same private preview and own confirmation, but a meme is the image itself.
    // Hengs checks it with the vision model now and later posts only those exact bytes.
    async submit(i) {
      sweep(); const key = keyFor(i);
      if (stopped || busy.has(key)) return failure(new Error('SHARE_BUSY'));
      if (busy.size >= MAX || (drafts.size >= MAX && !drafts.has(key))) return failure(new Error('SHARE_LIMIT'));
      busy.add(key); drafts.delete(key);
      const kind = i.options?.getSubcommand?.() === 'berita' ? 'news' : 'meme';
      const draft = { source: i.channelId, kind, ticketId: crypto.randomBytes(12).toString('hex'), expires: now() + TTL,
        note: String(i.options?.getString?.(kind === 'news' ? 'catatan' : 'caption') || '').replace(/\s+/g, ' ').trim().slice(0, 300) };
      drafts.set(key, draft);
      leases.set(key, draft);
      try {
        const { row, target } = await checked(i, kind, null, { files: kind === 'meme' });
        if (kind === 'news') draft.body = publicLink(String(i.options.getString('link') || '').trim());
        else {
          draft.image = attachedImage(i.options.getAttachment('gambar'));
          if (!reviewImage) throw new Error('SHARE_REVIEW_UNAVAILABLE');
          const data = await download(draft.image);
          let verdict;
          try { verdict = await reviewImage({ data, type: draft.image.type }, { signal: AbortSignal.timeout(20_000) }); }
          catch { throw new Error('SHARE_REVIEW_UNAVAILABLE'); }
          if (!safeVerdict(verdict)) throw new Error('SHARE_IMAGE_REJECTED');
          draft.hash = sha256(data);
        }
        if (stopped || draft.cancelled || drafts.get(key) !== draft || now() >= draft.expires) throw new Error('SHARE_STALE');
        if (rowFor(i).row.revision !== row.revision) throw new Error('SHARE_STALE');
        draft.revision = row.revision; draft.target = target.id; draft.ready = true;
        const content = ['**Preview kiriman komunitas**', `Tujuan: <#${target.id}>`, `Jenis: ${kind === 'news' ? 'berita' : 'meme'}`,
          [kind === 'news' ? literal(draft.body) : '', draft.note ? literal(draft.note) : ''].filter(Boolean).join('\n'),
          `Dicantumkan sebagai kirimanmu${kind === 'meme' ? ', gambarnya lolos cek otomatis' : ''}, bukan hasil verifikasi Hengs. Belum dikirim.`]
          .filter(Boolean).join('\n\n');
        // A meme preview shows the picture, so it skips the embed suppression the link preview uses.
        const preview = kind === 'meme' ? { content, embeds: [{ image: { url: draft.image.url } }], allowedMentions: { parse: [], repliedUser: false } }
          : safe(content);
        return { ...preview, components: [buttons(draft)] };
      } catch (error) { logger.error('[community-share] PREVIEW_FAILED'); return failure(error); }
      finally { busy.delete(key); leases.delete(key); if (!draft.ready && drafts.get(key) === draft) drafts.delete(key); }
    },
    async handleButton(i) {
      if (!i.isButton?.() || !String(i.customId).startsWith(PREFIX)) return false;
      sweep(); const key = keyFor(i);
      const match = /^hengs-share:([a-f0-9]{24}):(send|cancel)$/.exec(i.customId);
      const draft = drafts.get(key);
      if (!match || !draft?.ready || draft.ticketId !== match[1] || draft.source !== i.channelId || stopped || busy.has(key)) {
        await i.reply({ ...failure(new Error('SHARE_STALE')), flags: MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds }); return true;
      }
      if (busy.size >= MAX) {
        await i.reply({ ...failure(new Error('SHARE_LIMIT')), flags: MessageFlags.Ephemeral }); return true;
      }
      // Consume before awaiting Discord, so duplicate buttons can never send twice.
      drafts.delete(key); busy.add(key); leases.set(key, draft); let dispatched = false; let ownsGuild = false;
      try {
        await i.deferUpdate();
        if (match[2] === 'cancel') { await i.editReply(safe('Dibatalkan. Tidak ada kiriman baru.')); return true; }
        const files = { files: Boolean(draft.image) };
        const { source } = await checked(i, draft.kind, draft, files);
        if (draft.kind === 'meme' && !draft.image && draft.proof !== await sourceProof(i, draft.body, source)) throw new Error('SHARE_STALE');
        // The image on Discord must still be the one the vision check saw.
        const data = draft.image ? await download(draft.image) : null;
        if (data && sha256(data) !== draft.hash) throw new Error('SHARE_STALE');
        const { row, target } = await checked(i, draft.kind, draft, files);
        if (stopped || draft.cancelled || now() >= draft.expires || rowFor(i).row.revision !== row.revision) throw new Error('SHARE_STALE');
        const guildKey = `guild:${i.guildId}`;
        if (sendingGuilds.has(i.guildId) || (cooldowns.get(key) || 0) > now() || (cooldowns.get(guildKey) || 0) > now()) throw new Error('SHARE_BUSY');
        const addedKeys = Number(!cooldowns.has(key)) + Number(!cooldowns.has(guildKey));
        if (cooldowns.size + addedKeys > 2 * MAX) throw new Error('SHARE_LIMIT');
        cooldowns.set(key, now() + GAP);
        cooldowns.set(guildKey, now() + Math.max(GAP, (target.rateLimitPerUser || 0) * 1000));
        const label = draft.kind === 'news' ? 'Berita dari anggota' : draft.kind === 'meme' ? 'Meme dari anggota' : 'Joke dari anggota';
        const text = [draft.kind === 'joke' ? literal(draft.body) : draft.image ? '' : `<${draft.body}>`,
          draft.note ? `${draft.kind === 'news' ? 'Catatan: ' : ''}${literal(draft.note)}` : ''].filter(Boolean).join('\n');
        const payload = safe([`**${label}**\nDibagikan oleh <@${i.user.id}>`, text,
          '-# Kiriman komunitas, bukan verifikasi fakta atau keamanan dari Hengs.'].filter(Boolean).join('\n\n'));
        if (data) payload.files = [{ attachment: data, name: `meme-anggota.${IMAGE_TYPES.get(draft.image.type)}` }];
        const nonce = BigInt(`0x${crypto.createHash('sha256').update(`hengs-share:${i.id}:${draft.ticketId}`).digest('hex').slice(0, 16)}`).toString();
        sendingGuilds.add(i.guildId); ownsGuild = true;
        dispatched = true;
        await target.send({ ...payload, nonce, enforceNonce: true });
        await i.editReply(safe(`Kirimanmu sudah masuk ke <#${target.id}>. Tidak ada anggota yang diping.`));
      } catch (error) {
        logger.error('[community-share] SEND_FAILED');
        const payload = dispatched ? safe('Hasil kiriman belum bisa dipastikan. Cek channel tujuan dulu. Hengs tidak mencoba ulang otomatis.') : failure(error);
        if (i.deferred || i.replied) await i.editReply(payload);
        else await i.reply({ ...payload, flags: MessageFlags.Ephemeral });
      } finally { busy.delete(key); leases.delete(key); if (ownsGuild) sendingGuilds.delete(i.guildId); }
      return true;
    },
    clear(i) { drafts.delete(keyFor(i)); const lease = leases.get(keyFor(i)); if (lease) lease.cancelled = true; },
    stop() { stopped = true; drafts.clear(); for (const lease of leases.values()) lease.cancelled = true; },
  };
}

module.exports = { createCommunitySharing, parseShare, publicLink, GUIDE, PREFIX, TTL };
