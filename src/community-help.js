'use strict';

function botCommands(guild) {
  const channels = [...(guild?.channels?.cache?.values?.() || [])].filter(channel =>
    channel.type === 0 && /(?:^|[・│|\s])bot-commands$/u.test(channel.name || ''));
  return channels.length === 1 && /^\d{17,20}$/.test(channels[0].id) ? `<#${channels[0].id}>` : '`bot-commands`';
}

function isHallGallery(channel) {
  return channel?.type === 0 && /(?:^|[・│|\s])hall-of-fame$/u.test(channel.name || '');
}

function hallGuide(guild) {
  return [
    '🏆 **Hall of Fame: tempat merayakan pencapaian kalian**',
    'Channel ini khusus galeri, bukan tempat mengetik prompt ke Hengs. Reaksi dan cerita pertandingan boleh di thread postingannya.',
    `Mau minta kartu apresiasi? Ke ${botCommands(guild)}, mention Hengs, lalu tulis siapa/timnya, pencapaian, nama acara, tanggal, dan pemain (satu orang per baris; nickname opsional).`,
    'Contoh: "Hengs, bantu bikin kartu apresiasi timku yang juara turnamen." Sertifikat asli boleh disertakan untuk direview pengelola.',
    'Owner/editor menyiapkan draft, owner memutuskan publikasinya. Tag anggota opsional: pilih akun Discord di panel review kalau ingin mereka diberi tahu saat Publish. Tanpa tag juga boleh.',
  ].join('\n\n');
}

function buildCommunityHelp({ home = false, manager = false, editor = false, guild } = {}) {
  const lines = [
    '👋 **Kenalan sama Hengs**',
    `Ngobrol di ${home ? botCommands(guild) : 'channel yang diizinkan pengelola'}. Mention Hengs + pertanyaanmu, atau pakai \`/hengs ask\` untuk balasan privat.`,
    '',
    '**Coba bilang**',
    '• "Jelasin konsep ini pakai contoh sederhana."',
    '• "Bantu cari ide kegiatan komunitas yang seru."',
    '• "Rapikan kalimat ini biar enak dibaca: ..."',
    '', '**News dan memes**',
    'Posting langsung sesuai izin channel, atau `/hengs ask` di bot-commands: `bagikan berita: link HTTPS` / `bagikan joke: teks`. Preview dulu, kamu yang konfirmasi. Bukan verifikasi AI.',
    ...(home ? ['', '**Casterin**',
      `\`/caster\` di ${botCommands(guild)}: tulis momen + pilih persona, dengerin preview privat, baru Kirim. Suara AI, jangan tulis data pribadi.`] : []),
    ...(home ? ['', '**Catatan scrim**',
      `Khusus role Hengs Family, di ${botCommands(guild)}: \`/scrim hasil\` tiap game (lawan, menang atau alasan kalah, SS opsional), cek lineup, lalu Kirim. \`/scrim rekap\` buat rekap tim, \`/scrim statku\` kirim statistikmu lewat DM.`] : []),
    ...(home ? ['', '**Punya pencapaian?**',
      `Ajukan kartu apresiasi di ${botCommands(guild)}, bukan di Hall of Fame. Siapkan tim/pemain, hasil, acara, tanggal, dan roster satu orang per baris. Owner/editor membantu review. Tag akun Discord opsional, bukan wajib.`] : []),
    '', '**Tombol bantuanmu**',
    '• `/hengs reset`: hapus konteks percakapanmu, bukan catatan tersimpan.',
    '• `/hengs privacy`: lihat penggunaan data. Jangan kirim password atau OTP.',
    '• `/hengs invite`: undang Hengs ke server yang kamu kelola.',
  ];
  if (manager || (home && editor)) lines.push('', '**Khusus pengelola**',
    ...(manager ? ['• `/setup`: aktifkan dan pilih channel yang boleh dipakai.',
      '• News terpisah: `atur berita 2 berita 1 meme ke #hengs-news, meme ke #hengs-memes`. Preview dulu; jeda otomatis minimal satu jam.'] : []),
    ...(home && manager ? ['• Rancang struktur server, preview opsi lalu konfirmasi. Contoh: "rancang server gaming".',
      '• Fitur privat: "ingatkan aku besok jam 7 pagi", "catat ...", "fokus belajar", atau "ubah welcome" lewat `/hengs ask`.'] : []),
    ...(home && editor ? ['• "Bikin kartu apresiasi" membuka form. Review di `bot-settings`; pilih Tag anggota atau Tanpa tag. Owner yang Publish/Jadwalkan.'] : []));
  return lines.join('\n');
}

module.exports = { botCommands, isHallGallery, hallGuide, buildCommunityHelp };
