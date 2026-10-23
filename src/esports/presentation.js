'use strict';

const { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { wibDate } = require('./card');

const REACTIONS = Object.freeze(['🔥', '🤔', '⚠️']);
const isWarning = name => String(name || '').replace(/️/g, '') === '⚠';
const text = content => new TextDisplayBuilder().setContent(content).toJSON();
const safeLink = value => typeof value === 'string' && /^https:\/\/[^\s()<>]+$/.test(value) ? value : null;
const pageUrl = page => `https://liquipedia.net/mobilelegends/${encodeURI(String(page).replace(/ /g, '_'))}`;
const wibTime = at => new Date(at + 7 * 3_600_000).toISOString().slice(11, 16);

function seriesPayload(match, { league = '' } = {}, png, { updatedAt = null } = {}) {
  const [a, b] = match.teams;
  const [win, lose] = match.winner === 2 ? [b, a] : [a, b];
  const score = match.winner === 2 ? [...match.score].reverse() : match.score;
  const vods = match.games.filter(g => safeLink(g.vod)).map(g => `[Game ${g.number}](${g.vod})`);
  const card = new ContainerBuilder().setAccentColor(0x8b5cff).addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL('attachment://hengs-analis.png')
      .setDescription(`Kartu hasil: ${a.name} ${match.score[0]}-${match.score[1]} ${b.name}, ${match.stage || league}`.slice(0, 1000)),
  ));
  card.addTextDisplayComponents(text([
    `**${win.name} menang ${score[0]}-${score[1]} atas ${lose.name}**`,
    [league, match.stage, wibDate(match.startAt ?? NaN)].filter(Boolean).join(' · '),
    `MVP: ${match.mvp || 'belum ada di data Liquipedia'}`,
    vods.length ? `VOD: ${vods.join(' · ')}` : '',
    `-# Data: [Liquipedia](${pageUrl(match.page)}) (CC-BY-SA 3.0) · 🔥 keren · 🤔 bingung · ⚠️ data salah`,
    updatedAt ? `-# Diperbarui ${wibTime(updatedAt)} WIB dari Liquipedia.` : '',
  ].filter(Boolean).join('\n')));
  return { components: [card.toJSON()], files: [{ attachment: png, name: 'hengs-analis.png' }],
    flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

const GUIDE = [
  '## 📊 Hengs Analis',
  'Rekap MLBB pro dari Hengs: hasil series, draft hero, dan catatan dari angka.',
  '**Yang diliput**\nMPL PH dan MPL ID, plus turnamen internasional (M-series, MSC, Esports Nations Cup) begitu jadwalnya ada di Liquipedia.',
  '**Kapan posting**\nSetelah series selesai dan hasilnya masuk Liquipedia, biasanya 20 sampai 60 menit kemudian. Kalau datanya dikoreksi (misalnya MVP baru diisi), kartunya ikut diperbarui.',
  '**Cara baca kartu**\nSkor besar di atas. Tiap game: durasi, pemenang, sisi biru atau merah, objektif yang dipilih, 5 pick tiap tim, lalu ban (tulisan redup).',
  '**Reaksi**\n🔥 keren · 🤔 bingung bacanya · ⚠️ datanya salah (Hengs cek ulang dan kabarin admin)',
  '**Kenapa nggak ada screenshot?**\nAturan Moonton melarang repost logo, foto dan siaran mereka. Jadi Hengs bikin kartu sendiri dari data teks.',
  '**Akurasi**\nSemua angka diambil dari data Liquipedia, bukan tebakan AI. Kalau datanya belum lengkap, kartu nulis "belum ada".',
  '-# Data: Liquipedia (CC-BY-SA 3.0). Hengs nggak berafiliasi dengan Moonton atau MPL. Cuma Hengs yang posting di sini.',
].join('\n\n');

// The pinned guide; Henry's banner (assets/esports/guide-banner.png) goes on top when it exists.
function guidePayload({ banner = null } = {}) {
  const card = new ContainerBuilder().setAccentColor(0x8b5cff);
  if (banner) card.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL('attachment://hengs-analis-panduan.png').setDescription('Banner Hengs Analis')));
  card.addTextDisplayComponents(text(GUIDE));
  return { components: [card.toJSON()], ...(banner ? { files: [{ attachment: banner, name: 'hengs-analis-panduan.png' }] } : {}),
    flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

module.exports = { seriesPayload, guidePayload, pageUrl, REACTIONS, isWarning, GUIDE };
