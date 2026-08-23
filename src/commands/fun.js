// ─── /fun ─────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const FALLBACK_QUOTES = [
  { content: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { content: 'Belajar itu bukan tentang hafalan, tapi tentang pemahaman.', author: 'Henry\'s Bot' },
  { content: 'Code is like humor. When you have to explain it, it\'s bad.', author: 'Cory House' },
  { content: 'First, solve the problem. Then, write the code.', author: 'John Johnson' },
  { content: 'Jatuh itu biasa, yang penting bangkit lagi dan commit lagi.', author: 'Henry\'s Bot' },
  { content: 'The only way to learn a new programming language is by writing programs in it.', author: 'Dennis Ritchie' },
  { content: 'Kalau belum error, belum belajar.', author: 'Developer Wisdom' },
];

const EIGHT_BALL_RESPONSES = [
  // Positif
  'Iya, pasti! ✨', 'Sangat mungkin 👍', 'Tentu saja! 💯',
  'Outlook-nya bagus! 🌟', 'Percaya aja deh 😎',
  // Netral
  'Coba lagi nanti... 🤔', 'Tidak begitu jelas 🌫️',
  'Fokus dulu, nanti terjawab sendiri 🧘',
  // Negatif
  'Sepertinya tidak 😬', 'Jelas tidak ❌', 'Outlook-nya kurang bagus 😅',
  'Jangan terlalu berharap dulu 🙏',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fun')
    .setDescription('Command seru-seruan 🎉')
    .addSubcommand(sub => sub
      .setName('quote')
      .setDescription('Dapat quote motivasi random')
    )
    .addSubcommand(sub => sub
      .setName('8ball')
      .setDescription('Tanya Magic 8-Ball!')
      .addStringOption(opt => opt
        .setName('question')
        .setDescription('Pertanyaan kamu')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('roll')
      .setDescription('Roll dadu')
      .addIntegerOption(opt => opt
        .setName('sides')
        .setDescription('Jumlah sisi dadu (default: 6)')
        .setMinValue(2)
        .setMaxValue(100)
        .setRequired(false)
      )
    )
    .addSubcommand(sub => sub
      .setName('flip')
      .setDescription('Lempar koin, heads atau tails?')
    )
    .addSubcommand(sub => sub
      .setName('meme')
      .setDescription('Meme random dari internet 😂')
    ),

  async execute(interaction, { state }) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    // ── /fun quote ─────────────────────────────────────────────────────────
    if (sub === 'quote') {
      let quoteData;
      try {
        const res = await fetch('https://api.quotable.io/random?tags=technology|success|wisdom');
        if (res.ok) quoteData = await res.json();
      } catch (err) { console.warn('[fun quote] API gagal, pakai fallback lokal:', err.message); }

      // Fallback ke list lokal kalau API gagal
      if (!quoteData?.content) {
        quoteData = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
      }

      const embed = new EmbedBuilder()
        .setColor(0x7289DA)
        .setDescription(`💬 *"${quoteData.content}"*`)
        .setFooter({ text: `${quoteData.author}  ✨` });
      await interaction.editReply({ embeds: [embed] });
    }

    // ── /fun 8ball ─────────────────────────────────────────────────────────
    else if (sub === '8ball') {
      const question = interaction.options.getString('question');
      const answer   = EIGHT_BALL_RESPONSES[Math.floor(Math.random() * EIGHT_BALL_RESPONSES.length)];
      const embed = new EmbedBuilder()
        .setColor(0x1a1a2e)
        .setTitle('🎱 Magic 8-Ball')
        .addFields(
          { name: '❓ Pertanyaan', value: question },
          { name: '🎱 Jawaban',    value: `**${answer}**` },
        );
      await interaction.editReply({ embeds: [embed] });
    }

    // ── /fun roll ──────────────────────────────────────────────────────────
    else if (sub === 'roll') {
      const sides  = interaction.options.getInteger('sides') ?? 6;
      const result = Math.floor(Math.random() * sides) + 1;
      const isMax  = result === sides;
      const isMin  = result === 1;
      const embed = new EmbedBuilder()
        .setColor(isMax ? 0x4CAF50 : isMin ? 0xF44336 : 0xFF9800)
        .setTitle(`🎲 Dadu d${sides}`)
        .setDescription(
          `Hasilnya: **${result}**` +
          (isMax ? '\n🎉 Critical hit!' : isMin ? '\n😬 Critical fail!' : '')
        );
      await interaction.editReply({ embeds: [embed] });
    }

    // ── /fun flip ──────────────────────────────────────────────────────────
    else if (sub === 'flip') {
      const isHeads = Math.random() < 0.5;
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🪙 Coin Flip')
        .setDescription(`Hasilnya: **${isHeads ? '👑 HEADS' : '🪙 TAILS'}**`);
      await interaction.editReply({ embeds: [embed] });
    }

    // ── /fun meme ──────────────────────────────────────────────────────────
    else if (sub === 'meme') {
      try {
        const res  = await fetch('https://meme-api.com/gimme');
        const data = await res.json();
        if (!data.url) throw new Error('No URL');
        const embed = new EmbedBuilder()
          .setColor(0xFF4500)
          .setTitle(data.title.substring(0, 256))
          .setImage(data.url)
          .setURL(data.postLink)
          .setFooter({ text: `👍 ${data.ups} upvotes  |  r/${data.subreddit}` });
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply('Gagal ambil meme dari internet 😅 Coba lagi!');
      }
    }
  },
};
