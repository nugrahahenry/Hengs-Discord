'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const crypto = require('node:crypto');
const { createNewsStore, wibClock } = require('./store');
const { createFeedReader, SOURCES } = require('./feeds');
const { dueSlot } = require('./cadence');
const { digestPayload } = require('./presentation');
const { selectArticles } = require('./selection');
const { rankArticles, createTrendReader } = require('./trending');
const { DEFAULTS, HELP, NewsPromptError, parsePrompt, editSettings, describe, validSettings } = require('./prompts');
const { isGuildManager } = require('../prompt-assistant');

const TTL = 10 * 60_000;
const KINDS = Object.freeze(['news', 'meme']);
function createNewsService({ store = createNewsStore(), readFeeds = createFeedReader({ readTrends: createTrendReader() }),
  now = Date.now, guildAccess, logger = console, editArticles = async items => items, memeMaker = null } = {}) {
  const drafts = new Map();
  const busy = new Map();
  const delivering = new Set();
  let client; let timer; let ticking = false; let stopped = false;
  const keyFor = interaction => `${interaction.guildId}:${interaction.user.id}:${interaction.channelId}`;
  function active(guildId) { return ['home', 'public'].includes(guildAccess?.classify(guildId)?.kind); }
  function draftFor(interaction) {
    for (const [key, draft] of drafts) if (now() >= draft.expires) drafts.delete(key);
    return drafts.get(keyFor(interaction));
  }
  function put(interaction, draft) {
    if (drafts.size >= 100 && !drafts.has(keyFor(interaction))) drafts.delete(drafts.keys().next().value);
    drafts.set(keyFor(interaction), { ...draft, expires: now() + TTL });
  }
  async function target(guild, channelId) {
    if (!channelId) throw new Error('NEWS_CHANNEL_INVALID');
    const channel = await guild.channels.fetch(channelId);
    if (!channel || channel.id !== channelId || channel.guildId !== guild.id || channel.type !== ChannelType.GuildText) throw new Error('NEWS_CHANNEL_INVALID');
    const me = await guild.members.fetchMe();
    const permissions = channel.permissionsFor(me);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      throw new Error('NEWS_CHANNEL_PERMISSIONS');
    }
    return channel;
  }
  async function checkTargets(guild, settings) {
    await target(guild, settings.channelId);
    if (settings.memeChannelId) await target(guild, settings.memeChannelId);
  }
  function selected(settings, items, row) {
    return selectArticles(settings, items, row, now());
  }
  function ranked(result) {
    return rankArticles(result.items, { now: now(), trends: result.trends || [] });
  }
  function assertRevision(guildId, revision) {
    if (!active(guildId) || (store.get(guildId)?.revision || 0) !== revision) throw new Error('NEWS_PREVIEW_STALE');
  }
  async function assertManager(interaction) {
    if (interaction.guild.ownerId === interaction.user.id) return;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isGuildManager({ actor: { user: interaction.user, member }, guild: interaction.guild })) {
      throw new Error('NEWS_MANAGER_REQUIRED');
    }
  }
  function payloadFor(row, items) {
    return digestPayload({ ...row.settings, count: 1 }, items.slice(0, 1), now());
  }
  async function deliver(guild, row, items, expectedDay = wibClock(now()).day, assertLease = () => {}, slot = -1, kind = 'news') {
    const { day } = wibClock(now());
    const channel = await target(guild, kind === 'meme' ? row.settings.memeChannelId : row.settings.channelId);
    assertLease();
    assertRevision(guild.id, row.revision);
    if (stopped || expectedDay !== wibClock(now()).day) throw new Error('NEWS_STOPPED');
    if (slot >= 0 && dueSlot(row, now(), kind)?.slot !== slot) throw new Error('NEWS_SLOT_EXPIRED');
    const publisher = items[0]?.publisher || SOURCES.find(x => x.name === items[0]?.source && x.topic === items[0]?.topic)?.id || null;
    const claimed = store.claim(guild.id, row.revision, day, items.map(item => item.hash), 'claimed', slot, publisher, kind);
    delivering.add(guild.id);
    // Claim is durable before the external write. No automatic resend after an ambiguous outcome.
    try {
      try {
        const nonce = BigInt(`0x${crypto.createHash('sha256').update(`hengs-news:${guild.id}:${day}:${kind}:${slot}`).digest('hex').slice(0, 16)}`).toString();
        await channel.send({ ...payloadFor(row, items, kind), nonce, enforceNonce: true });
      } catch {
        store.finish(guild.id, claimed.revision, day, 'failed', slot, kind);
        throw new Error('NEWS_SEND_UNCERTAIN');
      }
      return store.finish(guild.id, claimed.revision, day, 'sent', slot, kind);
    } finally {
      delivering.delete(guild.id);
    }
  }
  async function handle(interaction, prompt) {
    const existing = draftFor(interaction);
    const request = parsePrompt(prompt, Boolean(existing));
    if (!request) return null;
    if (!active(interaction.guildId) || !isGuildManager({ actor: interaction, guild: interaction.guild })) {
      return { content: 'Hengs News hanya dapat diatur pemilik server atau Administrator melalui /hengs ask privat.' };
    }
    if (request.action === 'help') return { content: HELP };
    const key = keyFor(interaction);
    if (busy.has(key)) return { content: 'Preview berita masih diproses. Tunggu sebentar ya.' };
    if (busy.size >= 100) return { content: 'Antrean berita sedang penuh. Coba nanti ya.' };
    const lease = { cancelled: false };
    const assertLease = () => { if (lease.cancelled) throw new Error('NEWS_PREVIEW_STALE'); };
    busy.set(key, lease);
    try {
      const row = store.get(interaction.guildId);
      const draft = existing || { settings: structuredClone(row?.settings || DEFAULTS), revision: row?.revision || 0 };
      if (request.action === 'status') return { content: row
        ? `${describe(row.settings, row.enabled ? 'aktif' : 'jeda')}\nHasil terakhir: ${{ claimed: 'belum terkonfirmasi', sent: 'terkirim', empty: 'tidak ada berita baru', failed: 'gagal atau belum pasti', cancelled: 'dibatalkan' }[row.receipts.at(-1)?.status] || 'belum ada kiriman'}.\nKiriman uji hanya satu berita dan menutup sisa slot berita hari itu. Hasil tidak pasti tidak dicoba ulang otomatis.`
        : 'Hengs News belum diatur. Mulai dengan `atur berita teknologi AI ke #hengs-news`.' };
      if (request.action === 'pause') {
        await assertManager(interaction);
        assertLease();
        store.pause(interaction.guildId); drafts.delete(key);
        return { content: 'Jadwal berita dijeda. Kiriman yang sudah berangkat tidak bisa ditarik lewat jeda.' };
      }
      if (request.action === 'edit') {
        let settings;
        try { settings = editSettings(request.text, draft.settings, [...interaction.guild.channels.cache.values()]); }
        catch (error) { if (error instanceof NewsPromptError) return { content: error.message }; throw error; }
        put(interaction, { settings, revision: row?.revision || 0 });
        return { content: `${describe(settings)}\nBelum disimpan atau dikirim. Ketik preview berita untuk cek isinya.${row?.enabled ? '\nJadwal lama tetap aktif. Setelah preview, terapkan berita untuk edisi berikutnya; simpan berita justru menjeda.' : ''}` };
      }
      assertRevision(interaction.guildId, draft.revision);
      if (!validSettings(draft.settings)) return { content: 'Pilih channel tujuan dulu: `atur berita ke #hengs-news`. Channel harus sudah ada.' };
      if (request.action === 'preview') {
        if (existing?.previewAt && now() - existing.previewAt < 30_000) return { content: 'Preview barusan masih berlaku. Revisi draft jika perlu, atau tunggu 30 detik untuk memperbarui.' };
        await checkTargets(interaction.guild, draft.settings);
        const result = await readFeeds(draft.settings.topics);
        assertLease();
        assertRevision(interaction.guildId, draft.revision);
        const edited = await editArticles(selected(draft.settings, ranked(result), row), draft.settings);
        assertLease();
        assertRevision(interaction.guildId, draft.revision);
        if (stopped) throw new Error('NEWS_STOPPED');
        const items = selected(draft.settings, edited, row);
        put(interaction, { ...draft, items, previewAt: now(), approvedPreview: true });
        const revisionHelp = row?.tested && row.settings.channelId === draft.settings.channelId
          ? 'Ketik terapkan berita untuk menyimpan revisi tanpa uji kirim ulang. Status aktif/jeda tetap. Aktifkan berita menyalakan pengaturan tersimpan; simpan berita justru menjeda.'
          : 'Channel baru perlu kirim berita sekali untuk uji, lalu preview berita dan aktifkan berita. Simpan berita = jeda.';
        const content = `${describe(draft.settings, 'preview privat')}\n${items.length ? 'Ini contoh isi berdasarkan sumber yang tersedia sekarang. Uji kirim memakai kirim berita sekali (maksimal satu kiriman hari ini).' : 'Belum ada item baru yang cukup segar. Tidak akan mengarang atau mengirim digest kosong.'}\n${result.failures ? `${result.failures} sumber belum dapat dibaca. ` : ''}${revisionHelp}${row?.enabled ? '\nJadwal tersimpan masih aktif.' : ''}`;
        return items.length ? digestPayload(draft.settings, items, now(), content) : { content };
      }
      if (!existing?.approvedPreview || now() - existing.previewAt >= TTL) return { content: 'Buka `preview berita` terbaru dulu. Revisi atau restart membatalkan persetujuan lama.' };
      if (request.action === 'apply') {
        if (!row?.tested || row.settings.channelId !== draft.settings.channelId) return { content: 'Channel tujuan ini belum teruji. Lakukan uji lewat kirim berita sekali sebelum menerapkan revisi tanpa uji ulang. Jadwal lama tidak berubah.' };
        await checkTargets(interaction.guild, draft.settings);
        await assertManager(interaction);
        assertLease();
        assertRevision(interaction.guildId, draft.revision);
        if (stopped || now() - existing.previewAt >= TTL) throw new Error('NEWS_PREVIEW_STALE');
        if (delivering.has(interaction.guildId)) return { content: 'Kiriman sedang diselesaikan. Setelah selesai, buka preview berita lagi sebelum menerapkan revisi.' };
        const revised = store.revise(interaction.guildId, draft.revision, draft.settings);
        drafts.delete(key);
        return { content: `Revisi berita diterapkan. ${revised.enabled ? `Jadwal tetap aktif pukul ${revised.settings.time} WIB untuk edisi berikutnya.` : 'Jadwal tetap jeda. Untuk menyalakan: preview berita lalu aktifkan berita.'} Tidak ada kiriman sekarang; slot yang sudah dipakai hari ini tetap terpakai.` };
      }
      if (request.action === 'save') {
        await assertManager(interaction);
        assertLease();
        assertRevision(interaction.guildId, draft.revision);
        if (now() - existing.previewAt >= TTL) throw new Error('NEWS_PREVIEW_STALE');
        store.save(interaction.guildId, draft.revision, draft.settings); drafts.delete(key);
        return { content: 'Pengaturan berita disimpan dalam keadaan jeda. Buka preview berita lalu kirim berita sekali untuk uji.' };
      }
      if (request.action === 'enable') {
        if (!row || JSON.stringify(row.settings) !== JSON.stringify(draft.settings) || !row.tested) return { content: 'Uji dulu pengaturan ini lewat kirim berita sekali. Jadwal belum aktif.' };
        await checkTargets(interaction.guild, draft.settings);
        await assertManager(interaction);
        assertLease();
        assertRevision(interaction.guildId, draft.revision);
        if (now() - existing.previewAt >= TTL) throw new Error('NEWS_PREVIEW_STALE');
        store.enable(interaction.guildId, draft.revision); drafts.delete(key);
        return { content: `Jadwal berita aktif. ${describe(row.settings, 'aktif')}\nHari yang sudah ada kiriman uji tidak dikirim lagi. Pakai jeda berita kapan saja.` };
      }
      if (request.action === 'send') {
        const items = selected(draft.settings, existing.items || [], row);
        if (!items.length) return { content: 'Tidak ada item baru untuk dikirim. Coba preview berita saat sumber punya pembaruan.' };
        if (row?.receipts.some(x => x.day === wibClock(now()).day && x.kind === 'news')) return { content: 'Slot berita hari ini sudah dipakai, termasuk percobaan yang hasilnya tidak pasti. Tidak dikirim ulang.' };
        await checkTargets(interaction.guild, draft.settings);
        await assertManager(interaction);
        assertLease();
        assertRevision(interaction.guildId, draft.revision);
        if (now() - existing.previewAt >= TTL) throw new Error('NEWS_PREVIEW_STALE');
        drafts.delete(key);
        const saved = store.save(interaction.guildId, draft.revision, draft.settings);
        await deliver(interaction.guild, saved, items.slice(0, 1), wibClock(now()).day, assertLease);
        return { content: 'Kiriman uji berhasil. Jadwal masih jeda. Untuk mulai harian: preview berita, lalu aktifkan berita.' };
      }
      return { content: HELP };
    } catch (error) {
      logger.error('[news] NEWS_ACTION_FAILED');
      const messages = {
        NEWS_PREVIEW_STALE: 'Pengaturan berubah saat diproses. Mulai ulang dengan status berita lalu atur berita, supaya tidak memakai draft lama.',
        NEWS_MANAGER_REQUIRED: 'Aksi dihentikan karena izin pengelola sudah berubah. Tidak ada pengiriman baru dari permintaan ini.',
        NEWS_CHANNEL_INVALID: 'Tujuan harus channel teks biasa di server ini. Pilih channel yang masih tersedia.',
        NEWS_CHANNEL_PERMISSIONS: 'Hengs perlu izin melihat channel, mengirim pesan, dan menyematkan link di tujuan.',
        NEWS_SEND_UNCERTAIN: 'Pengiriman belum bisa dipastikan. Cek channel tujuan; tidak dicoba ulang otomatis hari ini.',
        NEWS_DAY_USED: 'Slot berita hari ini sudah dipakai. Tidak dikirim ulang.',
      };
      drafts.delete(key);
      return { content: messages[error.message] || 'Berita belum bisa diproses. Jadwal tidak diaktifkan oleh permintaan ini. Cek status berita; tidak ada percobaan ulang otomatis.' };
    } finally { busy.delete(key); }
  }
  async function newsFor(row) {
    const settings = { ...row.settings, count: 1 };
    const result = await readFeeds(settings.topics);
    assertRevision(row.guildId, row.revision);
    const items = selected(settings, ranked(result), row);
    if (!items.length) return { items, failures: result.failures };
    return { items: selected(settings, await editArticles(items, settings), row), failures: 0 };
  }
  async function memeFor(row) {
    const result = await readFeeds(['memes']);
    return { items: selected({ ...row.settings, topics: ['memes'], count: 1 }, result.items, row), failures: result.failures };
  }
  async function runSlot(row, kind) {
    const due = dueSlot(row, now(), kind);
    if (!due) return;
    const { day, slot } = due;
    try {
      if (kind === 'meme' && !row.settings.memeChannelId) {
        store.claim(row.guildId, row.revision, day, [], 'cancelled', slot, null, kind); return;
      }
      const guild = client.guilds.cache.get(row.guildId);
      if (!guild) return;
      const result = kind === 'news' ? await newsFor(row) : await memeFor(row, slot);
      assertRevision(row.guildId, row.revision);
      if (stopped || day !== wibClock(now()).day || dueSlot(row, now(), kind)?.slot !== slot) return;
      if (!result.items.length) {
        store.claim(row.guildId, row.revision, day, [], result.failures ? 'failed' : 'empty', slot, null, kind); return;
      }
      await deliver(guild, row, result.items, day, () => {}, slot, kind);
    } catch {
      logger.error('[news] NEWS_TICK_FAILED');
      // Pre-send failures also consume the slot; no repeated permission/network storm.
      const current = store.get(row.guildId);
      if (current?.revision === row.revision && dueSlot(current, now(), kind)?.slot === slot && day === wibClock(now()).day) {
        store.claim(row.guildId, row.revision, day, [], 'failed', slot, null, kind);
      }
    }
  }
  async function tick() {
    if (!client || ticking || stopped) return;
    ticking = true;
    try {
      for (const listed of store.list()) {
        if (stopped || !listed.enabled || !active(listed.guildId)) continue;
        for (const kind of KINDS) {
          // Re-read: a news send changes the revision before the meme slot runs.
          const row = store.get(listed.guildId);
          if (stopped || !row?.enabled) break;
          await runSlot(row, kind);
        }
      }
    } catch { logger.error('[news] NEWS_STATE_UNAVAILABLE'); }
    finally { ticking = false; }
  }
  return {
    handle, tick, getSettings: guildId => store.get(guildId),
    canHandle: (interaction, prompt) => Boolean(parsePrompt(prompt, Boolean(draftFor(interaction)))),
    clear(interaction) {
      const prefix = `${interaction.guildId}:${interaction.user.id}:`;
      for (const key of drafts.keys()) if (key.startsWith(prefix)) drafts.delete(key);
      for (const [key, lease] of busy) if (key.startsWith(prefix)) lease.cancelled = true;
    },
    start(discordClient) {
      if (timer) return;
      client = discordClient; stopped = false;
      timer = setInterval(() => { void tick(); }, 60_000); timer.unref?.();
    },
    stop() {
      stopped = true; clearInterval(timer); timer = null; drafts.clear();
      for (const lease of busy.values()) lease.cancelled = true;
    },
  };
}

module.exports = { createNewsService, digestPayload, TTL };
