'use strict';

const { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { SOURCES, plain, articleUrl, imageUrl } = require('./feeds');
const { wibClock } = require('./store');
const { validatedCopy } = require('./editor');

const text = content => new TextDisplayBuilder().setContent(content).toJSON();

function digestPayload(settings, items, now, intro = '') {
  const components = [];
  if (intro) components.push(text(intro));
  components.push(text(settings.tone === 'casual'
    ? '## Hengs News\nBiar nggak ketinggalan.' : '## Hengs News\nBacaan harian.'));
  for (const item of items.slice(0, 3)) {
    const copy = validatedCopy(item.editorial, item);
    const title = copy?.title || plain(item.title, 150);
    const source = SOURCES.find(row => row.name === item.source && row.topic === item.topic);
    const url = source && articleUrl(item.url, source);
    if (!url) throw new Error('NEWS_ARTICLE_INVALID');
    const image = imageUrl(item.imageUrl, source);
    const card = new ContainerBuilder().setAccentColor(0x7667ff);
    if (image) card.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(image).setDescription(`Gambar dari ${source.name} untuk artikel: ${title}`),
    ));
    card.addTextDisplayComponents(text([
      `### ${title}`,
      copy ? copy.summary : item.excerpt ? `Cuplikan sumber: ${plain(item.excerpt, 220)}` : 'Buka sumber untuk membaca selengkapnya.',
      copy ? '-# Ringkasan AI dari judul/cuplikannya, bukan verifikasi fakta.' : '-# Bahasa sumber. Ringkasan Indonesia belum tersedia.',
      `[Baca di ${source.name}](${url})`,
      `-# ${wibClock(item.publishedAt).day} WIB${item.topic === 'memes' ? ' · Hiburan, bukan berita faktual' : ''}${image ? ' · Gambar dari feed sumber' : ' · Gambar tidak tersedia'}`,
    ].join('\n\n')));
    components.push(card.toJSON());
  }
  components.push(text(`-# ${wibClock(now).day} WIB · Maksimal satu artikel per penerbit. Baca sumber untuk konteks lengkap.`));
  return { components, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

module.exports = { digestPayload };
