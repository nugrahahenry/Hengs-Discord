'use strict';

const crypto = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const {
  BLUEPRINTS,
  buildCommunityPlanFromKeys,
} = require('./prompt-assistant');
const { channelInventoryFingerprint, visibleChannels } = require('./prompt-apply');

const SNOWFLAKE = /^\d{17,20}$/;
const TICKET_ID = /^[a-f0-9]{24}$/;
const CUSTOM_ID = /^hengs-prompt:(review|approve|apply|cancel):([a-f0-9]{24})$/;
const MAX_TICKETS = 100;
const MAX_CHANNELS = 500;
const TTL_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 10 * 1000;
const tickets = new Map();

function fixedPrivate(content) {
  return {
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function cleanup(now = Date.now()) {
  for (const [id, ticket] of tickets) {
    if (ticket.expiresAt <= now || ticket.terminal) tickets.delete(id);
  }
}

function visibleInventory(guild) {
  const entries = visibleChannels(guild);
  if (!entries || entries.length > MAX_CHANNELS) return null;
  return {
    fingerprint: channelInventoryFingerprint(guild),
    count: entries.length,
  };
}

function assertBlueprintKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > BLUEPRINTS.length) {
    throw new Error('PROMPT_REVIEW_BLUEPRINT_INVALID');
  }
  const allowed = new Set(BLUEPRINTS.map(blueprint => blueprint.key));
  const unique = [...new Set(keys.map(String))];
  if (unique.length !== keys.length || unique.some(key => !allowed.has(key))) {
    throw new Error('PROMPT_REVIEW_BLUEPRINT_INVALID');
  }
  return unique;
}

function makeComponents(ticket, stage = 'issued') {
  const buttons = [];
  if (stage === 'issued') {
    buttons.push(new ButtonBuilder()
      .setCustomId(`hengs-prompt:review:${ticket.id}`)
      .setLabel('Tinjau sekarang')
      .setStyle(ButtonStyle.Primary));
  } else if (stage === 'reviewed') {
    buttons.push(new ButtonBuilder()
      .setCustomId(`hengs-prompt:approve:${ticket.id}`)
      .setLabel('Konfirmasi rencana')
      .setStyle(ButtonStyle.Success));
  } else {
    buttons.push(new ButtonBuilder()
      .setCustomId(`hengs-prompt:apply:${ticket.id}`)
      .setLabel('Terapkan sekarang')
      .setStyle(ButtonStyle.Success));
  }
  buttons.push(new ButtonBuilder()
    .setCustomId(`hengs-prompt:cancel:${ticket.id}`)
    .setLabel('Batalkan')
    .setStyle(ButtonStyle.Secondary));
  return [new ActionRowBuilder().addComponents(buttons)];
}

function issueReview({ guild, guildId, channelId, requesterId, blueprintKeys, now = Date.now() } = {}) {
  cleanup(now);
  if (!SNOWFLAKE.test(String(guildId || ''))
    || !SNOWFLAKE.test(String(channelId || ''))
    || !SNOWFLAKE.test(String(requesterId || ''))) {
    return { ok: false, code: 'PROMPT_REVIEW_INVALID' };
  }
  if (tickets.size >= MAX_TICKETS) return { ok: false, code: 'PROMPT_REVIEW_BUSY' };
  const inventory = visibleInventory(guild);
  if (!inventory) return { ok: false, code: 'PROMPT_REVIEW_UNAVAILABLE' };
  let keys;
  try {
    keys = assertBlueprintKeys(blueprintKeys);
  } catch {
    return { ok: false, code: 'PROMPT_REVIEW_INVALID' };
  }
  const recent = [...tickets.values()].find(ticket => (
    ticket.requesterId === requesterId && ticket.guildId === guildId && ticket.createdAt + COOLDOWN_MS > now
  ));
  if (recent) return { ok: false, code: 'PROMPT_REVIEW_COOLDOWN' };
  let id;
  do id = crypto.randomBytes(12).toString('hex'); while (tickets.has(id));
  const ticket = {
    id,
    guildId: String(guildId),
    channelId: String(channelId),
    requesterId: String(requesterId),
    blueprintKeys: keys,
    fingerprint: inventory.fingerprint,
    createdAt: now,
    expiresAt: now + TTL_MS,
    terminal: false,
    stage: 'issued',
    messageId: null,
  };
  tickets.set(id, ticket);
  return {
    ok: true,
    ticket,
    components: makeComponents(ticket, 'issued'),
  };
}

function getTicket(id, now = Date.now()) {
  cleanup(now);
  return TICKET_ID.test(String(id || '')) ? tickets.get(id) || null : null;
}

function isOwner(interaction, guild) {
  return String(interaction?.user?.id || '') === String(guild?.ownerId || '');
}

function isRequester(interaction, ticket) {
  return String(interaction?.user?.id || '') === ticket.requesterId;
}

async function handleComponent(interaction, {
  guildAccess,
  botUserId,
  applyPlan,
  now = Date.now(),
  logger = console,
} = {}) {
  if (!interaction?.isButton?.()) return false;
  const match = String(interaction.customId || '').match(CUSTOM_ID);
  if (!match) return false;
  const [, action, id] = match;
  const fail = async (content) => {
    await interaction.reply(fixedPrivate(content)).catch(() => {});
  };
  if (!interaction.inGuild?.() || !interaction.guildId || !guildAccess) {
    await fail('Preview ini hanya tersedia di server yang sama.');
    return true;
  }
  if (String(interaction.message?.author?.id || '') !== String(botUserId || '')) {
    await fail('Preview ini tidak dikenali.');
    return true;
  }
  const ticket = getTicket(id, now);
  if (!ticket || ticket.guildId !== String(interaction.guildId)
    || ticket.channelId !== String(interaction.channelId || '')) {
    await fail('Preview ini sudah kedaluwarsa. Buat rancangan baru dari prompt.');
    return true;
  }
  const scope = guildAccess.classify(interaction.guildId);
  if (scope.kind !== 'home') {
    await fail('Preview ini hanya berlaku di server utama Hengs.');
    return true;
  }
  if (action !== 'cancel' && !isRequester(interaction, ticket)) {
    await fail('Preview ini hanya bisa dibuka oleh orang yang memintanya.');
    return true;
  }
  if ((action === 'approve' || action === 'apply') && !isOwner(interaction, interaction.guild)) {
    await fail('Konfirmasi rencana hanya bisa dilakukan owner. Belum ada perubahan yang diterapkan.');
    return true;
  }
  if (action === 'cancel') {
    if (!isRequester(interaction, ticket) && !isOwner(interaction, interaction.guild)) {
      await fail('Preview ini hanya bisa dibatalkan requester atau owner.');
      return true;
    }
    ticket.terminal = true;
    tickets.delete(ticket.id);
    await interaction.update({ content: 'Preview dibatalkan. Belum ada perubahan pada server.', components: [], allowedMentions: { parse: [] } }).catch(() => {});
    return true;
  }

  const inventory = visibleInventory(interaction.guild);
  if (!inventory || inventory.fingerprint !== ticket.fingerprint) {
    tickets.delete(ticket.id);
    await fail('Struktur server berubah atau tidak bisa dibaca. Preview lama ditutup, silakan buat rancangan baru.');
    return true;
  }
  if (action === 'review') {
    ticket.stage = 'reviewed';
    await interaction.update({
      content: `${buildCommunityPlanFromKeys(ticket.blueprintKeys, interaction.guild)}\n\nReview privat aktif. Belum ada yang diterapkan.`,
      components: makeComponents(ticket, 'reviewed'),
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return true;
  }
  if (action === 'approve') {
    if (ticket.stage !== 'reviewed') {
      await fail('Review privat belum dibuka. Tekan Tinjau sekarang terlebih dahulu.');
      return true;
    }
    ticket.stage = 'approved';
    await interaction.update({
      content: 'Rencana dikonfirmasi owner. Belum ada perubahan. Jika sudah siap, tekan **Terapkan sekarang** untuk membuat channel yang masih kurang.',
      components: makeComponents(ticket, 'approved'),
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return true;
  }
  if (action === 'apply') {
    if (ticket.stage !== 'approved') {
      await fail('Rencana belum dikonfirmasi. Tinjau lalu konfirmasi dulu.');
      return true;
    }
    if (typeof applyPlan !== 'function') {
      await fail('Penerapan belum tersedia di runtime ini. Belum ada perubahan pada server.');
      return true;
    }
    let result;
    try {
      result = await applyPlan({
        guild: interaction.guild,
        blueprintKeys: ticket.blueprintKeys,
        expectedFingerprint: ticket.fingerprint,
      });
    } catch {
      logger.error('[prompt-review] PROMPT_APPLY_FAILED');
      result = { ok: false, code: 'PROMPT_APPLY_FAILED' };
    }
    ticket.terminal = true;
    tickets.delete(ticket.id);
    if (!result?.ok) {
      await interaction.update({
        content: 'Penerapan belum selesai. Preview ini ditutup dan tidak akan dicoba ulang otomatis. Buat preview baru setelah kondisi server siap.',
        components: [],
        allowedMentions: { parse: [] },
      }).catch(() => {});
      return true;
    }
    const createdCount = Number.isSafeInteger(result.createdCount) && result.createdCount >= 0
      ? result.createdCount
      : 0;
    await interaction.update({
      content: createdCount > 0
        ? `Selesai. ${createdCount} channel dibuat sesuai blueprint. Tidak ada role, permission, rename, delete, atau pesan yang diubah.`
        : 'Selesai. Semua channel pada blueprint sudah tersedia. Tidak ada perubahan lain yang dilakukan.',
      components: [],
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return true;
  }
  logger.error('[prompt-review] PROMPT_REVIEW_ACTION_INVALID');
  await fail('Aksi preview tidak dikenali.');
  return true;
}

function resetForTests() {
  tickets.clear();
}

module.exports = {
  MAX_TICKETS,
  MAX_CHANNELS,
  TTL_MS,
  issueReview,
  getTicket,
  handleComponent,
  resetForTests,
  visibleInventory,
};
