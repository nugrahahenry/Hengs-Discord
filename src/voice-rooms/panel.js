'use strict';

// The owner panel in a room's text chat: rename, lock or unlock, slot, invite. Custom ids: voice-room:<action>:<channelId>.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  UserSelectMenuBuilder } = require('discord.js');

const PREFIX = 'voice-room:';
const SLOTS = Object.freeze([0, 2, 3, 4, 5, 6, 8, 10, 15, 20]);
const idOf = (action, channelId) => `${PREFIX}${action}:${channelId}`;

function panelPayload({ type, ownerId, channelId, limit, locked }) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(idOf('rename', channelId)).setLabel('Ganti nama').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(idOf(locked ? 'unlock' : 'lock', channelId)).setLabel(locked ? 'Buka' : 'Kunci')
      .setEmoji(locked ? '🔓' : '🔒').setStyle(ButtonStyle.Secondary));
  const slots = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(idOf('slot', channelId))
    .setPlaceholder(`Slot: ${limit ? `${limit} orang` : 'bebas'}`)
    .addOptions(SLOTS.map(n => ({ label: n ? `${n} orang` : 'Bebas', value: String(n), default: n === limit }))));
  const invite = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(idOf('invite', channelId))
    .setPlaceholder('Undang anggota (maks 5)').setMinValues(1).setMaxValues(5));
  return {
    content: `${type.emoji} Room ${type.label} punya <@${ownerId}>. Panel ini cuma bisa dipakai pemilik room.`
      + (locked ? ' Room lagi dikunci: yang bisa masuk cuma yang diundang.' : ''),
    components: [buttons, slots, invite], allowedMentions: { parse: [] },
  };
}

function renameModal(channelId) {
  return new ModalBuilder().setCustomId(idOf('renamed', channelId)).setTitle('Ganti nama room').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nama baru (maks 40 huruf)')
      .setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(true)));
}

module.exports = { PREFIX, SLOTS, panelPayload, renameModal };
