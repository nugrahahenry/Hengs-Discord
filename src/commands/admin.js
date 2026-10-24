// ─── /admin ───────────────────────────────────────────────────────────────
const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const roleStore = require('../utils/role-store');
const { createAdminSetupFlow } = require('../guilds/admin-setup');
const setupFlow = createAdminSetupFlow();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands (Administrator only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Setup komunitas: pilih paket, tema dan lihat preview sebelum channel dibuat')
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

  async execute(interaction, dependencies) {
    if (interaction.options.getSubcommand() === 'setup') return setupFlow.open(interaction, dependencies);
    return executeAdmin(interaction);
  },
  handleSetupComponent: (interaction, dependencies) => setupFlow.handle(interaction, dependencies),
};

async function executeAdmin(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    // ── /admin webhook ─────────────────────────────────────────────────────
    if (sub === 'webhook') {
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
        (c.name.toLowerCase().includes('get-roles') || c.name.toLowerCase().includes('ambil-role') || c.name.toLowerCase().includes('roles'))
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
}
