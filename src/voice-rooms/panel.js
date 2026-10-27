'use strict';

// The owner panel in a room's text chat: rename, lock or unlock, slot, invite; Belajar rooms add the Pomodoro row (start
// with a preset, or stop). Custom ids: voice-room:<action>:<channelId>; the weekly board's Menitku button carries the
// server id instead.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  UserSelectMenuBuilder } = require('discord.js');
const { PRESETS, phaseLine } = require('./pomodoro');

const PREFIX = 'voice-room:';
const SLOTS = Object.freeze([0, 2, 3, 4, 5, 6, 8, 10, 15, 20]);
const idOf = (action, channelId) => `${PREFIX}${action}:${channelId}`;

function panelPayload({ type, ownerId, channelId, limit, locked, pomodoro = null, boardId = null }) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(idOf('rename', channelId)).setLabel('Ganti nama').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(idOf(locked ? 'unlock' : 'lock', channelId)).setLabel(locked ? 'Buka' : 'Kunci')
      .setEmoji(locked ? '🔓' : '🔒').setStyle(ButtonStyle.Secondary));
  const slots = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(idOf('slot', channelId))
    .setPlaceholder(`Slot: ${limit ? `${limit} orang` : 'bebas'}`)
    .addOptions(SLOTS.map(n => ({ label: n ? `${n} orang` : 'Bebas', value: String(n), default: n === limit }))));
  const invite = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(idOf('invite', channelId))
    .setPlaceholder('Undang anggota (maks 5)').setMinValues(1).setMaxValues(5));
  const components = [buttons, slots, invite];
  let study = '';
  if (type.pomodoro) {
    components.push(new ActionRowBuilder().addComponents(pomodoro
      ? new ButtonBuilder().setCustomId(idOf('pomodoro-stop', channelId)).setLabel('Stop Pomodoro').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
      : new StringSelectMenuBuilder().setCustomId(idOf('pomodoro', channelId)).setPlaceholder('🍅 Mulai Pomodoro')
        .addOptions(Object.values(PRESETS).map(p => ({ label: p.label, value: p.key, emoji: p.emoji })))));
    study = `\n${pomodoro ? phaseLine(pomodoro) : '🍅 Pomodoro belum jalan. Pilih preset di bawah buat mulai.'}`
      + `\n-# Menit fokus dihitung buat papan Rajin Belajar mingguan${boardId ? ` di <#${boardId}>` : ''}.`;
  }
  return {
    content: `${type.emoji} Room ${type.label} punya <@${ownerId}>. Panel ini cuma bisa dipakai pemilik room.`
      + (locked ? ' Room lagi dikunci: yang bisa masuk cuma yang diundang.' : '') + study,
    components, allowedMentions: { parse: [] },
  };
}

function renameModal(channelId) {
  return new ModalBuilder().setCustomId(idOf('renamed', channelId)).setTitle('Ganti nama room').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nama baru (maks 40 huruf)')
      .setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(true)));
}

// Under the weekly Rajin Belajar board: a private look at your own minutes.
const boardRow = guildId => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(idOf('menitku', guildId))
  .setLabel('Menitku').setEmoji('📊').setStyle(ButtonStyle.Secondary));

module.exports = { PREFIX, SLOTS, panelPayload, renameModal, boardRow };
