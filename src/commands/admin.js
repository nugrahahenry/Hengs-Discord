// ─── /admin ───────────────────────────────────────────────────────────────
const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const roleStore = require('../utils/role-store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands (Administrator only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Auto-create server channels with emoji icons (English, organized)')
    )

    .addSubcommand(sub => sub
      .setName('webhook')
      .setDescription('Create a webhook in this channel and show its URL')
      .addStringOption(opt => opt
        .setName('name').setDescription('Webhook name').setRequired(false)
      )
    )

    .addSubcommand(sub => sub
      .setName('rolereact')
      .setDescription('Create a reaction-role message (react = get role)')
      .addStringOption(opt => opt
        .setName('title').setDescription('Title of the role selection message').setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('roles')
        .setDescription('Format: emoji:RoleName,emoji:RoleName. Contoh: 🎮:Gamer,⭐:Member,🎨:Artist')
        .setRequired(true)
      )
    )

    .addSubcommand(sub => sub
      .setName('lockdown')
      .setDescription('Lock a channel (deny @everyone from sending messages)')
      .addChannelOption(opt => opt
        .setName('channel').setDescription('Channel to lock (default: current)').setRequired(false)
      )
    )

    .addSubcommand(sub => sub
      .setName('ids')
      .setDescription('Scan server dan output channel IDs untuk .env (tanpa bikin channel baru)')
    )

    .addSubcommand(sub => sub
      .setName('rules')
      .setDescription('Post embed peraturan server (otomatis ke channel rules)')
    )

    .addSubcommand(sub => sub
      .setName('serverinfo')
      .setDescription('Post embed info server (otomatis ke channel server-info)')
    )

    .addSubcommand(sub => sub
      .setName('getroles')
      .setDescription('Bikin role self-assign (Gamer/Developer/Artist/Student) + post reaction roles')
    )

    .addSubcommand(sub => sub
      .setName('restart')
      .setDescription('Restart bot biar load update terbaru (online lagi ~5 detik)')
    ),

  async execute(interaction, { state }) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    // ── /admin setup ───────────────────────────────────────────────────────
    if (sub === 'setup') {
      const guild = interaction.guild;
      const everyone = guild.roles.everyone;
      const created = [];
      const skipped = [];

      async function ensureCat(name) {
        // 1. Exact match
        const ex = guild.channels.cache.find(c => c.name === name && c.type === ChannelType.GuildCategory);
        if (ex) { skipped.push(`[${name}]`); return ex; }

        // 2. Fuzzy: strip emoji prefix, match by keyword
        // "🔒 PRIVATE" → keyword "private", cocok dengan "PRIVATE", "🔐 PRIVATE", dll
        const normCat = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const keyword = normCat(name);
        const fuzzy = guild.channels.cache.find(c =>
          c.type === ChannelType.GuildCategory &&
          normCat(c.name).includes(keyword.split(' ').filter(w => w.length > 2).join(' '))
        );
        if (fuzzy) {
          if (fuzzy.name !== name) await fuzzy.setName(name).catch(() => {});
          skipped.push(`[${name}] ✏️`);
          return fuzzy;
        }

        const c = await guild.channels.create({ name, type: ChannelType.GuildCategory });
        created.push(`[${name}]`);
        return c;
      }

      async function ensureCh(name, type, parentId, overrides = [], extra = {}) {
        // 1. Exact match di kategori yang benar
        let ex = guild.channels.cache.find(c => c.name === name && c.parentId === parentId);
        if (ex) { skipped.push(`#${name}`); return ex; }

        // 2. Fuzzy keyword match untuk menangani semua format emoji prefix
        // "📌・welcome", "⚓welcome", "⚓ welcome", "welcome" → keyword = "welcome"
        const keyword = name.includes('・')
          ? name.split('・').pop().toLowerCase()
          : name.toLowerCase().replace(/^[^a-z0-9]+/, '');
        const norm = s => s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const normKeyword = norm(keyword);

        // Cari di kategori yang sama dulu (Henry punya emoji beda tapi keyword sama)
        const inCat = guild.channels.cache.find(c =>
          c.parentId === parentId && c.type === type &&
          norm(c.name).includes(normKeyword)
        );
        if (inCat) {
          if (inCat.name !== name) await inCat.setName(name).catch(() => {});
          skipped.push(`#${name} ✏️`);
          return inCat;
        }

        // Cari di seluruh server (Henry bikin di luar kategori)
        const anywhere = guild.channels.cache.find(c =>
          c.type === type && norm(c.name).includes(normKeyword)
        );
        if (anywhere) {
          if (anywhere.name !== name) await anywhere.setName(name).catch(() => {});
          await anywhere.setParent(parentId, { lockPermissions: false }).catch(() => {});
          created.push(`#${name} ↪️`);
          return anywhere;
        }

        // Buat baru
        const ch = await guild.channels.create({
          name, type, parent: parentId,
          permissionOverwrites: overrides,
          ...extra,
        });
        created.push(`#${name}`);
        return ch;
      }

      // Stats channels memakai VOICE channel supaya nama bisa memakai spasi, huruf besar, dan kolon.
      // Connect: false → orang tidak bisa join, tapi bisa lihat nama (= stat display)
      // Ini cara standar semua stat bot (MEE6, Statbot, dll)
      const statOverrides = [{ id: everyone, deny: ['Connect'] }];

      // alsoMatch: prefix lama untuk migrasi (rename otomatis)
      async function ensureStatCh(prefix, fullName, parentId, alsoMatch = []) {
        const allPrefixes = [prefix, ...alsoMatch];
        const existing = guild.channels.cache.find(c =>
          allPrefixes.some(p => c.name.startsWith(p))
        );
        if (existing) {
          if (existing.type === ChannelType.GuildText) {
            // Text channel lama → delete, buat ulang sebagai voice
            await existing.delete().catch(() => {});
          } else {
            // Voice channel → rename dan pindah ke kategori yang benar
            if (existing.name !== fullName) await existing.setName(fullName).catch(() => {});
            if (existing.parentId !== parentId) await existing.setParent(parentId, { lockPermissions: false }).catch(() => {});
            skipped.push(`${prefix} ✏️`);
            return existing;
          }
        }
        const ch = await guild.channels.create({
          name: fullName, type: ChannelType.GuildVoice, parent: parentId,
          permissionOverwrites: statOverrides,
          userLimit: 0,
        });
        created.push(fullName);
        return ch;
      }

      // Permission templates
      const readOnly  = [{ id: everyone, deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads'] }];
      const adminOnly = [{ id: everyone, deny: ['ViewChannel'] }];

      try {
        // ══════════════════════════════════════════════════════════════════
        // 📊 SERVER STATS: gembok (locked text), posisi paling atas
        // Format: "All Members: X" / "Members: X" / "Bots: X"
        // updateServerStats di index.js juga pakai prefix yang sama
        // ══════════════════════════════════════════════════════════════════
        const catStats = await ensureCat('📊 SERVER STATS');
        await guild.channels.cache.get(catStats.id)?.setPosition(0).catch(() => {});
        const memberCount = guild.memberCount;
        const botCount    = guild.members.cache.filter(m => m.user.bot).size;
        const humanCount  = memberCount - botCount;
        // alsoMatch: migrate nama lama kalau ada ('Humans:' → 'Members:', 'Members:' → 'All Members:')
        await ensureStatCh('👥・All Members:', `👥・All Members: ${memberCount}`, catStats.id, ['👥・Members:']);
        await ensureStatCh('👤・Members:',     `👤・Members: ${humanCount}`,      catStats.id, ['👤・Humans:']);
        await ensureStatCh('🤖・Bots:',        `🤖・Bots: ${botCount}`,           catStats.id);

        // ══════════════════════════════════════════════════════════════════
        // 🌟 WELCOME: read-only, welcome card landing + rules + get-roles
        // Icons: 🌊 welcome (wave), 📜 rules (scroll), 📌 server-info, 🎭 get-roles
        // ══════════════════════════════════════════════════════════════════
        const catWelcome = await ensureCat('🌟 WELCOME');
        await guild.channels.cache.get(catWelcome.id)?.setPosition(1).catch(() => {});
        const chWelcome = await ensureCh('🌊・welcome', ChannelType.GuildText, catWelcome.id, readOnly,
          { topic: 'Selamat datang! Welcome card muncul di sini 👋' });
        await ensureCh('📜・rules',       ChannelType.GuildText, catWelcome.id, readOnly,
          { topic: 'Baca rules sebelum ngobrol ya!' });
        await ensureCh('📌・server-info', ChannelType.GuildText, catWelcome.id, readOnly,
          { topic: 'Info penting tentang server ini' });
        await ensureCh('🎭・get-roles',   ChannelType.GuildText, catWelcome.id, readOnly,
          { topic: 'React di sini untuk dapetin role kamu!' });

        // ══════════════════════════════════════════════════════════════════
        // 📢 ANNOUNCEMENTS: read-only
        // ══════════════════════════════════════════════════════════════════
        const catAnn = await ensureCat('📢 ANNOUNCEMENTS');
        const chAnn  = await ensureCh('📢・announcements',    ChannelType.GuildText, catAnn.id, readOnly,
          { topic: 'Pengumuman resmi server' });
        await ensureCh('🎉・events',          ChannelType.GuildText, catAnn.id, readOnly,
          { topic: 'Event dan aktivitas mendatang' });
        await ensureCh('📡・gsa-feed',        ChannelType.GuildText, catAnn.id, readOnly,
          { topic: 'Google Student Ambassador feed' });
        const chGsa  = await ensureCh('🏆・gsa-announcements', ChannelType.GuildText, catAnn.id, readOnly,
          { topic: 'Pengumuman Google Student Ambassador' });

        // ══════════════════════════════════════════════════════════════════
        // 💬 COMMUNITY: free chat
        // "ngobrol" bukan "general", nama khas server Henzzz
        // ══════════════════════════════════════════════════════════════════
        const catChat = await ensureCat('💬 COMMUNITY');
        await ensureCh('💬・ngobrol',       ChannelType.GuildText, catChat.id,
          [], { topic: 'Ngobrol bebas, boleh bahas apa aja!' });
        await ensureCh('👋・introductions', ChannelType.GuildText, catChat.id,
          [], { topic: 'Kenalin diri kamu ke server!' });

        // ══════════════════════════════════════════════════════════════════
        // 🎮 GAMING: main, LFG, highlights
        // ══════════════════════════════════════════════════════════════════
        const catGame = await ensureCat('🎮 GAMING');
        await ensureCh('🎮・game-chat',  ChannelType.GuildText, catGame.id,
          [], { topic: 'Obrolan gaming umum' });
        await ensureCh('👥・lfg',        ChannelType.GuildText, catGame.id,
          [], { topic: 'Looking for group, cari teman main di sini!' });
        await ensureCh('🎬・highlights', ChannelType.GuildText, catGame.id,
          [], { topic: 'Share clip dan momen terbaikmu!' });

        // ══════════════════════════════════════════════════════════════════
        // 💻 TECH & CODE
        // ══════════════════════════════════════════════════════════════════
        const catTech = await ensureCat('💻 TECH & CODE');
        await ensureCh('💻・tech-chat',   ChannelType.GuildText, catTech.id,
          [], { topic: 'Obrolan teknologi dan IT' });
        await ensureCh('🔧・coding-help', ChannelType.GuildText, catTech.id,
          [], { topic: 'Tanya jawab coding, debugging, dll' });
        await ensureCh('📚・resources',   ChannelType.GuildText, catTech.id,
          [], { topic: 'Link, tutorial, dan resource berguna' });
        await ensureCh('🚀・projects',    ChannelType.GuildText, catTech.id,
          [], { topic: 'Pamerkan project dan build kamu!' });

        // ══════════════════════════════════════════════════════════════════
        // 🤖 BOT CENTER: Henzzz Bot + bot lain
        // ══════════════════════════════════════════════════════════════════
        const catBot = await ensureCat('🤖 BOT CENTER');
        const chBot  = await ensureCh('🤖・bot-commands', ChannelType.GuildText, catBot.id,
          [], { topic: 'Henzzz Bot: /study /scrim /voice /fun /admin' });
        await ensureCh('🐾・owo-bot',      ChannelType.GuildText, catBot.id,
          [], { topic: 'OwO Bot: hunt, battle, dan lainnya!' });
        await ensureCh('✨・lumina-bot',   ChannelType.GuildText, catBot.id,
          [], { topic: 'Lumina Bot commands' });
        await ensureCh('🔧・carl-bot',     ChannelType.GuildText, catBot.id,
          [], { topic: 'Carl-bot commands' });
        await ensureCh('📋・bot-logs',     ChannelType.GuildText, catBot.id,
          readOnly, { topic: 'Log aktivitas bot otomatis' });
        await ensureCh('⚙️・bot-status',  ChannelType.GuildText, catBot.id,
          readOnly, { topic: 'Status bot dan uptime' });
        await ensureCh('🎛️・bot-settings',ChannelType.GuildText, catBot.id,
          adminOnly, { topic: 'Konfigurasi bot, admin only' });

        // ══════════════════════════════════════════════════════════════════
        // 🔒 PRIVATE: hidden dari @everyone, hanya admin/owner
        // photo, admin-chat, mod-logs
        // ══════════════════════════════════════════════════════════════════
        const catPrivate = await ensureCat('🔒 PRIVATE');
        // Set kategori private agar semua channel di dalamnya otomatis hidden.
        await guild.channels.cache.get(catPrivate.id)?.permissionOverwrites
          .edit(everyone, { ViewChannel: false }).catch(() => {});
        await ensureCh('📷・photo',       ChannelType.GuildText, catPrivate.id, adminOnly,
          { topic: 'Foto-foto pribadi' });
        await ensureCh('🔒・admin-chat',  ChannelType.GuildText, catPrivate.id, adminOnly,
          { topic: 'Admin discussion' });
        await ensureCh('📊・mod-logs',    ChannelType.GuildText, catPrivate.id, adminOnly,
          { topic: 'Log moderasi server' });

        // ══════════════════════════════════════════════════════════════════
        // 🔊 VOICE: channel suara
        // ══════════════════════════════════════════════════════════════════
        const catVoice = await ensureCat('🔊 VOICE');
        await ensureCh('⭐・Hengs',   ChannelType.GuildVoice, catVoice.id);
        await ensureCh('🔊・General', ChannelType.GuildVoice, catVoice.id);
        await ensureCh('🎮・Gaming',  ChannelType.GuildVoice, catVoice.id);
        await ensureCh('🎵・Music',   ChannelType.GuildVoice, catVoice.id);
        await ensureCh('📚・Study',   ChannelType.GuildVoice, catVoice.id);

        // ── Create GSA webhook (sekali, skip kalau sudah ada) ──────────────
        let gsaWebhookUrl = null;
        try {
          const gch = guild.channels.cache.find(c => c.name === '🏆・gsa-announcements');
          if (gch) {
            const existing = await gch.fetchWebhooks().catch(() => null);
            if (!existing?.size) {
              const wh = await gch.createWebhook({ name: 'GSA Feed' });
              gsaWebhookUrl = wh.url;
            }
          }
        } catch (err) { console.error('[setup] GSA webhook error:', err.message); }

        // ── Build .env hints ───────────────────────────────────────────────
        const envLines = [
          `WELCOME_CHANNEL_ID=${chWelcome.id}`,
          `ANNOUNCE_CHANNEL_ID=${chAnn.id}`,
          `GSA_CHANNEL_ID=${chGsa.id}`,
          `BOT_CHANNEL_ID=${chBot.id}`,
        ].join('\n');

        const embed = new EmbedBuilder()
          .setColor(0x43B581)
          .setTitle('✅ Setup server Henzzz selesai!')
          .addFields(
            { name: '✨ Dibuat / Direname', value: created.join('\n') || '-', inline: true },
            { name: '⏩ Sudah ada', value: skipped.slice(0, 15).join('\n') || '-', inline: true },
          )
          .addFields({ name: '📋 Tambah ke .env:', value: `\`\`\`\n${envLines}\n\`\`\`` });

        if (gsaWebhookUrl) {
          embed.addFields({
            name: '🔗 GSA Webhook URL',
            value: `\`\`\`\n${gsaWebhookUrl}\n\`\`\``,
          });
        }

        embed.addFields({
          name: '⚠️ Next steps',
          value:
            '1. Copy 4 IDs di atas → paste ke `.env` → restart bot\n' +
            '2. Grant bot role Administrator di Server Settings → Roles\n' +
            '3. Jalankan `/admin rolereact` di 🎭・get-roles\n' +
            '4. Tulis rules di 📜・rules\n' +
            '5. Invite OwO, Carl-bot, Lumina ke channel masing-masing',
        });

        await interaction.editReply({ embeds: [embed] });

      } catch (err) {
        await interaction.editReply(`❌ Error: ${err.message}\n\nPastikan bot punya permission **Administrator**.`);
      }
    }

    // ── /admin webhook ─────────────────────────────────────────────────────
    else if (sub === 'webhook') {
      const name = interaction.options.getString('name') || interaction.channel.name;
      try {
        const wh = await interaction.channel.createWebhook({ name });
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔗 Webhook created!')
          .addFields(
            { name: 'Channel', value: `${interaction.channel}`, inline: true },
            { name: 'Name', value: name, inline: true },
            { name: 'URL (keep private!)', value: `\`\`\`\n${wh.url}\n\`\`\`` },
          );
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply(`❌ ${err.message}`);
      }
    }

    // ── /admin rolereact ───────────────────────────────────────────────────
    else if (sub === 'rolereact') {
      const title    = interaction.options.getString('title');
      const rolesArg = interaction.options.getString('roles');

      const pairs = {};
      for (const part of rolesArg.split(',')) {
        const [emoji, roleName] = part.trim().split(':');
        if (emoji && roleName) pairs[emoji.trim()] = roleName.trim();
      }

      if (Object.keys(pairs).length === 0) {
        await interaction.editReply('❌ Format salah. Contoh: `🎮:Gamer,⭐:Member,🎨:Artist`');
        return;
      }

      const resolvedRoles = {};
      const missing = [];
      for (const [emoji, roleName] of Object.entries(pairs)) {
        const role = interaction.guild.roles.cache.find(
          r => r.name.toLowerCase() === roleName.toLowerCase()
        );
        if (role) resolvedRoles[emoji] = role.id;
        else missing.push(roleName);
      }

      if (missing.length) {
        await interaction.editReply(
          `❌ Role tidak ditemukan: **${missing.join(', ')}**\n` +
          `Buat role dulu di Server Settings → Roles, lalu coba lagi.`
        );
        return;
      }

      const desc = Object.entries(pairs)
        .map(([emoji, roleName]) => `${emoji} → **${roleName}**`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🎭 ${title}`)
        .setDescription(`React below to get your role!\n\n${desc}`)
        .setFooter({ text: 'Click again to remove the role' });

      const msg = await interaction.channel.send({ embeds: [embed] });
      for (const emoji of Object.keys(pairs)) {
        await msg.react(emoji).catch(() => {});
      }
      roleStore.setMessageRoles(msg.id, interaction.channelId, resolvedRoles);
      await interaction.editReply(
        `✅ Reaction role message posted in ${interaction.channel}!\nMapped ${Object.keys(resolvedRoles).length} roles.`
      );
    }

    // ── /admin lockdown ────────────────────────────────────────────────────
    else if (sub === 'lockdown') {
      const ch = interaction.options.getChannel('channel') || interaction.channel;
      try {
        await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          SendMessages: false,
          AddReactions: false,
        });
        await interaction.editReply(`🔒 ${ch} locked. @everyone can no longer send messages.`);
      } catch (err) {
        await interaction.editReply(`❌ ${err.message}`);
      }
    }

    // ── /admin ids ─────────────────────────────────────────────────────────
    // Scan server yang sudah ada dan output ID untuk .env tanpa membuat channel baru.
    else if (sub === 'ids') {
      const guild = interaction.guild;
      const channels = guild.channels.cache;

      // Cari channel berdasarkan nama (partial match)
      const find = (nameParts) => {
        for (const part of nameParts) {
          const ch = channels.find(c => c.name.toLowerCase().includes(part.toLowerCase()));
          if (ch) return ch;
        }
        return null;
      };

      const welcome  = find(['welcome', '📌']);
      const announce = find(['announcements', 'announce', '📢']);
      const gsa      = find(['gsa', '🏆']);
      const botCh    = find(['bot-commands', 'bot commands', '🤖・bot']);

      const lines = [
        welcome  ? `WELCOME_CHANNEL_ID=${welcome.id}` : '# WELCOME_CHANNEL_ID= ← channel tidak ditemukan',
        announce ? `ANNOUNCE_CHANNEL_ID=${announce.id}` : '# ANNOUNCE_CHANNEL_ID= ← channel tidak ditemukan',
        gsa      ? `GSA_CHANNEL_ID=${gsa.id}` : '# GSA_CHANNEL_ID= ← channel tidak ditemukan',
        botCh    ? `BOT_CHANNEL_ID=${botCh.id}` : '# BOT_CHANNEL_ID= ← channel tidak ditemukan',
      ].join('\n');

      const found = [welcome, announce, gsa, botCh].filter(Boolean);
      const missing = 4 - found.length;

      const embed = new EmbedBuilder()
        .setColor(missing === 0 ? 0x43B581 : 0xF5A623)
        .setTitle('📋 Channel IDs untuk .env')
        .addFields({ name: 'Copy paste ke discord-bot/.env:', value: `\`\`\`\n${lines}\n\`\`\`` });

      if (missing > 0) {
        embed.addFields({
          name: `⚠️ ${missing} channel tidak ditemukan`,
          value: 'Pastikan channel dengan nama yang sesuai sudah ada di server.',
        });
      } else {
        embed.addFields({ name: '✅ Semua channel ditemukan!', value: 'Copy IDs di atas → paste ke .env → restart bot.' });
      }

      // Detected channels list
      const detected = [
        welcome  && `📌 welcome → \`${welcome.id}\``,
        announce && `📢 announce → \`${announce.id}\``,
        gsa      && `🏆 gsa → \`${gsa.id}\``,
        botCh    && `🤖 bot-commands → \`${botCh.id}\``,
      ].filter(Boolean).join('\n');

      if (detected) embed.addFields({ name: 'Terdeteksi:', value: detected });

      await interaction.editReply({ embeds: [embed] });
    }

    // ── /admin rules ─────────────────────────────────────────────────────────
    // Post embed peraturan ke channel rules (fallback: channel sekarang)
    else if (sub === 'rules') {
      const guild = interaction.guild;
      const target = guild.channels.cache.find(c =>
        c.type === ChannelType.GuildText && c.name.toLowerCase().includes('rules')
      ) || interaction.channel;

      const icon = guild.iconURL({ size: 256 }) || null;
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: `${guild.name}: Peraturan`, iconURL: icon || undefined })
        .setThumbnail(icon)
        .setTitle('📜 Baca & Patuhi Ya!')
        .setDescription('Biar server tetap nyaman & asik buat semua, ada beberapa aturan dasar 🙏')
        .addFields(
          { name: '1. 🤝 Saling hormat', value: 'No toxic, bully, pelecehan, atau ujaran SARA. Perlakukan member lain sebaik kamu mau diperlakukan.' },
          { name: '2. 🚫 No spam', value: 'Jangan flood chat, mention massal, atau promosi/iklan tanpa izin admin.' },
          { name: '3. 🔞 Jaga konten', value: 'Dilarang konten NSFW, gore, atau apa pun yang ilegal.' },
          { name: '4. 📁 Channel sesuai topik', value: 'Lihat nama & deskripsi channel sebelum kirim. Obrolan bebas ke **#ngobrol**.' },
          { name: '5. 🔒 Privasi', value: 'Jangan sebar data pribadi orang lain (doxxing) atau screenshot chat tanpa izin.' },
          { name: '6. 🎙️ Sopan di voice', value: 'No mic spam, ear-rape, atau ganggu obrolan orang lain.' },
          { name: '7. 👮 Patuhi admin & Discord ToS', value: 'Ikuti arahan admin/mod, dan wajib taat [Discord ToS](https://discord.com/terms) & [Community Guidelines](https://discord.com/guidelines).' },
        )
        .setFooter({ text: 'Pelanggaran: warn → mute → kick → ban. Stay cool & have fun! 💙' })
        .setTimestamp();

      try {
        await target.send({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply(`❌ Gagal kirim rules ke ${target} (cek izin bot di channel itu): ${err.message}`);
        return;
      }
      await interaction.editReply(`✅ Rules diposting di ${target}.`);
    }

    // ── /admin serverinfo ──────────────────────────────────────────────────────
    else if (sub === 'serverinfo') {
      const guild = interaction.guild;
      const target = guild.channels.cache.find(c =>
        c.type === ChannelType.GuildText && c.name.toLowerCase().includes('server-info')
      ) || guild.channels.cache.find(c =>
        c.type === ChannelType.GuildText && c.name.toLowerCase().includes('info')
      ) || interaction.channel;

      const icon = guild.iconURL({ size: 256 }) || null;
      const owner = await guild.fetchOwner().catch(() => null);
      const botCount = guild.members.cache.filter(m => m.user.bot).size;

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: guild.name, iconURL: icon || undefined })
        .setThumbnail(icon)
        .setTitle('📌 Tentang Server')
        .setDescription('Komunitas santai buat **gaming**, **ngoding/tech**, dan **mahasiswa**. Tempat ngobrol, main bareng, belajar coding, dan sharing project. Selamat datang! 👋')
        .addFields(
          { name: '👑 Owner', value: owner ? `${owner.user.username}` : '-', inline: true },
          { name: '👥 Member', value: `${guild.memberCount}`, inline: true },
          { name: '📅 Dibuat', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
          { name: '🗺️ Kategori', value: '💬 Community · 🎮 Gaming · 💻 Tech & Code · 🤖 Bot Center · 🔊 Voice' },
          { name: '🤖 Bot Hengs', value: 'Mention **Henzzz Bot** buat AI chat. Coba `/study`, `/scrim`, `/fun`, `/voice`. Ada juga OwO, Carl-bot, & Lumina.' },
          { name: '🎭 Ambil role', value: 'Ke **#get-roles** untuk memilih minat, game, warna nama, dan notifikasi.' },
          { name: '📜 Rules', value: 'Baca **#rules** sebelum mulai ngobrol ya.' },
          { name: '💬 Mulai dari mana?', value: 'Kenalan di **#introductions**, ngobrol bebas di **#ngobrol**!' },
        )
        .setFooter({ text: `Henzzz · ${botCount} bot aktif · dibuat dengan ❤️` })
        .setTimestamp();

      try {
        await target.send({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply(`❌ Gagal kirim server-info ke ${target} (cek izin bot): ${err.message}`);
        return;
      }
      await interaction.editReply(`✅ Server-info diposting di ${target}.`);
    }

    // ── /admin getroles ──────────────────────────────────────────────────────
    // PAKAI role yang sudah ada saja (fuzzy match). TIDAK membuat role baru.
    // Hapus pesan get-roles lama dulu tiap re-run biar nggak numpuk.
    else if (sub === 'getroles') {
      const guild = interaction.guild;
      // Fuzzy match: cocokin role yang udah ada walau ada emoji/variasi nama
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const findRole = (name) => guild.roles.cache.find(x => {
        const a = norm(x.name), b = norm(name);
        return a === b || (b.length >= 3 && a.includes(b)) || (a.length >= 3 && b.includes(a));
      });

      const CATEGORIES = [
        {
          title: '🎭 Minat Kamu',
          desc: 'React buat nunjukin minatmu!',
          roles: [
            { emoji: '🎮', name: 'Gamer',     color: 0x9B59B6 },
            { emoji: '💻', name: 'Developer', color: 0x2ECC71 },
            { emoji: '🎨', name: 'Artist',    color: 0xE91E63 },
            { emoji: '📚', name: 'Student',   color: 0xF1C40F },
          ],
        },
        {
          title: '🕹️ Game yang Dimain',
          desc: 'Biar gampang dicariin temen main (nyambung ke #lfg)!',
          roles: [
            { emoji: '🎯', name: 'Valorant',       color: 0xFF4655 },
            { emoji: '🐉', name: 'Mobile Legends', color: 0x1E90FF },
            { emoji: '🧱', name: 'Roblox',         color: 0xE2231A },
          ],
        },
        {
          title: '🔔 Notifikasi (opsional)',
          desc: 'Mau di-ping pas ada update? Ambil role-nya biar nggak kelewatan.',
          roles: [
            { emoji: '📢', name: 'Announcements', color: 0xFAA61A },
            { emoji: '🎉', name: 'Events',        color: 0xEB459E },
          ],
        },
      ];

      const target = guild.channels.cache.find(c =>
        c.type === ChannelType.GuildText &&
        (c.name.toLowerCase().includes('get-roles') || c.name.toLowerCase().includes('roles'))
      ) || interaction.channel;

      // Hapus pesan reaction-role lama di channel ini (anti-numpuk tiap re-run)
      let deleted = 0;
      try {
        const stored = roleStore.getAllMessages();
        for (const [msgId, info] of Object.entries(stored)) {
          if (info && info.channelId === target.id) {
            const old = await target.messages.fetch(msgId).catch(() => null);
            if (old) { await old.delete().catch(() => {}); deleted += 1; }
            roleStore.removeMessage(msgId);
          }
        }
      } catch (err) { console.error('[getroles cleanup]', err.message); }

      const reused = [];
      const created = [];
      for (const cat of CATEGORIES) {
        const resolved = {};
        const present = [];
        for (const r of cat.roles) {
          let role = findRole(r.name);             // pakai role yang udah ada
          if (role) {
            reused.push(role.name);
            // Role udah ada tapi BELUM punya icon → kasih icon (icon yang udah kamu set TIDAK ditimpa)
            if (!role.unicodeEmoji && !role.icon) {
              await role.setUnicodeEmoji(r.emoji).catch(() => {});
            }
          } else if (r.color !== undefined) {       // belum ada → bikin pakai warna, lalu set icon
            role = await guild.roles.create({
              name: r.name, color: r.color, mentionable: true,
              reason: 'Self-assign role (get-roles)',
            }).catch(() => null);
            if (role) {
              created.push(r.name);
              // Set icon SETELAH dibuat (lebih reliabel daripada di opsi create)
              await role.setUnicodeEmoji(r.emoji).catch(() => {});
            }
          }
          if (role) { resolved[r.emoji] = role.id; present.push(r); }
        }
        if (present.length === 0) continue;

        const desc = present.map(r => `${r.emoji} → **${r.name}**`).join('\n');
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(cat.title)
          .setDescription(`${cat.desc}\n\n${desc}`)
          .setFooter({ text: 'Klik reaksi lagi buat lepas role' });

        const msg = await target.send({ embeds: [embed] });
        for (const r of present) await msg.react(r.emoji).catch(() => {});
        roleStore.setMessageRoles(msg.id, target.id, resolved);
      }

      if (reused.length === 0 && created.length === 0) {
        await interaction.editReply('❌ Gagal. Pastikan bot punya permission **Manage Roles** & role Hengs ada DI ATAS role yang mau dikasih.');
        return;
      }

      const lines = [
        `✅ Get-roles diposting di ${target}${deleted ? ` (hapus ${deleted} pesan lama)` : ''}.`,
        reused.length ? `♻️ Pakai role yang udah ada: ${[...new Set(reused)].join(', ')}` : '',
        created.length ? `🆕 Role baru dibuat (udah ada warna; icon bisa kamu tambah manual di Server Settings): ${[...new Set(created)].join(', ')}` : '',
      ].filter(Boolean).join('\n');
      await interaction.editReply(lines);
    }

    // ── /admin restart ───────────────────────────────────────────────────────
    // Keluar dari proses → loop run-bot-forever otomatis nyalain lagi (~5 detik)
    else if (sub === 'restart') {
      // KEAMANAN: process.exit cuma boleh OWNER. defaultMemberPermissions itu cuma petunjuk
      // UI (nggak dienforce server-side) → tambah cek OWNER_ID. Set OWNER_ID di .env.
      if (process.env.OWNER_ID && interaction.user.id !== process.env.OWNER_ID) {
        await interaction.editReply('❌ Cuma owner yang boleh restart bot.');
        return;
      }
      await interaction.editReply('♻️ **Restarting Hengs...** Online lagi ~5 detik buat load update terbaru. 🔄');
      console.log(`♻️ Restart via /admin restart oleh ${interaction.user.tag}`);
      setTimeout(() => process.exit(0), 800);
    }
  },
};
