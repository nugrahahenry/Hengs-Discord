// ─── index.js ─────────────────────────────────────────────────────────────
// Discord Bot Henzzz entry point
//
// Cara pakai:
// 1. Isi .env (DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, dll)
// 2. npm install
// 3. npm run deploy  ← register slash commands (sekali saja)
// 4. npm start       ← jalankan bot

require('dotenv').config();
const {
  Client, GatewayIntentBits, Collection, Partials,
  Events, EmbedBuilder, PermissionFlagsBits, ActivityType, MessageFlags,
} = require('discord.js');
const fs   = require('node:fs');
const path = require('node:path');
const agent = require('./agent');
const state = require('./state');
const { generateCard } = require('./utils/welcome-card');
const { AttachmentBuilder } = require('discord.js');
const roleStore = require('./utils/role-store');
const voiceStore = require('./utils/voice-store');
const { assignMemberRole } = require('./utils/member-onboarding');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const opsHub = require('./ops/hub');
const eventHub = require('./events/hub');
const reportHub = require('./reports/hub');
const reportQueue = require('./reports/queue');
const moderationHub = require('./moderation/hub');
const { routeReportComponent } = require('./reports/router');
const translationService = require('./translation/service');
const { bindDiscordClientHealth, createRuntimeHealth } = require('./runtime/health');
const { InstanceLockError, createInstanceLock, resolveInstanceLockFile } = require('./runtime/instance-lock');
const { createWaRecoveryAlertConsumer, isWaRecoveryEnabled } = require('./runtime/wa-recovery-alerts');
const { createGuildConfigStore, parsePublicGuildLimit } = require('./guilds/config-store');
const { createGuildAccess } = require('./guilds/access');
const { createPublicTrafficGuard } = require('./guilds/public-traffic-guard');
const {
  createPublicInsightsStore,
  parsePublicDailyRequestLimit,
} = require('./guilds/public-insights-store');
const { buildPublicFeedbackComponents, handlePublicFeedback } = require('./guilds/public-feedback');
const { isPublicChannelAllowed } = require('./guilds/public-channel-policy');
const { sendPublicGuildWelcome } = require('./guilds/public-onboarding');
const { createCommunityPack } = require('./guilds/community-pack');
const { MAX_PROMPT_LENGTH, applyFocusAction, resolvePrompt } = require('./prompt-assistant');
const { parseScheduleInput } = require('./ops/time');
const { handleComponent: handlePromptReviewComponent } = require('./prompt-review');
const { applyCommunityPlan } = require('./prompt-apply');
const setupCommand = require('./commands/setup');
const packageMetadata = require('../package.json');

// Satu proses saja boleh memakai token Discord + Ops state yang sama. Selain mencegah
// event dobel, ini menutup kemungkinan dua instance mem-publish draft yang sama.
const INSTANCE_LOCK = resolveInstanceLockFile(process.env);
const instanceLock = createInstanceLock({ filePath: INSTANCE_LOCK });
try {
  instanceLock.acquire();
} catch (error) {
  if (error instanceof InstanceLockError && error.code === 'INSTANCE_ACTIVE') {
    const owner = error.pid ? ` (PID ${error.pid})` : '';
    console.error(`\n🔒 Hengs Discord sudah berjalan${owner}. Instance kedua dihentikan.\n`);
    process.exit(0);
  }
  throw error;
}
const runtimeHealth = createRuntimeHealth({ version: packageMetadata.version });
runtimeHealth.start();
process.on('exit', () => {
  runtimeHealth.stop();
  instanceLock.release();
});

const guildConfigStore = createGuildConfigStore({
  rootDir: process.env.HENGS_GUILD_CONFIG_DIR || undefined,
});
const publicGuildLimit = parsePublicGuildLimit(process.env.HENGS_PUBLIC_GUILD_LIMIT);
const guildAccess = createGuildAccess({
  homeGuildId: process.env.DISCORD_GUILD_ID,
  store: guildConfigStore,
});
const publicTrafficGuard = createPublicTrafficGuard();
const publicDailyRequestLimit = parsePublicDailyRequestLimit(
  process.env.HENGS_PUBLIC_DAILY_REQUEST_LIMIT,
);
const publicInsightsStore = createPublicInsightsStore({ dailyLimit: publicDailyRequestLimit });
const communityPack = createCommunityPack();
const PUBLIC_COMMANDS = new Set(['hengs', 'setup']);

// ── Client setup ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions, // needed for reaction roles
    GatewayIntentBits.GuildVoiceStates,      // needed for voice (join + auto-rejoin)
  ],
  // WAJIB buat reaction roles: tanpa partials, event reaksi di pesan LAMA (yang dikirim
  // sebelum bot restart) nggak dikirim Discord → reaction roles mati senyap. Inilah yang
  // bikin /admin rolereact "nggak jalan" kemarin.
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember],
});

const waRecoveryRaw = String(process.env.HENGS_WA_RECOVERY_ALERTS_ENABLED || '').trim().toLowerCase();
const waRecoveryEnabled = isWaRecoveryEnabled(process.env);
if (waRecoveryRaw && !['true', 'false'].includes(waRecoveryRaw)) {
  console.error('[wa-alert] WA_RECOVERY_CONFIG_INVALID');
}
const waRecoveryAlerts = createWaRecoveryAlertConsumer({ client, enabled: waRecoveryEnabled });

let shutdownStarted = false;
let fatalExitStarted = false;

function gracefulShutdown(signal) {
  if (shutdownStarted || fatalExitStarted) return;
  shutdownStarted = true;
  console.log(`\nHengs Discord menerima ${signal}; menutup koneksi...`);
  runtimeHealth.setConnection('STOPPING');
  waRecoveryAlerts.stop();
  try { client.destroy(); } catch {}
  process.exit(0);
}

function fatalExit(issueCode, error) {
  if (fatalExitStarted) return;
  fatalExitStarted = true;
  runtimeHealth.setConnection('FAILED', issueCode);
  console.error(`[fatal] ${issueCode}:`, error);
  waRecoveryAlerts.stop();
  try { client.destroy(); } catch {}
  process.exit(1);
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', error => fatalExit('UNCAUGHT_EXCEPTION', error));
process.on('unhandledRejection', error => fatalExit('UNHANDLED_REJECTION', error));

bindDiscordClientHealth(client, runtimeHealth, Events, {
  isStopping: () => shutdownStarted || fatalExitStarted,
});

// ── Load slash commands ──────────────────────────────────────────────────────
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd);
    console.log(`  📌 Command loaded: /${cmd.data.name}`);
  }
}

// ── Server Stats updater ─────────────────────────────────────────────────────
// Update voice channels yang jadi stat display (member count, bots, dll)
// Discord rate limit: 2 rename per channel per 10 menit, tidak boleh terlalu sering.
async function updateServerStats(guild) {
  try {
    const memberCount = guild.memberCount;
    const botCount = guild.members.cache.filter(m => m.user.bot).size;
    const humanCount = memberCount - botCount;
    // Prefix harus sama dengan yang di /admin setup
    const statsMap = {
      '👥・All Members:': `👥・All Members: ${memberCount}`,
      '👤・Members:':     `👤・Members: ${humanCount}`,
      '🤖・Bots:':        `🤖・Bots: ${botCount}`,
    };
    for (const ch of guild.channels.cache.values()) {
      for (const [prefix, newName] of Object.entries(statsMap)) {
        if (ch.name.startsWith(prefix) && ch.name !== newName) {
          await ch.setName(newName).catch(() => {});
          break;
        }
      }
    }
  } catch (e) {
    console.error('⚠️ updateServerStats error:', e.message);
  }
}

// ── Kirim status ke channel bot-settings (log/kontrol Hengs) ─────────────────
async function postBotSettings(guild, content) {
  try {
    const lc = c => c.name.toLowerCase();
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && lc(c).includes('bot-settings'))
            || guild.channels.cache.find(c => c.isTextBased?.() && lc(c).includes('settings'));
    if (ch) await ch.send(content);
  } catch (e) { console.error('⚠️ postBotSettings error:', e.message); }
}

// ── Ready ────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log('\n✅ Discord Bot Online!');
  console.log(`   Tag : ${c.user.tag}`);
  console.log(`   Server count: ${c.guilds.cache.size}`);
  console.log('─────────────────────────────────────');
  console.log('Slash commands tersedia:');
  console.log('  /study on [topic] | /study off | /study status');
  console.log('  /scrim on [game]  | /scrim off');
  console.log('  /announce [message]');
  console.log('  /fun quote | /fun 8ball | /fun roll | /fun flip | /fun meme');
  console.log('  /ops draft | /event draft | /translate file | /report | /reports');
  console.log('  Mention bot untuk AI chat!');
  console.log('─────────────────────────────────────\n');

  // Mode mulai OFF. Aktifkan manual via /study on atau /scrim on.
  // (tidak auto-study seperti WA bot, Discord bot dipakai lebih sosial)

  // Status bot agar cara meminta bantuan terlihat.
  c.user.setPresence({
    activities: [{ name: 'mention aku buat ngobrol 🤖 | /fun', type: ActivityType.Listening }],
    status: 'online',
  });

  waRecoveryAlerts.start();

  // Update server stats sekali saat bot nyala
  for (const guild of c.guilds.cache.values()) {
    if (!guildAccess.isHome(guild.id)) continue;
    await updateServerStats(guild).catch(() => {});
  }
  opsHub.startCanoxInbox(c);
  eventHub.start(c);
  try {
    await reportHub.start(c);
    console.log('  → Report Hub privat siap menerima laporan member.');
  } catch (error) {
    console.error('[report] startup failed:', { code: error.code || 'STARTUP_FAILED' });
  }
  try {
    await moderationHub.start(c);
  } catch (error) {
    console.error('[moderation] startup failed:', { code: error.code || 'STARTUP_FAILED' });
  }
  const staleTranslationDirs = await translationService.cleanupStaleTempDirs();
  if (staleTranslationDirs > 0) {
    console.log(`🧹 ${staleTranslationDirs} folder sementara penerjemahan lama dibersihkan.`);
  }

  // ── Auto-rejoin voice channel terakhir (kalau sebelumnya bot di voice) ──────
  for (const guild of c.guilds.cache.values()) {
    if (!guildAccess.isHome(guild.id)) continue;
    const channelId = voiceStore.getVoiceChannel(guild.id);
    if (!channelId) continue;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) { voiceStore.clearVoiceChannel(guild.id); continue; }
    try {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: true,
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          connection.destroy();
          voiceStore.clearVoiceChannel(guild.id); // disconnect beneran → jangan auto-rejoin channel ini lagi
        }
      });
      console.log(`🔊 Auto-rejoined voice: ${channel.name}`);
      await postBotSettings(guild, `🔊 **Auto-rejoin voice**. Hengs balik ke **${channel.name}**, siap nemenin lagi! 💪`);
    } catch (e) {
      console.error('⚠️ Auto-rejoin voice gagal:', e.message);
      await postBotSettings(guild, `⚠️ Gagal auto-rejoin voice **${channel.name}**: \`${e.message}\``);
    }
  }
});

client.on(Events.GuildCreate, guild => {
  sendPublicGuildWelcome(guild, { guildAccess }).catch(() => {
    console.warn('[public-onboarding] PUBLIC_WELCOME_FAILED');
  });
});

// ── Welcome member baru ──────────────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async (member) => {
  const scope = guildAccess.classify(member.guild.id);
  if (scope.kind === 'public') {
    await communityPack.sendMemberEvent(member, 'welcome', scope.config);
    return;
  }
  if (scope.kind !== 'home') return;
  // Auto-role and stats remain operational even when the welcome channel is missing.
  await updateServerStats(member.guild).catch(() => {});
  await assignMemberRole(member, process.env.MEMBER_ROLE_ID);

  const channelId = process.env.WELCOME_CHANNEL_ID;
  if (!channelId) {
    console.warn('  WELCOME_CHANNEL_ID belum diisi; auto-role tetap berjalan tanpa welcome card.');
    return;
  }
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) {
    console.warn('  WELCOME_CHANNEL_ID tidak ditemukan; auto-role tetap berjalan tanpa welcome card.');
    return;
  }

  try {
    const cardBuffer = await generateCard(member, 'welcome');
    // Cari channel dari env ID, lalu fallback berdasarkan nama agar link selalu bisa diklik.
    const g = member.guild;
    const linkCh = (envId, ...names) => {
      let c = envId && g.channels.cache.get(envId);
      if (!c) c = g.channels.cache.find(x => x.isTextBased?.() && names.some(n => x.name.toLowerCase().includes(n)));
      return c ? `<#${c.id}>` : null;
    };
    const rulesCh = linkCh(process.env.RULES_CHANNEL_ID, 'rules');
    const rolesCh = linkCh(process.env.ROLES_CHANNEL_ID, 'get-roles', 'roles');
    const annCh   = linkCh(process.env.ANNOUNCE_CHANNEL_ID, 'announcement', 'announce');
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setDescription(
        `👋 Halo <@${member.id}>! Selamat datang di **${g.name}**! 🎉\n\n` +
        `📜 Baca dulu rules di ${rulesCh || '**#rules**'}\n` +
        `🎭 Ambil role kamu di ${rolesCh || '**#get-roles**'}\n` +
        `📢 Cek pengumuman di ${annCh || '**#announcements**'}\n\n` +
        `Butuh bantuan atau mau ngobrol? Tinggal **mention aku** (@Hengs Bot), atau coba \`/fun\` dan \`/study\`! 🤖`
      )
      .setTimestamp();

    if (cardBuffer) {
      const attachment = new AttachmentBuilder(cardBuffer, { name: 'welcome.png' });
      embed.setImage('attachment://welcome.png');
      await channel.send({ embeds: [embed], files: [attachment] });
    } else {
      embed.setTitle(`👋 Selamat datang, ${member.displayName}!`);
      embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
      embed.setFooter({ text: `Member ke-${member.guild.memberCount}` });
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('❌ Welcome card error:', err.message);
  }

});

// Leave message
client.on(Events.GuildMemberRemove, async (member) => {
  const scope = guildAccess.classify(member.guild.id);
  if (scope.kind === 'public') {
    await communityPack.sendMemberEvent(member, 'leave', scope.config);
    return;
  }
  if (scope.kind !== 'home') return;
  // Bisa ke channel sendiri (LEAVE_CHANNEL_ID), atau default ke welcome channel
  const channelId = process.env.LEAVE_CHANNEL_ID || process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  try {
    const cardBuffer = await generateCard(member, 'leave');
    const embed = new EmbedBuilder()
      .setColor(0xE53935)
      .setDescription(`**${member.user.username}** telah meninggalkan server. Sampai jumpa! 👋`)
      .setTimestamp();

    if (cardBuffer) {
      const attachment = new AttachmentBuilder(cardBuffer, { name: 'leave.png' });
      embed.setImage('attachment://leave.png');
      await channel.send({ embeds: [embed], files: [attachment] });
    } else {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('❌ Leave card error:', err.message);
  }

  // Update stats
  await updateServerStats(member.guild).catch(() => {});
});

// Boost celebration
// Hengs ngucapin pas ada member mulai nge-boost server
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (!guildAccess.isHome(newMember.guild.id)) return;
  if (oldMember.premiumSince || !newMember.premiumSince) return; // cuma pas BARU mulai boost
  const g = newMember.guild;
  const findCh = (envId, ...names) => {
    let c = envId && g.channels.cache.get(envId);
    if (!c) c = g.channels.cache.find(x => x.isTextBased?.() && names.some(n => x.name.toLowerCase().includes(n)));
    return c;
  };
  const channel = findCh(process.env.ANNOUNCE_CHANNEL_ID, 'announcement', 'announce')
    || findCh(process.env.WELCOME_CHANNEL_ID, 'welcome');
  if (!channel) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(0xF47FFF)
      .setTitle('💜 SERVER BOOST!')
      .setDescription(`Makasih banyak <@${newMember.id}> udah nge-**boost** ${g.name}! 🚀✨\n\nKamu bikin server makin kece. Big love! 💜`)
      .setThumbnail(newMember.user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: `Total boost server: ${g.premiumSubscriptionCount || 0}` })
      .setTimestamp();
    await channel.send({ content: `<@${newMember.id}>`, embeds: [embed] });
    console.log(`💜 Boost dari ${newMember.user.username}`);
  } catch (err) {
    console.error('❌ Boost message error:', err.message);
  }
});

// ── AI Chat via mention ──────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;
  const messageScope = guildAccess.classify(msg.guildId);
  if (messageScope.kind === 'home') {
    try {
      const moderationMatched = await moderationHub.handleMessage(msg);
      if (moderationMatched) return;
    } catch (error) {
      console.error('[moderation] message failed:', { code: error.code || 'MESSAGE_FAILED' });
    }
  }
  if (messageScope.kind !== 'home' && messageScope.kind !== 'public') return;
  if (!msg.mentions.has(client.user)) return;
  if (messageScope.kind === 'public' && !isPublicChannelAllowed(messageScope.config, msg.channelId)) {
    await msg.reply({
      content: 'Hengs hanya dapat menjawab di channel yang dipilih pengelola server.',
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Bersihkan mention dari teks
  const text = msg.content
    .replace(/<@!?\d+>/g, '')
    .trim();

  if (!text) {
    await msg.reply({
      content: 'Ada yang bisa aku bantu? Tulis apa yang mau kamu tanya 😊',
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (text.length > MAX_PROMPT_LENGTH) {
    await msg.reply({
      content: `Prompt terlalu panjang. Batasnya ${MAX_PROMPT_LENGTH} karakter supaya Hengs tetap fokus.`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const promptRoute = resolvePrompt({
    prompt: text,
    scopeKind: messageScope.kind,
    actor: msg,
    guild: msg.guild,
  });
  if (promptRoute.handled) {
    if (promptRoute.kind === 'ops_draft' || promptRoute.kind === 'event_draft') {
      try {
        if (promptRoute.kind === 'ops_draft') {
          const generated = await agent.draftAnnouncement(promptRoute.brief, promptRoute.titleOverride);
          const result = await opsHub.createDraftPanel(msg.guild, {
            ...generated,
            brief: promptRoute.brief,
            source: 'discord',
            createdBy: msg.author.id,
            externalId: `prompt-ops:${msg.id}`,
          });
          await msg.reply({
            content: result.created
              ? 'Draft pengumuman privat sudah masuk ke `bot-settings`. Review di sana, lalu owner yang memutuskan publish atau jadwal.'
              : 'Draft dari prompt ini sudah pernah dibuat.',
            allowedMentions: { parse: [] },
          });
          return;
        }

        const schedule = parseScheduleInput(promptRoute.scheduleInput);
        const result = await eventHub.createDraftPanel(msg.guild, {
          title: promptRoute.title,
          description: promptRoute.description,
          startAt: schedule.scheduledAt,
          location: promptRoute.location,
          capacity: promptRoute.capacity,
          source: 'discord',
          createdBy: msg.author.id,
          externalId: `prompt-event:${msg.id}`,
        });
        await msg.reply({
          content: result.created
            ? 'Draft event privat sudah masuk ke `bot-settings`. Belum dipublikasikan.'
            : 'Draft event dari prompt ini sudah pernah dibuat.',
          allowedMentions: { parse: [] },
        });
      } catch {
        console.error(promptRoute.kind === 'ops_draft'
          ? '[prompt-operations] OPS_DRAFT_FAILED'
          : '[prompt-operations] EVENT_DRAFT_FAILED');
        await msg.reply({
          content: promptRoute.kind === 'ops_draft'
            ? 'Draft pengumuman belum bisa dibuat. Pastikan channel `bot-settings` tersedia, lalu coba lagi.'
            : 'Draft event belum bisa dibuat. Cek format waktu WIB dan pastikan channel `bot-settings` tersedia.',
          allowedMentions: { parse: [] },
        }).catch(() => {});
      }
      return;
    }
    const content = promptRoute.kind === 'community_plan'
      ? 'Rancangan struktur server dibuat privat. Pakai `/hengs ask` dengan prompt yang sama supaya preview dan konfirmasi tidak terlihat member lain.'
      : promptRoute.kind === 'focus_action'
        ? applyFocusAction({ route: promptRoute, state })
        : promptRoute.content;
    await msg.reply({
      content,
      allowedMentions: { parse: [] },
    });
    return;
  }

  let lease = null;
  let insightClaim = null;
  if (messageScope.kind === 'public') {
    const admission = publicTrafficGuard.acquire(msg.guildId);
    if (!admission.ok) {
      try {
        publicInsightsStore.recordRejection(msg.guildId, admission.code);
      } catch {
        console.error('[public-insights] PUBLIC_INSIGHTS_WRITE_FAILED');
      }
      const content = admission.code === 'PUBLIC_GUILD_BUSY'
        ? 'Aku masih menjawab pesan lain di server ini. Coba lagi sebentar ya.'
        : 'Batas chat Hengs untuk server ini sedang penuh. Coba lagi beberapa menit lagi.';
      await msg.reply({ content, allowedMentions: { parse: [] } });
      return;
    }
    lease = admission;
    try {
      insightClaim = publicInsightsStore.claimAccepted(msg.guildId);
    } catch {
      console.error('[public-insights] PUBLIC_INSIGHTS_WRITE_FAILED');
      lease.release();
      lease = null;
      await msg.reply({
        content: 'Data penggunaan Hengs belum bisa diperbarui. Aku tidak akan memakai layanan AI dulu. Coba lagi nanti ya.',
        allowedMentions: { parse: [] },
      });
      return;
    }
    if (!insightClaim.ok) {
      lease.release();
      lease = null;
      await msg.reply({
        content: 'Batas harian Hengs untuk server ini sudah habis. Coba lagi besok setelah pukul 00.00 UTC.',
        allowedMentions: { parse: [] },
      });
      return;
    }
  }

  try {
    // Typing indicator biar keliatan lagi "mikir"
    await msg.channel.sendTyping();
    const conversationKey = agent.buildConversationKey(msg.guildId, msg.author.id);
    const reply = await agent.chat(text, conversationKey, {
      kind: messageScope.kind,
      replyStyle: messageScope.config?.settings?.replyStyle || 'balanced',
      language: messageScope.config?.settings?.language || 'auto',
    });
    // Discord max 2000 karakter per pesan
    await msg.reply({
      content: reply.substring(0, 2000),
      components: messageScope.kind === 'public'
        ? buildPublicFeedbackComponents({
          requestId: insightClaim.requestId,
          requesterId: msg.author.id,
        })
        : [],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    if (messageScope.kind === 'public') console.error('[public-ai] PUBLIC_AI_FAILED');
    else console.error('❌ AI error:', err.message);
    await msg.reply({
      content: 'Aduh, lagi error nih. Coba lagi nanti! 🙏',
      allowedMentions: { parse: [] },
    }).catch(() => {});
  } finally {
    if (lease) lease.release();
  }
});

// ── Slash command handler ─────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  const interactionScope = guildAccess.classify(interaction.guildId);
  if (interaction.isButton() && String(interaction.customId || '').startsWith('hengs-prompt:')) {
    try {
      await handlePromptReviewComponent(interaction, {
        guildAccess,
        botUserId: client.user?.id,
        applyPlan: applyCommunityPlan,
      });
    } catch (error) {
      console.error('[prompt-review] PROMPT_REVIEW_COMPONENT_FAILED', { code: error.code || 'COMPONENT_FAILED' });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Preview belum bisa diproses. Coba buat rancangan baru ya.',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        }).catch(() => {});
      }
    }
    return;
  }
  if (interaction.isAutocomplete()) {
    if (interactionScope.kind !== 'home') {
      await interaction.respond([]).catch(() => {});
      return;
    }
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd?.autocomplete) {
      await interaction.respond([]).catch(() => {});
      return;
    }
    try {
      await cmd.autocomplete(interaction);
    } catch (error) {
      console.error(`Autocomplete /${interaction.commandName} gagal:`, error.message);
      await interaction.respond([]).catch(() => {});
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('hengs-feedback:')) {
    try {
      await handlePublicFeedback(interaction, {
        botUserId: client.user?.id,
        guildAccess,
        publicInsightsStore,
      });
    } catch {
      console.error('[public-feedback] PUBLIC_FEEDBACK_FAILED');
      const payload = {
        content: 'Feedback belum dapat dicatat. Coba lagi nanti ya.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
    return;
  }

  if (setupCommand.handleSetupComponent && String(interaction.customId || '').startsWith('hengs-setup:')) {
    try {
      const handled = await setupCommand.handleSetupComponent(interaction, {
        guildAccess,
        guildConfigStore,
        communityPack,
        publicGuildLimit,
        publicInsightsStore,
      });
      if (handled) return;
    } catch {
      console.error('[public-setup] PUBLIC_SETUP_COMPONENT_FAILED');
      const payload = {
        content: 'Setup belum dapat disimpan. Coba jalankan `/setup start` lagi ya.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
      return;
    }
  }

  if (!interaction.isChatInputCommand() && interactionScope.kind !== 'home') return;

  if (interaction.isButton() && interaction.customId.startsWith('mod:')) {
    try {
      await moderationHub.handleComponent(interaction);
    } catch (error) {
      console.error('[moderation] component failed:', { code: error.code || 'COMPONENT_FAILED' });
    }
    return;
  }

  if (
    (interaction.isButton() || interaction.isModalSubmit())
    && (
      interaction.customId.startsWith('report:')
      || interaction.customId.startsWith('reports:')
    )
  ) {
    try {
      await routeReportComponent(interaction, reportHub, reportQueue);
    } catch (error) {
      console.error('[report] component failed:', { code: error.code || 'COMPONENT_FAILED' });
      const payload = {
        content: 'Aksi laporan gagal dijalankan.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
    return;
  }

  if (
    (interaction.isButton() || interaction.isModalSubmit())
    && interaction.customId.startsWith('ops:')
  ) {
    try {
      if (interaction.isButton()) await opsHub.handleButton(interaction, { agent });
      else await opsHub.handleModal(interaction);
    } catch (err) {
      console.error('❌ Ops Hub interaction error:', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ Aksi Ops Hub gagal dijalankan.', ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Aksi Ops Hub gagal dijalankan.', ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  if (
    (interaction.isButton() || interaction.isModalSubmit())
    && interaction.customId.startsWith('event:')
  ) {
    try {
      if (interaction.isButton()) await eventHub.handleButton(interaction);
      else await eventHub.handleModal(interaction);
    } catch (err) {
      console.error('Event Hub interaction error:', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'Aksi Event Hub gagal dijalankan.', flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: 'Aksi Event Hub gagal dijalankan.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interactionScope.kind !== 'home' && !PUBLIC_COMMANDS.has(interaction.commandName)) {
    await interaction.reply({
      content: 'Command ini belum tersedia di Hengs Public Beta.',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Restrict commands ke BOT_CHANNEL_ID
  // Admin bypass: kalau punya permission Administrator → bisa dari channel manapun (bot-settings, dll)
  // Regular user: harus di BOT_CHANNEL_ID, kecuali command dengan guard sendiri.
  const botChannelId = process.env.BOT_CHANNEL_ID;
  const freeCommands = ['announce', 'admin', 'translate', 'ops', 'event', 'report', 'reports', 'mod'];
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  if (interactionScope.kind === 'home' && botChannelId && !isAdmin && interaction.channelId !== botChannelId && !freeCommands.includes(interaction.commandName)) {
    await interaction.reply({
      content: `❌ Command hanya bisa dipakai di <#${botChannelId}>!`,
      ephemeral: true,
    });
    return;
  }

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) {
    await interaction.reply({ content: '❌ Command tidak ditemukan.', ephemeral: true });
    return;
  }

  try {
    await cmd.execute(interaction, {
      state,
      agent,
      opsHub,
      eventHub,
      reportHub,
      reportQueue,
      moderationHub,
      translation: translationService,
      runtimeHealth,
      version: packageMetadata.version,
      clientId: process.env.DISCORD_CLIENT_ID,
      guildAccess,
      guildConfigStore,
      communityPack,
      publicGuildLimit,
      publicInsightsStore,
      publicTrafficGuard,
    });
  } catch (err) {
    if (PUBLIC_COMMANDS.has(interaction.commandName)) {
      console.error('[public-command] PUBLIC_COMMAND_FAILED');
    } else if (interaction.commandName === 'reports') {
      console.error('[reports] command failed:', { code: err.code || 'COMMAND_FAILED' });
    } else {
      console.error(`❌ Error di /${interaction.commandName}:`, err);
    }
    const errMsg = {
      content: '❌ Ada error saat menjalankan command ini.',
      allowedMentions: { parse: [] },
    };
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(errMsg).catch(() => {});
    } else if (interaction.replied) {
      await interaction.followUp({ ...errMsg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ ...errMsg, ephemeral: true }).catch(() => {});
    }
  }
});

// ── Reaction Roles ─────────────────────────────────────────────────────────
async function handleReaction(reaction, user, add) {
  if (user.bot) return;
  if (!guildAccess.isHome(reaction.message.guildId)) return;

  // Fetch partial reactions/messages
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }

  const mapping = roleStore.getMessageRoles(reaction.message.id);
  if (!mapping) return;

  const emoji = reaction.emoji.name;
  const roleId = mapping.roles[emoji];
  if (!roleId) return;

  const guild  = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  try {
    if (add) {
      await member.roles.add(roleId);
      console.log(`  ✅ Role added: ${guild.roles.cache.get(roleId)?.name} → ${user.username}`);
    } else {
      await member.roles.remove(roleId);
      console.log(`  ➖ Role removed: ${guild.roles.cache.get(roleId)?.name} → ${user.username}`);
    }
  } catch (err) {
    console.error('❌ Role error:', err.message);
  }
}

client.on(Events.MessageReactionAdd,    (r, u) => handleReaction(r, u, true));
client.on(Events.MessageReactionRemove, (r, u) => handleReaction(r, u, false));

// ── Login ────────────────────────────────────────────────────────────────────
console.log('🚀 Starting Discord Bot...\n');
client.login(process.env.DISCORD_TOKEN).catch(error => {
  fatalExit('LOGIN_FAILED', error);
});
