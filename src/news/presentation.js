'use strict';

const { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { SOURCES, plain, articleUrl, imageUrl } = require('./feeds');
const { wibClock } = require('./store');
const { validatedCopy } = require('./editor');

const text = content => new TextDisplayBuilder().setContent(content).toJSON();
// Outside memes ask for a tap too, without claiming Hengs learns from them (only Hengs-made memes are learned from).
const MEME_TAP = '-# Reaksi 😂 kalau lucu, 😐 kalau garing.';
const domainOf = value => typeof value === 'string' && /^[a-z0-9.-]{1,60}$/.test(value) ? value : null;

function digestPayload(settings, items, now, intro = '') {
  const components = [];
  const visible = items.slice(0, 3);
  const entertainmentOnly = visible.length > 0 && visible.every(item => item.topic === 'memes');
  if (intro) components.push(text(intro));
  components.push(text(entertainmentOnly
    ? '## Hengs Memes\nBuat rehat sebentar.'
    : settings.tone === 'casual' ? '## Hengs News\nBiar nggak ketinggalan.' : '## Hengs News\nBacaan harian.'));
  for (const item of visible) {
    const copy = validatedCopy(item.editorial, item);
    const title = copy?.title || plain(item.title, 150);
    const source = SOURCES.find(row => row.name === item.source && row.topic === item.topic);
    const url = source && articleUrl(item.url, source);
    if (!url) throw new Error('NEWS_ARTICLE_INVALID');
    const image = imageUrl(item.imageUrl, source);
    const comic = item.topic === 'memes';
    const card = new ContainerBuilder().setAccentColor(comic ? 0xf0b348 : 0x7667ff);
    if (image) card.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(image).setDescription(`Gambar dari ${source.name} untuk artikel: ${title}`),
    ));
    const why = !comic && [item.reason, item.trending && 'lagi naik di Google Trends Indonesia'].filter(Boolean).join(' · ');
    const link = source.format === 'hn'
      ? `[Baca diskusi di Hacker News](${url})${domainOf(item.domain) ? `\n-# Artikel asli: ${domainOf(item.domain)}` : ''}`
      : `[Baca di ${source.name}](${url})`;
    card.addTextDisplayComponents(text([
      comic ? '-# 🎨 Jeda komik' : '-# 📰 Pilihan berita',
      `### ${title}`,
      copy ? copy.summary : item.excerpt ? `Cuplikan sumber: ${plain(item.excerpt, 220)}`
        : comic ? 'Jeda sebentar dengan komik pilihan. Buka sumber untuk melihat versi aslinya.' : 'Cuplikan belum tersedia. Buka sumber untuk membaca selengkapnya.',
      copy ? '-# Ringkasan AI dari judul/cuplikannya, bukan verifikasi fakta.'
        : comic && !item.excerpt ? '-# Judul dan gambar asli penerbit; tidak ditafsirkan oleh AI.' : '-# Bahasa sumber. Ringkasan Indonesia belum tersedia.',
      link,
      ...(why ? [`-# Kenapa dipilih: ${why}`] : []),
      `-# ${wibClock(item.publishedAt).day} WIB${item.topic === 'memes' ? ' · Hiburan, bukan berita faktual' : ''}${image ? ' · Gambar dari feed sumber' : ' · Gambar tidak tersedia'}`,
    ].join('\n\n')));
    components.push(card.toJSON());
  }
  components.push(text(`-# ${wibClock(now).day} WIB · Maksimal satu artikel per penerbit. Baca sumber untuk konteks lengkap.`
    + (entertainmentOnly ? `\n${MEME_TAP}` : '')));
  return { components, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

const safeLink = value => typeof value === 'string' && /^https:\/\/[^\s()]+$/.test(value) ? value : null;

// Hengs-made and Lemmy memes travel as attachments; xkcd keeps the publisher-hosted card.
function memePayload(item, now, intro = '') {
  if (!item?.file) return digestPayload({ tone: 'casual' }, [item], now, intro);
  const components = [];
  if (intro) components.push(text(intro));
  components.push(text('## Hengs Memes\nBuat rehat sebentar.'));
  const card = new ContainerBuilder().setAccentColor(0xf0b348).addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(`attachment://${item.file.name}`).setDescription(plain(item.alt, 900) || 'Gambar meme'),
  ));
  const topic = plain(item.topicTitle, 120);
  const lines = item.kind === 'hengs'
    ? ['-# 🤖 Meme buatan Hengs', safeLink(item.topicUrl) ? `Tema: [${topic}](${item.topicUrl})` : `Tema: ${topic}`,
      '-# Template: memegen.link · Teks: AI Hengs · Hiburan, bukan berita faktual',
      '-# Reaksi 😂 kalau lucu, 😐 kalau garing. Hengs belajar dari reaksi kalian']
    : ['-# 😂 Dari Lemmy programmer_humor', `### ${plain(item.title, 150)}`,
      safeLink(item.url) ? `[Lihat post aslinya](${item.url})` : '',
      `-# Skor ${Number(item.score) || 0}, ${Number(item.comments) || 0} komentar · Hiburan, bukan berita faktual`, MEME_TAP];
  card.addTextDisplayComponents(text(lines.filter(Boolean).join('\n\n')));
  components.push(card.toJSON());
  components.push(text(`-# ${wibClock(now).day} WIB`));
  return { components, files: [{ attachment: item.file.data, name: item.file.name }],
    flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

module.exports = { digestPayload, memePayload };
