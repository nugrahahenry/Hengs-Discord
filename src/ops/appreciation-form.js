'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createHash } = require('node:crypto');
const pending = require('./appreciation-pending');

function appreciationRevision(draft) {
  return createHash('sha256').update(JSON.stringify([draft.title, draft.body, draft.lastRevisedAt || '', draft.appreciationTags || null,
    draft.appreciationCertificate || null])).digest('hex').slice(0, 16);
}

function appreciationFormRow(requesterId) {
  if (!/^\d{15,22}$/.test(requesterId || '')) return [];
  return [new ActionRowBuilder().addComponents(new ButtonBuilder()
    .setCustomId(`ops:appreciationnew:${requesterId}`)
    .setLabel('Isi kartu apresiasi').setStyle(ButtonStyle.Primary))];
}

// Asked when a competition result comes without its tournament, date or players: fill them in, or draft as it is.
function appreciationAskRow(requesterId, key) {
  if (!/^\d{15,22}$/.test(requesterId || '') || !/^[a-f0-9]{8}$/.test(key || '')) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ops:appreciationfill:${requesterId}:${key}`).setLabel('Lengkapi detail').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ops:appreciationnow:${requesterId}:${key}`).setLabel('Bikin sekarang').setStyle(ButtonStyle.Secondary))];
}

// Components under a prompt reply: the ask buttons when details are missing, the form button for a bare request.
function appreciationRows(route, requesterId) {
  if (route?.kind === 'appreciation_missing') return appreciationAskRow(requesterId, pending.remember(requesterId, route.data));
  return route?.kind === 'operation_questions' && route.operation === 'appreciation' ? appreciationFormRow(requesterId) : [];
}

function appreciationModal(requesterId, { data = {}, draft } = {}) {
  const fields = [
    ['recipient', 'Nama pemain atau tim, tanpa awalan wajib', 80, true, 'Hengs Family, tidak perlu ditambah Tim'],
    ['achievement', 'Pencapaiannya apa?', 220, true, 'Juara 1 turnamen MLBB'],
    ['occasion', 'Turnamen atau acara (opsional)', 100, false, 'Kosongkan kalau belum ada nama acara'],
    ['date', 'Tanggal pencapaian (opsional)', 48, false, '17 Oktober 2026'],
    ['players', 'Pemain (opsional, maksimal 8)', 480, false, 'Satu nama per baris, misalnya Raka (Sky). Nickname opsional.'],
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

module.exports = { appreciationAskRow, appreciationFormRow, appreciationModal, appreciationRevision, appreciationRows };
