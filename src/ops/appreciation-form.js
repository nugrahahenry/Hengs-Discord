'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createHash } = require('node:crypto');

function appreciationRevision(draft) {
  return createHash('sha256').update(JSON.stringify([draft.title, draft.body, draft.lastRevisedAt || '', draft.appreciationTags || null])).digest('hex').slice(0, 16);
}

function appreciationFormRow(requesterId) {
  if (!/^\d{15,22}$/.test(requesterId || '')) return [];
  return [new ActionRowBuilder().addComponents(new ButtonBuilder()
    .setCustomId(`ops:appreciationnew:${requesterId}`)
    .setLabel('Isi kartu apresiasi').setStyle(ButtonStyle.Primary))];
}

function appreciationModal(requesterId, { data = {}, draft } = {}) {
  const fields = [
    ['recipient', 'Nama pemain atau tim', 80, true, 'Tim Orion'],
    ['achievement', 'Pencapaiannya apa?', 220, true, 'Juara 1 turnamen MLBB'],
    ['occasion', 'Turnamen atau acara (opsional)', 100, false, 'Kosongkan kalau belum ada nama acara'],
    ['date', 'Tanggal pencapaian (opsional)', 48, false, '17 Oktober 2026'],
    ['players', 'Pemain (opsional, maksimal 8)', 480, false, 'Satu per baris. Contoh: Raka (Sky). Nickname boleh kosong.'],
  ];
  return new ModalBuilder().setCustomId(draft
    ? `ops:appreciationedit:${requesterId}:${draft.id}:${appreciationRevision(draft)}`
    : `ops:appreciationform:${requesterId}`)
    .setTitle(draft ? 'Edit kartu apresiasi' : 'Bikin kartu apresiasi')
    .addComponents(fields.map(([id, label, max, required, placeholder]) => new ActionRowBuilder()
      .addComponents(new TextInputBuilder().setCustomId(id).setLabel(label)
        .setStyle(id === 'players' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setMaxLength(max).setRequired(required).setPlaceholder(placeholder)
        .setValue(id === 'players' ? (data[id] || '').replaceAll('; ', '\n') : data[id] || ''))));
}

module.exports = { appreciationFormRow, appreciationModal, appreciationRevision };
