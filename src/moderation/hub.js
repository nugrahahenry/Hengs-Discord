const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const policy = require('./policy');
const { createTracker } = require('./tracker');
const store = require('./store');
const { enforceIncident } = require('./enforcer');

const INCIDENT_ID = /^[a-f0-9]{16}$/;
const DISCORD_ID = /^\d{15,22}$/;
const MAX_QUEUE_ITEMS = 10;
const MAX_DISPLAY_COUNT = 9_999;
const MAX_DISPLAY_AGE_DAYS = 365;
const MAX_ALLOWLIST_VALUES = 10;
const MAX_EMBED_FIELD_VALUE = 1_024;
const MAX_PAGE = 49;
const MAX_TRACKED_MESSAGES = 2_000;
const TRACKED_MESSAGE_TTL_MS = 120_000;
const DEFAULT_PANEL_RETRY_DELAY_MS = 30_000;
const FINAL_STATUSES = new Set(['banned', 'monitor', 'partial', 'failed']);
const MODES = new Set(['active', 'monitor', 'off']);

const tracker = createTracker();
const trackedMessages = new Map();
const incidentFlights = new Map();
const panelFlights = new Map();
let panelRetryTimer = null;
let trackedMessageExpiryTimer = null;
let maintenanceClient = null;
let maintenanceOptions = {};

function allowedMentions() {
  return { parse: [] };
}

function incidentMarker(incidentId) {
  return `Hengs Anti-Raid | Incident ID: ${incidentId}`;
}

function boundedPage(requestedPage, totalPages) {
  const page = Number.isSafeInteger(requestedPage) ? requestedPage : 0;
  return Math.max(0, Math.min(page, totalPages - 1));
}

function statusLabel(status) {
  return {
    detected: 'Terdeteksi',
    enforcing: 'Sedang diproses',
    banned: 'Diblokir',
    monitor: 'Dipantau',
    partial: 'Tindakan sebagian',
    failed: 'Perlu tindak lanjut',
  }[status] || 'Tidak diketahui';
}

function triggerLabel(trigger) {
  return {
    BLOCKED_DOMAIN: 'Domain diblokir',
    CROSS_CHANNEL_ATTACHMENT_FLOOD: 'Lampiran lintas kanal',
    CROSS_CHANNEL_REPEAT: 'Pesan berulang lintas kanal',
    SINGLE_CHANNEL_BURST: 'Lonjakan satu kanal',
  }[trigger] || 'Deteksi moderasi';
}

function issueLabel(code) {
  return {
    MOD_LOG_PUBLIC: 'Kanal log tidak privat',
    MOD_LOG_UNAVAILABLE: 'Izin kanal log tidak lengkap',
    BAN_MEMBERS_MISSING: 'Izin ban tidak tersedia',
    MANAGE_MESSAGES_MISSING: 'Izin hapus pesan tidak tersedia',
    TARGET_UNBANNABLE: 'Target tidak dapat ditindak',
    POLICY_INVALID: 'Konfigurasi mode tidak valid',
    BAN_FAILED: 'Ban gagal',
    DELETE_FAILED: 'Penghapusan gagal',
    BAN_AND_DELETE_FAILED: 'Ban dan penghapusan gagal',
    PREREQUISITES_CHANGED: 'Prasyarat berubah',
    NOT_BANNED: 'Target tidak terdeteksi diblokir',
  }[code] || null;
}

function incidentColor(status) {
  if (status === 'banned') return 0xED4245;
  if (status === 'monitor') return 0xFEE75C;
  if (status === 'partial') return 0xF0B232;
  return 0x5865F2;
}

function safeDate(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function incidentDescription(status) {
  return {
    detected: 'Hengs mendeteksi pola yang cocok dan sedang menyiapkan tindakan.',
    enforcing: 'Hengs sedang menjalankan tindakan Anti-Raid untuk insiden ini.',
    banned: 'Hengs menyelesaikan tindakan Anti-Raid dan memblokir member yang terlibat.',
    monitor: 'Hengs mencatat pola ini tanpa menghapus pesan atau memblokir member.',
    partial: 'Hengs belum dapat menyelesaikan seluruh tindakan. Periksa insiden ini sebelum mengambil tindakan manual.',
    failed: 'Hengs belum dapat menyelesaikan seluruh tindakan. Periksa insiden ini sebelum mengambil tindakan manual.',
  }[status] || '';
}

function buildIncidentCard(incident = {}) {
  const id = INCIDENT_ID.test(String(incident.id || '')) ? incident.id : '0000000000000000';
  const fields = [
    { name: 'Status', value: statusLabel(incident.status), inline: true },
    { name: 'Member', value: `\`${DISCORD_ID.test(String(incident.memberId || '')) ? incident.memberId : '-'}\``, inline: true },
    { name: 'ID', value: `\`${id}\``, inline: true },
    { name: 'Pemicu', value: triggerLabel(incident.trigger), inline: true },
    { name: 'Pesan terpantau', value: String(Math.max(0, Number(incident.messageCount) || 0)), inline: true },
    { name: 'Kanal terpantau', value: String(Math.max(0, Number(incident.channelCount) || 0)), inline: true },
  ];
  const outcome = issueLabel(incident.result?.issueCode);
  if (incident.status === 'monitor') {
    fields.push({ name: 'Penegakan', value: 'Tidak dijalankan karena insiden ini dicatat dalam mode Monitor.', inline: false });
  } else if (incident.result && ['banned', 'partial', 'failed'].includes(incident.status)) {
    fields.push(
      { name: 'Ban berhasil', value: incident.result.banSucceeded ? 'Ya' : 'Tidak', inline: true },
      { name: 'Penghapusan berhasil', value: incident.result.deletionSucceeded ? 'Ya' : 'Tidak', inline: true },
    );
  }
  if (outcome) fields.push({ name: 'Catatan sistem', value: outcome, inline: false });
  if (incident.status === 'partial' || incident.status === 'failed') {
    fields.push({ name: 'Langkah berikutnya', value: 'Periksa insiden ini sebelum mengambil tindakan manual.', inline: false });
  }

  const embed = new EmbedBuilder()
    .setColor(incidentColor(incident.status))
    .setTitle(`Anti-Raid | ${statusLabel(incident.status)}`)
    .setDescription(incidentDescription(incident.status))
    .addFields(fields)
    .setFooter({ text: incidentMarker(id) });
  const createdAt = safeDate(incident.createdAt);
  if (createdAt) embed.setTimestamp(createdAt);

  return {
    embeds: [embed],
    components: [],
    allowedMentions: allowedMentions(),
  };
}

function buildIncidentPreview() {
  const embed = new EmbedBuilder()
    .setColor(0xF0B232)
    .setTitle('Pratinjau | Tindakan sebagian')
    .setDescription('Pratinjau ini menunjukkan insiden ketika Hengs sudah mengambil sebagian tindakan, tetapi moderator masih perlu memeriksanya.')
    .addFields(
      { name: 'Status', value: 'Perlu pemeriksaan moderator', inline: true },
      { name: 'Member', value: 'Member contoh', inline: true },
      { name: 'Pemicu', value: 'Pesan berulang lintas kanal', inline: true },
      { name: 'Pesan terpantau', value: '8', inline: true },
      { name: 'Kanal terpantau', value: '3', inline: true },
      { name: 'Tindakan Hengs', value: 'Penghapusan berhasil. Pemblokiran member belum berhasil.', inline: false },
      { name: 'Langkah berikutnya', value: 'Periksa konteks insiden sebelum mengambil tindakan manual.', inline: false },
    )
    .setFooter({ text: 'Pratinjau | Data contoh, tidak disimpan' });

  return {
    embeds: [embed],
    components: [],
    allowedMentions: allowedMentions(),
  };
}

function boundedCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.min(MAX_DISPLAY_COUNT, Math.max(0, Math.floor(count)));
}

function incidentTimestamp(incident) {
  return safeDate(incident?.createdAt)?.getTime() || 0;
}

function incidentAge(value, now = Date.now()) {
  const createdAt = safeDate(value);
  if (!createdAt) return 'Tidak tersedia';
  const ageMs = Math.max(0, now - createdAt.getTime());
  const days = Math.floor(ageMs / 86_400_000);
  if (days >= MAX_DISPLAY_AGE_DAYS) return `${MAX_DISPLAY_AGE_DAYS}+ hari`;
  if (days > 0) return `${days} hari`;
  const hours = Math.floor(ageMs / 3_600_000);
  if (hours > 0) return `${hours} jam`;
  const minutes = Math.floor(ageMs / 60_000);
  return minutes > 0 ? `${minutes} menit` : 'Baru saja';
}

function incidentPanelLink(incident) {
  const guildId = String(incident?.guildId || '');
  const channelId = String(incident?.panel?.channelId || '');
  const messageId = String(incident?.panel?.messageId || '');
  if (![guildId, channelId, messageId].every(value => DISCORD_ID.test(value))) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function queueField(incident) {
  const id = INCIDENT_ID.test(String(incident?.id || '')) ? incident.id : '0000000000000000';
  const memberId = DISCORD_ID.test(String(incident?.memberId || '')) ? incident.memberId : '-';
  const panelLink = incidentPanelLink(incident);
  return {
    name: `${statusLabel(incident?.status)} | ${id}`,
    value: [
      `Usia: ${incidentAge(incident?.createdAt)}`,
      `Member: \`${memberId}\``,
      `Pemicu: ${triggerLabel(incident?.trigger)}`,
      `Pesan/Kanal: ${boundedCount(incident?.messageCount)}/${boundedCount(incident?.channelCount)}`,
      `Panel: ${panelLink ? `[Buka panel](${panelLink})` : '-'}`,
    ].join('\n'),
    inline: false,
  };
}

function queueNavigation(page, totalPages, { empty = false } = {}) {
  const buttons = [];
  if (page > 0) {
    buttons.push(new ButtonBuilder()
      .setCustomId(`mod:incidents:prev:${page - 1}`)
      .setLabel('Sebelumnya')
      .setStyle(ButtonStyle.Secondary));
  }
  buttons.push(new ButtonBuilder()
    .setCustomId(`mod:incidents:refresh:${page}`)
    .setLabel(empty ? 'Cek Lagi' : 'Segarkan')
    .setStyle(ButtonStyle.Primary));
  if (page < totalPages - 1) {
    buttons.push(new ButtonBuilder()
      .setCustomId(`mod:incidents:next:${page + 1}`)
      .setLabel('Berikutnya')
      .setStyle(ButtonStyle.Secondary));
  }
  return new ActionRowBuilder().addComponents(buttons);
}

function emptyIncidentDescription(effectiveMode) {
  return {
    active: 'Penegakan aktif, tetapi belum ada aktivitas yang cocok dengan aturan Anti-Raid.',
    monitor: 'Belum ada aktivitas yang cocok dengan aturan Anti-Raid. Hengs tetap memantau tanpa menghapus pesan atau memblokir member.',
    off: 'Belum ada insiden tersimpan. Anti-Raid sedang dimatikan. Gunakan /mod status untuk mulai memantau.',
  }[effectiveMode];
}

function buildIncidentQueue(incidents, requestedPage = 0, options = {}) {
  const records = (Array.isArray(incidents) ? incidents : [])
    .slice(0, 500)
    .sort((left, right) => incidentTimestamp(right) - incidentTimestamp(left));
  const effectiveMode = MODES.has(options?.effectiveMode) ? options.effectiveMode : 'monitor';
  if (!records.length) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Belum ada insiden Anti-Raid')
      .setDescription(emptyIncidentDescription(effectiveMode));
    return {
      payload: {
        embeds: [embed],
        components: [queueNavigation(0, 1, { empty: true })],
        allowedMentions: allowedMentions(),
      },
      page: 0,
      totalPages: 1,
    };
  }

  const totalPages = Math.max(1, Math.ceil(records.length / MAX_QUEUE_ITEMS));
  const page = boundedPage(requestedPage, totalPages);
  const pageRecords = records.slice(page * MAX_QUEUE_ITEMS, (page + 1) * MAX_QUEUE_ITEMS);
  const active = boundedCount(records.filter(incident => incident.status === 'detected' || incident.status === 'enforcing').length);
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Insiden Anti-Raid')
    .setDescription([
      `Aktif tersimpan: **${active}**`,
      `Halaman: ${page + 1}/${totalPages}`,
      `Menampilkan: ${pageRecords.length}/${records.length}`,
    ].join('\n'))
    .addFields(pageRecords.map(queueField));

  return {
    payload: {
      embeds: [embed],
      components: [queueNavigation(page, totalPages)],
      allowedMentions: allowedMentions(),
    },
    page,
    totalPages,
  };
}

function configuredModLogId() {
  const value = String(process.env.MOD_LOG_CHANNEL_ID || '').trim();
  return DISCORD_ID.test(value) ? value : null;
}

async function findModLogChannel(guild) {
  const channelId = configuredModLogId();
  if (!channelId || !guild?.channels) return null;
  return guild.channels.cache?.get(channelId)
    || await guild.channels.fetch?.(channelId).catch(() => null)
    || null;
}

function isPrivateModLog(guild, channel) {
  if (!channel?.isTextBased?.() || typeof channel.send !== 'function' || typeof channel.permissionsFor !== 'function') return false;
  let everyonePermissions;
  try {
    everyonePermissions = channel.permissionsFor(guild?.roles?.everyone);
  } catch {
    return false;
  }
  if (!everyonePermissions?.has) return false;
  try {
    return !everyonePermissions.has(PermissionFlagsBits.ViewChannel) && !everyonePermissions.has('ViewChannel');
  } catch {
    return false;
  }
}

function currentIncident(incidentId) {
  return store.listIncidents().find(incident => incident.id === incidentId) || null;
}

function clearTrackedMessageExpiryTimer() {
  if (!trackedMessageExpiryTimer) return;
  clearTimeout(trackedMessageExpiryTimer);
  trackedMessageExpiryTimer = null;
}

function pruneTrackedMessages(now = Date.now()) {
  for (const [key, entry] of trackedMessages) {
    if (entry.expiresAt <= now) trackedMessages.delete(key);
  }
}

function scheduleTrackedMessageExpiry() {
  clearTrackedMessageExpiryTimer();
  let earliest = Infinity;
  for (const entry of trackedMessages.values()) earliest = Math.min(earliest, entry.expiresAt);
  if (!Number.isFinite(earliest)) return;
  trackedMessageExpiryTimer = setTimeout(() => {
    trackedMessageExpiryTimer = null;
    pruneTrackedMessages();
    scheduleTrackedMessageExpiry();
  }, Math.max(0, earliest - Date.now()));
  trackedMessageExpiryTimer.unref?.();
}

function rememberMessage(message) {
  const guildId = String(message?.guildId || message?.guild?.id || '');
  const memberId = String(message?.author?.id || message?.member?.id || '');
  const messageId = String(message?.id || '');
  if (!DISCORD_ID.test(guildId) || !DISCORD_ID.test(memberId) || !DISCORD_ID.test(messageId)) return;
  pruneTrackedMessages();
  trackedMessages.set(`${guildId}:${memberId}:${messageId}`, {
    message,
    expiresAt: Date.now() + TRACKED_MESSAGE_TTL_MS,
  });
  while (trackedMessages.size > MAX_TRACKED_MESSAGES) trackedMessages.delete(trackedMessages.keys().next().value);
  scheduleTrackedMessageExpiry();
}

function matchedMessageObjects(message, matched) {
  const guildId = String(message?.guildId || message?.guild?.id || '');
  const memberId = String(matched?.memberId || message?.author?.id || '');
  const objects = [];
  for (const messageId of Array.isArray(matched?.messageIds) ? matched.messageIds : []) {
    const value = trackedMessages.get(`${guildId}:${memberId}:${messageId}`)?.message;
    if (value) objects.push(value);
  }
  if (!objects.includes(message)) objects.push(message);
  return objects;
}

function forgetMatchedMessages(message, matched) {
  const guildId = String(message?.guildId || message?.guild?.id || '');
  const memberId = String(matched?.memberId || message?.author?.id || '');
  const ids = new Set(Array.isArray(matched?.messageIds) ? matched.messageIds.map(String) : []);
  if (message?.id) ids.add(String(message.id));
  for (const messageId of ids) trackedMessages.delete(`${guildId}:${memberId}:${messageId}`);
  scheduleTrackedMessageExpiry();
}

function detectionWindowStart(message, matchedMessages) {
  const timestamps = matchedMessages
    .map(item => Number(item?.createdTimestamp))
    .filter(Number.isFinite);
  const value = timestamps.length ? Math.min(...timestamps) : Date.now();
  return Math.max(0, Math.floor(value / 60_000) * 60_000);
}

function persistedPolicy(state) {
  return {
    allowedRoleIds: state?.allowlist?.roleIds || [],
    allowedChannelIds: state?.allowlist?.channelIds || [],
    allowedDomains: state?.allowlist?.domains || [],
  };
}

function assessmentContext(message, state, staticPolicy, modLogChannel) {
  const botMember = message?.guild?.members?.me;
  return {
    configuredMode: state.mode,
    staticPolicy,
    modLogChannel,
    guild: message?.guild,
    everyoneRole: message?.guild?.roles?.everyone,
    botMember,
    botPermissions: botMember?.permissions,
    targetMember: message?.member,
  };
}

async function refreshEnforcementContext(guild, message) {
  const modLogChannel = await findModLogChannel(guild);
  const state = store.getState();
  const staticPolicy = policy.readStaticPolicy(process.env);
  const currentPolicy = persistedPolicy(state);
  return {
    state,
    staticPolicy,
    persistedPolicy: currentPolicy,
    modLogChannel,
    exempt: policy.isMessageExempt(message, staticPolicy, currentPolicy).exempt,
    assessment: policy.assessPrerequisites(assessmentContext(message, state, staticPolicy, modLogChannel)),
  };
}

function monitorResult(issueCode = null) {
  return {
    status: 'monitor',
    banSucceeded: false,
    deletionSucceeded: false,
    deletedCount: 0,
    issueCode,
  };
}

function isFinal(incident) {
  return FINAL_STATUSES.has(incident?.status);
}

function botId(guild, client) {
  const id = guild?.members?.me?.id || client?.user?.id;
  return DISCORD_ID.test(String(id || '')) ? String(id) : null;
}

function messageHasIncidentMarker(message, incidentId, expectedBotId) {
  if (!message || !INCIDENT_ID.test(incidentId)) return false;
  if (expectedBotId && String(message.author?.id || '') !== expectedBotId) return false;
  return Array.from(message.embeds || []).some(embed => {
    const footer = embed?.footer?.text || embed?.data?.footer?.text || '';
    return String(footer).includes(`Incident ID: ${incidentId}`);
  });
}

async function findExistingPanel(channel, guild, client, incidentId) {
  if (!channel?.messages?.fetch) return null;
  const expectedBotId = botId(guild, client);
  if (!expectedBotId) return null;
  let recent;
  try {
    recent = await channel.messages.fetch({ limit: 100 });
  } catch {
    return null;
  }
  const values = typeof recent?.values === 'function' ? [...recent.values()] : Array.from(recent || []);
  return values.find(message => messageHasIncidentMarker(message, incidentId, expectedBotId)) || null;
}

async function setPanelFromMessage(incident, channel, message) {
  const current = currentIncident(incident.id);
  if (!current?.panel || !message?.id) {
    const result = store.setIncidentPanel(incident.id, {
      channelId: channel.id,
      messageId: String(message.id),
    }, current?.revision ?? incident.revision);
    return result.ok || Boolean(result.incident?.panel);
  }
  return true;
}

function singleFlight(flights, key, task) {
  const running = flights.get(key);
  if (running) return running;
  const promise = Promise.resolve()
    .then(task)
    .finally(() => flights.delete(key));
  flights.set(key, promise);
  return promise;
}

async function ensureIncidentPanel(guild, incident, client) {
  if (!isFinal(incident) || incident.panel) return Boolean(incident.panel);
  return singleFlight(panelFlights, incident.id, async () => {
    const current = currentIncident(incident.id);
    if (!current || !isFinal(current)) return false;
    if (current.panel) return true;
    const channel = await findModLogChannel(guild);
    if (!isPrivateModLog(guild, channel)) return false;

    const existing = await findExistingPanel(channel, guild, client, current.id);
    if (existing) return setPanelFromMessage(current, channel, existing);

    let sent;
    try {
      sent = await channel.send(buildIncidentCard(current));
    } catch {
      sent = await findExistingPanel(channel, guild, client, current.id);
      if (!sent) return false;
    }
    return setPanelFromMessage(current, channel, sent);
  });
}

async function processMatchedIncident(context) {
  const { guild, message, matched } = context;
  const objects = matchedMessageObjects(message, matched);
  const created = store.createOrGetIncident({
    guildId: matched.guildId,
    memberId: matched.memberId,
    detectionWindowStartMs: detectionWindowStart(message, objects),
    trigger: matched.trigger,
    messageCount: matched.messageCount,
    channelCount: matched.channelCount,
  });

  return singleFlight(incidentFlights, created.incident.id, async () => {
    let incident = currentIncident(created.incident.id) || created.incident;
    if (incident.status === 'detected') {
      const claimed = store.claimEnforcement(incident.id, incident.revision);
      if (claimed.ok) {
        let result;
        const refreshed = await refreshEnforcementContext(guild, message);
        if (refreshed.exempt || refreshed.assessment.effectiveMode !== 'active') {
          result = monitorResult(
            refreshed.exempt ? 'PREREQUISITES_CHANGED' : refreshed.assessment.issues[0] || null,
          );
        } else {
          result = await enforceIncident({
            guild,
            message,
            incident: claimed.incident,
            configuredMode: refreshed.state.mode,
            staticPolicy: refreshed.staticPolicy,
            persistedPolicy: refreshed.persistedPolicy,
            modLogChannel: refreshed.modLogChannel,
            everyoneRole: guild?.roles?.everyone,
            trackedMessages: objects,
          });
        }
        const finalized = store.finalizeIncident(claimed.incident.id, result, claimed.incident.revision);
        incident = finalized.incident || claimed.incident;
      } else {
        incident = claimed.incident || incident;
      }
    }
    incident = currentIncident(incident.id) || incident;
    if (isFinal(incident)) {
      const panelReady = await ensureIncidentPanel(guild, incident, null);
      if (!panelReady) {
        schedulePanelRetry(message?.client || guild?.client || maintenanceClient, maintenanceOptions);
      }
    }
    return incident;
  });
}

async function handleMessage(message) {
  let matched = null;
  try {
    const staticPolicy = policy.readStaticPolicy(process.env);
    let state;
    try {
      state = store.getState();
    } catch {
      const exempt = policy.isMessageExempt(message, staticPolicy, {}).exempt;
      const guildId = String(message?.guildId || message?.guild?.id || '');
      if (exempt || !message?.guild || !DISCORD_ID.test(guildId)) return false;
      console.error('[anti-raid] STATE_UNAVAILABLE');
      return true;
    }
    if (!MODES.has(state.mode) || state.mode === 'off') return false;
    const currentPolicy = persistedPolicy(state);
    if (policy.isMessageExempt(message, staticPolicy, currentPolicy).exempt) return false;
    if (!message?.guild || !DISCORD_ID.test(String(message.guildId || message.guild.id || ''))) return false;

    rememberMessage(message);
    const modLogChannel = await findModLogChannel(message.guild);
    const assessment = policy.assessPrerequisites(assessmentContext(message, state, staticPolicy, modLogChannel));
    const effectiveMode = assessment.effectiveMode;
    if (effectiveMode !== 'active' && effectiveMode !== 'monitor') return false;

    matched = tracker.observe({
      guildId: message.guild.id,
      memberId: message.author?.id || message.member?.id,
      channelId: message.channelId || message.channel?.id,
      messageId: message.id,
      timestampMs: message.createdTimestamp,
      content: message.content,
      attachments: typeof message.attachments?.values === 'function'
        ? [...message.attachments.values()]
        : Array.isArray(message.attachments) ? message.attachments : [],
      blockedDomains: staticPolicy.blockedDomains,
      allowedDomains: currentPolicy.allowedDomains,
    });
    if (!matched.matched) return false;

    try {
      await processMatchedIncident({
        guild: message.guild,
        message,
        matched,
        effectiveMode,
        assessment,
        staticPolicy,
        state,
        modLogChannel,
      });
    } catch {
      console.error('[anti-raid] MATCHED_INCIDENT_FAILED');
    } finally {
      forgetMatchedMessages(message, matched);
    }
    return true;
  } catch {
    if (matched?.matched) {
      console.error('[anti-raid] MATCHED_INCIDENT_FAILED');
      forgetMatchedMessages(message, matched);
      return true;
    }
    return false;
  }
}

function memberRoleIds(member) {
  if (member?.roles?.cache?.keys) return new Set([...member.roles.cache.keys()].map(String));
  if (Array.isArray(member?.roles)) return new Set(member.roles.map(String));
  if (Array.isArray(member?._roles)) return new Set(member._roles.map(String));
  return new Set();
}

function isOwner(interaction) {
  const ownerId = String(process.env.OWNER_ID || '');
  if (!DISCORD_ID.test(ownerId)) return false;
  return String(interaction?.user?.id || '') === ownerId;
}

function isModerator(interaction) {
  if (isOwner(interaction)) return true;
  const reviewers = new Set(policy.readStaticPolicy(process.env).reviewerRoleIds);
  reviewers.delete(String(interaction?.guildId || interaction?.guild?.id || ''));
  if (!reviewers.size) return false;
  const roles = memberRoleIds(interaction?.member);
  return [...reviewers].some(roleId => roles.has(String(roleId)));
}

async function replyEphemeral(interaction, content) {
  const payload = {
    ...(typeof content === 'string' ? { content } : content),
    ephemeral: true,
    allowedMentions: allowedMentions(),
  };
  if (interaction?.deferred && !interaction.replied && interaction.editReply) {
    const { ephemeral, ...editPayload } = payload;
    await interaction.editReply(editPayload);
  } else if (interaction?.deferred || interaction?.replied) {
    await interaction.followUp?.(payload);
  } else {
    await interaction?.reply?.(payload);
  }
}

async function updateComponentResponse(interaction, content) {
  const payload = {
    ...(typeof content === 'string' ? { content } : content),
    components: [],
    allowedMentions: allowedMentions(),
  };
  if (interaction?.update) await interaction.update(payload);
  else await replyEphemeral(interaction, payload);
}

function modeConfirmation(revision) {
  return {
    content: 'Aktifkan penegakan Anti-Raid? Hengs dapat menghapus pesan raid dan memblokir member yang cocok dengan aturan.',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod:mode-confirm:${revision}:active`)
        .setLabel('Ya, Aktifkan')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`mod:mode-cancel:${revision}`)
        .setLabel('Batal')
        .setStyle(ButtonStyle.Secondary),
    )],
  };
}

function modeSuccessMessage(mode) {
  return {
    active: 'Penegakan Anti-Raid aktif. Hengs sekarang dapat menghapus pesan raid dan memblokir member yang cocok dengan aturan. Pengaturan disimpan.',
    monitor: 'Mode Monitor aktif. Hengs akan mencatat pola berisiko tanpa menghapus pesan atau memblokir member. Pengaturan disimpan.',
    off: 'Anti-Raid dimatikan. Pesan baru tidak akan diperiksa oleh sistem Anti-Raid. Pengaturan disimpan.',
  }[mode];
}

async function verifiedModeSuccessMessage(mode, guild) {
  if (mode !== 'active') return modeSuccessMessage(mode);
  try {
    const { assessment } = await assessModeration(guild);
    if (assessment.effectiveMode !== 'active') {
      return 'Mode Aktif disimpan, tetapi penegakan tetap Monitor karena kesiapan belum aman. Buka /mod status untuk melihat prasyaratnya.';
    }
    return modeSuccessMessage(mode);
  } catch {
    return 'Mode Aktif disimpan, tetapi status efektif belum dapat diverifikasi. Buka /mod status sebelum mengandalkan penegakan.';
  }
}

function parseComponentId(customId) {
  const value = String(customId || '');
  const confirm = value.match(/^mod:mode-confirm:(0|[1-9]\d*):active$/);
  if (confirm && Number.isSafeInteger(Number(confirm[1]))) {
    return { kind: 'mode-confirm', revision: Number(confirm[1]), mode: 'active' };
  }
  const cancel = value.match(/^mod:mode-cancel:(0|[1-9]\d*)$/);
  if (cancel && Number.isSafeInteger(Number(cancel[1]))) {
    return { kind: 'mode-cancel', revision: Number(cancel[1]) };
  }
  const mode = value.match(/^mod:mode:(0|[1-9]\d*):(active|monitor|off)$/);
  if (mode && Number.isSafeInteger(Number(mode[1]))) {
    return { kind: 'mode', revision: Number(mode[1]), mode: mode[2] };
  }
  const incidents = value.match(/^mod:incidents:(prev|next|refresh):(0|[1-9]\d?)$/);
  if (incidents && Number(incidents[2]) <= MAX_PAGE) {
    return { kind: 'incidents', action: incidents[1], page: Number(incidents[2]) };
  }
  return null;
}

async function handleComponent(interaction) {
  if (!interaction?.isButton?.() || !String(interaction.customId || '').startsWith('mod:')) return false;
  const parsed = parseComponentId(interaction.customId);
  if (!parsed || !isModerator(interaction)) {
    await replyEphemeral(interaction, 'Kontrol moderasi tidak valid atau tidak tersedia.');
    return true;
  }

  if (parsed.kind === 'mode' || parsed.kind === 'mode-confirm' || parsed.kind === 'mode-cancel') {
    if (!isOwner(interaction)) {
      await replyEphemeral(interaction, 'Kontrol moderasi tidak valid atau tidak tersedia.');
      return true;
    }

    try {
      if (parsed.kind === 'mode-cancel') {
        const current = store.getMode();
        const message = current.revision === parsed.revision
          ? 'Tidak ada perubahan. Anti-Raid tetap memakai mode sebelumnya.'
          : 'Pengaturan Anti-Raid sudah berubah. Buka /mod status lalu coba lagi.';
        await updateComponentResponse(interaction, message);
        return true;
      }

      if (parsed.kind === 'mode' && parsed.mode === 'active') {
        await replyEphemeral(interaction, modeConfirmation(parsed.revision));
        return true;
      }

      const nextMode = parsed.kind === 'mode-confirm' ? 'active' : parsed.mode;
      const result = store.setMode(nextMode, interaction.user.id, parsed.revision);
      if (!result.ok) {
        const staleMessage = 'Pengaturan Anti-Raid sudah berubah. Buka /mod status lalu coba lagi.';
        if (parsed.kind === 'mode-confirm') await updateComponentResponse(interaction, staleMessage);
        else await replyEphemeral(interaction, staleMessage);
        return true;
      }
      const successMessage = await verifiedModeSuccessMessage(nextMode, interaction?.guild);
      if (parsed.kind === 'mode-confirm') {
        await updateComponentResponse(interaction, successMessage);
      } else {
        await replyEphemeral(interaction, successMessage);
      }
      return true;
    } catch {
      const unavailableMessage = 'Pengaturan Anti-Raid sedang tidak tersedia. Buka /mod status lalu coba lagi.';
      if (parsed.kind === 'mode-confirm' || parsed.kind === 'mode-cancel') {
        await updateComponentResponse(interaction, unavailableMessage);
      } else {
        await replyEphemeral(interaction, unavailableMessage);
      }
      return true;
    }
  }

  try {
    const { assessment } = await assessModeration(interaction?.guild);
    const queue = buildIncidentQueue(store.listIncidents(), parsed.page, {
      effectiveMode: assessment.effectiveMode,
    });
    if (interaction.update) await interaction.update(queue.payload);
    else await replyEphemeral(interaction, queue.payload);
  } catch {
    await replyEphemeral(interaction, 'Antrean moderasi sedang tidak tersedia.');
  }
  return true;
}

function modeControls(mode) {
  return new ActionRowBuilder().addComponents(
    ...['active', 'monitor', 'off'].map(value => new ButtonBuilder()
      .setCustomId(`mod:mode:${mode.revision}:${value}`)
      .setLabel({ active: 'Aktifkan Penegakan', monitor: 'Pantau Saja', off: 'Matikan Anti-Raid' }[value])
      .setStyle(value === 'active' ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(mode.mode === value)),
  );
}

function modeLabel(mode) {
  return {
    active: 'Aktif',
    monitor: 'Monitor',
    off: 'Nonaktif',
  }[mode] || mode;
}

function modePresentation(configuredMode, effectiveMode) {
  const base = {
    active: { title: 'Penegakan Anti-Raid aktif', description: 'Hengs dapat menghapus pesan raid dan memblokir member yang cocok dengan aturan.', color: 0xED4245 },
    monitor: { title: 'Anti-Raid sedang memantau', description: 'Hengs mencatat pola yang cocok tanpa menghapus pesan atau memblokir member.', color: 0x5865F2 },
    off: { title: 'Anti-Raid dimatikan', description: 'Hengs tidak memeriksa pesan baru untuk insiden Anti-Raid.', color: 0x747F8D },
  }[effectiveMode];
  if (configuredMode !== 'active' || effectiveMode !== 'monitor') return base;
  return {
    ...base,
    description: `${base.description}\n\nMode Aktif diminta, tetapi Hengs kembali ke Monitor karena kesiapan penegakan belum aman.`,
  };
}

async function assessModeration(guild) {
  const state = store.getState();
  const staticPolicy = policy.readStaticPolicy(process.env);
  const modLogChannel = await findModLogChannel(guild);
  const assessment = policy.assessPrerequisites(
    assessmentContext({ guild }, state, staticPolicy, modLogChannel),
  );
  return { state, assessment };
}

function finalStatusCounts(incidents) {
  return Object.fromEntries([...FINAL_STATUSES].map(status => [
    status,
    boundedCount(incidents.filter(incident => incident?.status === status).length),
  ]));
}

async function showStatus(interaction) {
  if (!isModerator(interaction)) {
    await replyEphemeral(interaction, 'Kamu tidak dapat membuka status moderasi.');
    return true;
  }
  const { state, assessment } = await assessModeration(interaction?.guild);
  const issues = assessment.issues.map(issueLabel).filter(Boolean);
  const snapshot = tracker.snapshot();
  const finalCounts = finalStatusCounts(store.listIncidents());
  const presentation = modePresentation(assessment.configuredMode, assessment.effectiveMode);
  const payload = {
    embeds: [new EmbedBuilder()
      .setColor(presentation.color)
      .setTitle(presentation.title)
      .setDescription(presentation.description)
      .addFields(
        { name: 'Kesiapan penegakan', value: issues.join('\n') || 'Siap', inline: false },
        { name: 'Aktivitas sesi', value: `Guild: ${boundedCount(snapshot.guilds)}\nMember: ${boundedCount(snapshot.members)}\nObservasi: ${boundedCount(snapshot.observations)}`, inline: true },
        { name: 'Riwayat tindakan', value: `Diblokir: ${finalCounts.banned}\nDipantau: ${finalCounts.monitor}\nTindakan sebagian: ${finalCounts.partial}\nPerlu tindak lanjut: ${finalCounts.failed}`, inline: true },
        { name: 'Konfigurasi', value: `Tersimpan: ${modeLabel(assessment.configuredMode)}\nEfektif: ${modeLabel(assessment.effectiveMode)}`, inline: false },
      )],
    components: isOwner(interaction) ? [modeControls({ mode: state.mode, revision: state.revision })] : [],
  };
  await replyEphemeral(interaction, payload);
  return true;
}

async function showPreview(interaction) {
  if (!isOwner(interaction)) {
    await replyEphemeral(interaction, 'Pratinjau insiden hanya tersedia untuk owner.');
    return true;
  }
  await replyEphemeral(interaction, buildIncidentPreview());
  return true;
}

async function showIncidents(interaction, page = 0) {
  if (!isModerator(interaction)) {
    await replyEphemeral(interaction, 'Kamu tidak dapat membuka antrean moderasi.');
    return true;
  }
  const { assessment } = await assessModeration(interaction?.guild);
  const queue = buildIncidentQueue(store.listIncidents(), Number(page) - 1, {
    effectiveMode: assessment.effectiveMode,
  });
  await replyEphemeral(interaction, queue.payload);
  return true;
}

function allowlistValues(kind, state) {
  const metadata = {
    role: { field: 'roleIds', label: 'role', valid: value => DISCORD_ID.test(String(value || '')) },
    channel: { field: 'channelIds', label: 'channel', valid: value => DISCORD_ID.test(String(value || '')) },
    domain: {
      field: 'domains',
      label: 'domain',
      valid: value => {
        const raw = String(value || '').trim().toLowerCase();
        return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(raw);
      },
    },
  }[kind];
  if (!metadata) return null;
  const safe = [...new Set((Array.isArray(state?.allowlist?.[metadata.field]) ? state.allowlist[metadata.field] : [])
    .map(value => String(value || '').trim().toLowerCase())
    .filter(metadata.valid))].sort();
  return { label: metadata.label, safe: safe.slice(0, MAX_ALLOWLIST_VALUES), total: safe.length };
}

function allowlistKindLabel(kind) {
  return {
    role: 'Role',
    channel: 'Channel',
    domain: 'Domain',
  }[kind] || null;
}

function allowlistFields(values) {
  const groups = [];
  let current = '';
  for (const value of values) {
    const line = `\`${value}\``;
    const candidate = current ? `${current}\n${line}` : line;
    if (current && candidate.length > MAX_EMBED_FIELD_VALUE) {
      groups.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) groups.push(current);
  return groups.map((value, index) => ({
    name: index === 0 ? 'Nilai tersimpan' : `Nilai tersimpan (lanjutan ${index + 1})`,
    value,
    inline: false,
  }));
}

function buildAllowlistEmbed(listed) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`Allowlist ${listed.label}`);
  if (!listed.safe.length) {
    embed.setDescription(`Belum ada ${listed.label} yang dikecualikan dari Anti-Raid.`);
    return embed;
  }
  embed
    .setDescription(`Menampilkan ${listed.safe.length} dari ${listed.total} nilai aman.`)
    .addFields(allowlistFields(listed.safe));
  return embed;
}

async function mutateAllowlist(interaction, kind, action, value) {
  const ownerId = String(process.env.OWNER_ID || '');
  if (!DISCORD_ID.test(ownerId) || String(interaction?.user?.id || '') !== ownerId) {
    await replyEphemeral(interaction, 'Perubahan allowlist hanya tersedia untuk owner.');
    return true;
  }
  if (action === 'list') {
    const listed = allowlistValues(kind, store.getState());
    if (!listed) await replyEphemeral(interaction, 'Nilai allowlist tidak valid.');
    else await replyEphemeral(interaction, { embeds: [buildAllowlistEmbed(listed)] });
    return true;
  }
  try {
    const result = store.mutateAllowlist(kind, action, value, interaction.user.id, store.getMode().revision);
    if (!result.ok) {
      await replyEphemeral(interaction, 'Allowlist sudah berubah. Jalankan kembali perintah ini.');
      return true;
    }
    const label = allowlistKindLabel(kind);
    const actionLabel = action === 'add' ? 'ditambahkan' : 'dihapus';
    await replyEphemeral(interaction, `${label} berhasil ${actionLabel} dari allowlist Anti-Raid.`);
  } catch {
    await replyEphemeral(interaction, 'Nilai allowlist tidak valid.');
  }
  return true;
}

async function resolveGuild(client, guildId) {
  return client?.guilds?.cache?.get(guildId)
    || await client?.guilds?.fetch?.(guildId).catch(() => null)
    || null;
}

async function alreadyBanned(guild, memberId) {
  try {
    await guild?.bans?.fetch?.(memberId);
    return true;
  } catch {
    return false;
  }
}

async function recoverEnforcingIncident(guild, incident) {
  let result;
  if (await alreadyBanned(guild, incident.memberId)) {
    result = {
      status: 'banned',
      banSucceeded: true,
      deletionSucceeded: true,
      deletedCount: 0,
      issueCode: null,
    };
  } else {
    const state = store.getState();
    const staticPolicy = policy.readStaticPolicy(process.env);
    const modLogChannel = await findModLogChannel(guild);
    result = await enforceIncident({
      guild,
      message: {
        guild,
        guildId: guild?.id,
        author: { id: incident.memberId, bot: false },
      },
      incident,
      configuredMode: state.mode,
      staticPolicy,
      persistedPolicy: persistedPolicy(state),
      modLogChannel,
      everyoneRole: guild?.roles?.everyone,
      trackedMessages: [],
    });
  }
  const finalized = store.finalizeIncident(incident.id, result, incident.revision);
  return finalized.incident || incident;
}

function clearPanelRetry() {
  if (!panelRetryTimer) return;
  clearTimeout(panelRetryTimer);
  panelRetryTimer = null;
}

function schedulePanelRetry(client, options) {
  if (!client || panelRetryTimer) return;
  const configured = Number(options?.panelRetryDelayMs);
  const delay = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_PANEL_RETRY_DELAY_MS;
  panelRetryTimer = setTimeout(() => {
    panelRetryTimer = null;
    start(client, { ...options, disableTimer: false }).catch(() => {});
  }, delay);
  panelRetryTimer.unref?.();
}

async function start(client, options = {}) {
  maintenanceClient = client || maintenanceClient;
  maintenanceOptions = { ...options, disableTimer: false };
  clearPanelRetry();
  const summary = { recovered: 0, retried: 0, pending: 0 };
  for (const recoverable of store.listRecoverableIncidents()) {
    let incident = currentIncident(recoverable.id) || recoverable;
    try {
      const guild = await resolveGuild(client, incident.guildId);
      if (!guild) {
        if (isFinal(incident) && !incident.panel) summary.pending += 1;
        continue;
      }
      if (incident.status === 'detected') {
        const claimed = store.claimEnforcement(incident.id, incident.revision);
        incident = claimed.incident || incident;
      }
      if (incident.status === 'enforcing') {
        incident = await singleFlight(incidentFlights, incident.id, async () => {
          const current = currentIncident(incident.id) || incident;
          if (current.status !== 'enforcing') return current;
          return recoverEnforcingIncident(guild, current);
        });
        summary.retried += 1;
      }
      incident = currentIncident(incident.id) || incident;
      if (isFinal(incident) && !incident.panel) {
        if (await ensureIncidentPanel(guild, incident, client)) summary.recovered += 1;
        else summary.pending += 1;
      }
    } catch {
      if (isFinal(incident) && !incident.panel) summary.pending += 1;
    }
  }
  if (!options.disableTimer && summary.pending > 0) schedulePanelRetry(client, options);
  return summary;
}

module.exports = {
  buildIncidentCard,
  buildIncidentPreview,
  buildIncidentQueue,
  findModLogChannel,
  handleComponent,
  handleMessage,
  isModerator,
  mutateAllowlist,
  showIncidents,
  showPreview,
  showStatus,
  start,
};
