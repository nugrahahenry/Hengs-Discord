'use strict';

// Failed sends go to bot-settings, so a broken feature never fails silently for days: the welcome card failed on
// a channel permission from mid-October until a member noticed (owner request, 2026-10-24). One note per feature,
// channel, person and reason within the window, so a failure that repeats every tick does not flood the channel.
const { PermissionFlagsBits: P } = require('discord.js');

const SEND = Object.freeze([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles]);
const WINDOW = 6 * 60 * 60_000;

function findBotSettings(guild) {
  const text = [...(guild?.channels?.cache?.values?.() || [])].filter(c => c.isTextBased?.());
  return text.find(c => c.name.toLowerCase().includes('bot-settings')) || text.find(c => c.name.toLowerCase().includes('settings')) || null;
}

// Permissions Hengs lacks in a channel, worded as in Discord's channel settings ("Send Messages"). Unknown (no
// cached member) returns none, so the caller's own send decides.
function missingPermissions(channel, me, needs = SEND) {
  const permissions = channel?.permissionsFor?.(me);
  if (!permissions) return [];
  return permissions.missing(needs).map(name => name.replace(/([a-z])([A-Z])/g, '$1 $2'));
}

function failureNote({ feature, channel = null, missing = [], code = null, who = null, reason = null, extra = null }) {
  const why = missing.length
    ? `: Hengs belum punya izin ${missing.map(name => `**${name}**`).join(', ')} di channel itu. Buka Edit Channel > Permissions, tambah role Hengs Bot, lalu nyalakan izin tadi.`
    : reason ? `: ${reason}.`
      : channel ? `${code ? ` (kode ${code})` : ''}. Cek channel itu dan izin Hengs di sana.`
        : ': channel tujuannya tidak ketemu. Cek pengaturannya.';
  return `⚠️ **${feature} gagal dikirim**${who ? ` buat ${who}` : ''}${channel ? ` di <#${channel.id}>` : ''}${why}${extra ? ` ${extra}` : ''}`;
}

function createFailureReporter({ now = Date.now, logger = console, window = WINDOW } = {}) {
  const seen = new Map();
  return async function reportFailure(guild, { feature, channel = null, needs = SEND, code = null, who = null, reason = null, extra = null } = {}) {
    if (!guild) return false;
    const missing = channel ? missingPermissions(channel, guild.members?.me, needs) : [];
    const key = [guild.id, feature, channel?.id, who, missing.join(',') || reason || code].join('|');
    for (const [old, at] of seen) if (now() - at >= window) seen.delete(old);
    if (seen.has(key)) return false;
    seen.set(key, now());
    const target = findBotSettings(guild);
    if (!target) { logger.error('[failure-report] BOT_SETTINGS_MISSING'); return false; }
    try {
      await target.send({ content: failureNote({ feature, channel, missing, code, who, reason, extra }), allowedMentions: { parse: [] } });
      return true;
    } catch {
      logger.error('[failure-report] REPORT_FAILED');
      return false;
    }
  };
}

module.exports = { SEND, createFailureReporter, failureNote, findBotSettings, missingPermissions };
