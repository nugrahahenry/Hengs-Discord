'use strict';

// Light Nobar for match days (owner request, 2026-10-30, MPL ID S18 playoffs): the kickoff reminder in #hengs-analis,
// the 🔔 button that adds or removes the opt-in Nobar role, and the replies. Pure; the service posts and pings.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { wibTime } = require('./daily');

const NOBAR_ID = 'hengs-analis:nobar';
const REMIND_BEFORE = 15 * 60_000; const MAX_PINGS = 50; const MAX_ROOMS = 3;

const reminderDue = (match, now) => Boolean(match.startAt) && match.startAt > now && match.startAt - now <= REMIND_BEFORE;

// rooms: open Nobar rooms [{ id, count }]; ids: the members to mention (already capped).
function reminderText({ match, league = '', previewUrl = null, rooms = [], stream = null, ids = [] }) {
  const [a, b] = match.teams;
  const open = rooms.slice(0, MAX_ROOMS).map(room => `<#${room.id}> (${room.count} orang)`);
  return [
    `🔴 **${a.name} vs ${b.name}** mulai ${wibTime(match.startAt)} WIB (<t:${Math.floor(match.startAt / 1000)}:R>)${league ? ` · ${league}` : ''}`,
    previewUrl ? `Tebakan ditutup pas laga mulai: ${previewUrl}` : '',
    open.length ? `Nobar bareng: ${open.join(', ')}, atau buka sendiri lewat 🎬・Bikin Nobar` : 'Nobar bareng: buka room lewat 🎬・Bikin Nobar',
    stream ? `Live: <${stream}>` : '',
    ids.map(id => `<@${id}>`).join(' '),
  ].filter(Boolean).join('\n');
}

const pingIds = ids => [...new Set(ids)].slice(0, MAX_PINGS);

const nobarRow = () => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(NOBAR_ID)
  .setLabel('Ingetin aku').setEmoji('🔔').setStyle(ButtonStyle.Secondary));

const NOBAR_REPLIES = Object.freeze({
  on: 'Oke, kamu bakal di-ping sekitar 15 menit sebelum laga yang ada preview-nya. Klik 🔔 lagi buat berhenti.',
  off: 'Oke, kamu nggak di-ping lagi buat laga.',
  failed: 'Role Nobar belum bisa diatur sekarang. Admin udah dikabarin.',
});

module.exports = { NOBAR_ID, REMIND_BEFORE, reminderDue, reminderText, pingIds, nobarRow, NOBAR_REPLIES };
