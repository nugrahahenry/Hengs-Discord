// ─── index.js ─────────────────────────────────────────────────────────────
// Discord Bot Henzzz — entry point
//
// Cara pakai:
// 1. Isi .env (DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, dll)
// 2. npm install
// 3. npm run deploy  ← register slash commands (sekali saja)
// 4. npm start       ← jalankan bot

require('dotenv').config();
const {
  Client, GatewayIntentBits, Collection, Partials,
  Events, EmbedBuilder, PermissionFlagsBits, ActivityType,
} = require('discord.js');
const fs   = require('node:fs');
const path = require('node:path');
const agent = require('./agent');
const state = require('./state');
const { generateCard } = require('./utils/welcome-card');
const { AttachmentBuilder } = require('discord.js');
const roleStore = require('./utils/role-store');
const voiceStore = require('./utils/voice-store');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const opsHub = require('./ops/hub');
const translationService = require('./translation/service');

// Satu proses saja boleh memakai token Discord + Ops state yang sama. Selain mencegah
// event dobel, ini menutup kemungkinan dua instance mem-publish draft yang sama.
const INSTANCE_LOCK = path.join(__dirname, '..', '.dc-bot.lock');
function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
function acquireInstanceLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(INSTANCE_LOCK, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const oldPid = Number.parseInt(fs.readFileSync(INSTANCE_LOCK, 'utf8').trim(), 10);
      if (oldPid && oldPid !== process.pid && isPidAlive(oldPid)) {
        console.error(`\n🔒 Hengs Discord sudah berjalan (PID ${oldPid}). Instance kedua dihentikan.\n`);
        process.exit(0);
      }
      fs.rmSync(INSTANCE_LOCK, { force: true });
    }
  }
  throw new Error('Gagal memperoleh single-instance lock Hengs Discord.');
}
function releaseInstanceLock() {
  try {
    const ownerPid = Number.parseInt(fs.readFileSync(INSTANCE_LOCK, 'utf8').trim(), 10);
    if (ownerPid === process.pid) fs.rmSync(INSTANCE_LOCK, { force: true });
  } catch {}
}
acquireInstanceLock();
process.on('exit', releaseInstanceLock);

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
// Discord rate limit: 2 rename per channel per 10 menit — tidak boleh terlalu sering
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
  console.log(`   ID  : ${c.user.id}`);
  console.log(`   Server: ${c.guilds.cache.map(g => g.name).join(', ')}`);
  console.log('─────────────────────────────────────');
  console.log('Slash commands tersedia:');
  console.log('  /study on [topic] | /study off | /study status');
  console.log('  /scrim on [game]  | /scrim off');
  console.log('  /announce [message]');
  console.log('  /fun quote | /fun 8ball | /fun roll | /fun flip | /fun meme');
  console.log('  /ops draft | /translate file');
  console.log('  Mention bot untuk AI chat!');
  console.log('─────────────────────────────────────\n');

  // Mode mulai OFF — aktifkan manual via /study on atau /scrim on
  // (tidak auto-study seperti WA bot, Discord bot dipakai lebih sosial)

  // Status bot — biar keliatan cara minta bantuan
  c.user.setPresence({
    activities: [{ name: 'mention aku buat ngobrol 🤖 | /fun', type: ActivityType.Listening }],
    status: 'online',
  });

  // Update server stats sekali saat bot nyala
  for (const guild of c.guilds.cache.values()) {
    await updateServerStats(guild).catch(() => {});
  }
  opsHub.startCanoxInbox(c);
  const staleTranslationDirs = await translationService.cleanupStaleTempDirs();
  if (staleTranslationDirs > 0) {
    console.log(`🧹 ${staleTranslationDirs} folder sementara penerjemahan lama dibersihkan.`);
  }

  // ── Auto-rejoin voice channel terakhir (kalau sebelumnya bot di voice) ──────
  for (const guild of c.guilds.cache.values()) {
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
      await postBotSettings(guild, `🔊 **Auto-rejoin voice** — Hengs balik ke **${channel.name}**, siap nemenin lagi! 💪`);
    } catch (e) {
      console.error('⚠️ Auto-rejoin voice gagal:', e.message);
      await postBotSettings(guild, `⚠️ Gagal auto-rejoin voice **${channel.name}**: \`${e.message}\``);
    }
  }
});

// ── Welcome member baru ──────────────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async (member) => {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  try {
    const cardBuffer = await generateCard(member, 'welcome');
    // Cari channel by env ID, fallback by nama → biar selalu nge-link (clickable)
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
        `Butuh bantuan atau mau ngobrol? Tinggal **mention aku** (@Hengs Bot) ya — atau coba \`/fun\` & \`/study\`! 🤖`
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

  // Update stats
  await updateServerStats(member.guild).catch(() => {});

  // Auto-assign Member role on join — by ID (kalau di-set) atau by nama "Member"
  const memberRoleId = process.env.MEMBER_ROLE_ID;
  const memberRole = (memberRoleId && member.guild.roles.cache.get(memberRoleId))
    || member.guild.roles.cache.find(r => r.name.toLowerCase().replace(/[^a-z]/g, '').includes('member'));
  if (memberRole) {
    await member.roles.add(memberRole)
      .then(() => console.log(`  ✅ Role "${memberRole.name}" → ${member.user.username}`))
      .catch(err => console.error(`  ❌ Gagal kasih role Member: ${err.message} — cek: bot punya izin "Manage Roles" & role BOT harus di ATAS role Member`));
  } else {
    console.log('  ⚠️ Role "Member" nggak ketemu. Bikin role bernama "Member", atau isi MEMBER_ROLE_ID di .env');
  }
});

// ── Leave message ─────────────────────────────────────────────────────────────
client.on(Events.GuildMemberRemove, async (member) => {
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

// ── Boost celebration ─────────────────────────────────────────────────────────
// Hengs ngucapin pas ada member mulai nge-boost server
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
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
      .setDescription(`Makasih banyak <@${newMember.id}> udah nge-**boost** ${g.name}! 🚀✨\n\nKamu bikin server makin kece — big love! 💜`)
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
  if (!msg.mentions.has(client.user)) return;

  // Bersihkan mention dari teks
  const text = msg.content
    .replace(/<@!?\d+>/g, '')
    .trim();

  if (!text) {
    await msg.reply('Ada yang bisa aku bantu? Tulis apa yang mau kamu tanya 😊');
    return;
  }

  // Typing indicator biar keliatan lagi "mikir"
  await msg.channel.sendTyping();

  try {
    const reply = await agent.chat(text, msg.author.id);
    // Discord max 2000 karakter per pesan
    await msg.reply(reply.substring(0, 2000));
  } catch (err) {
    console.error('❌ AI error:', err.message);
    await msg.reply('Aduh, lagi error nih. Coba lagi nanti! 🙏');
  }
});

// ── Slash command handler ─────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
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

  if (interaction.isButton() && interaction.customId.startsWith('ops:')) {
    try {
      await opsHub.handleButton(interaction);
    } catch (err) {
      console.error('❌ Ops Hub button error:', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ Aksi Ops Hub gagal dijalankan.', ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Aksi Ops Hub gagal dijalankan.', ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // Restrict commands ke BOT_CHANNEL_ID
  // Admin bypass: kalau punya permission Administrator → bisa dari channel manapun (bot-settings, dll)
  // Regular user: harus di BOT_CHANNEL_ID, kecuali command dengan guard sendiri.
  const botChannelId = process.env.BOT_CHANNEL_ID;
  const freeCommands = ['announce', 'admin', 'translate'];
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  if (botChannelId && !isAdmin && interaction.channelId !== botChannelId && !freeCommands.includes(interaction.commandName)) {
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
    await cmd.execute(interaction, { state, agent, opsHub });
  } catch (err) {
    console.error(`❌ Error di /${interaction.commandName}:`, err);
    const errMsg = { content: '❌ Ada error saat menjalankan command ini.', ephemeral: true };
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: errMsg.content }).catch(() => {});
    } else if (interaction.replied) {
      await interaction.followUp(errMsg).catch(() => {});
    } else {
      await interaction.reply(errMsg).catch(() => {});
    }
  }
});

// ── Reaction Roles ─────────────────────────────────────────────────────────
async function handleReaction(reaction, user, add) {
  if (user.bot) return;

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
client.login(process.env.DISCORD_TOKEN);
