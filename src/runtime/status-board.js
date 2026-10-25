'use strict';

// bot-status (owner request, 2026-10-26): the notice Hengs posts after every start (how long it was down, a tidy or an
// abrupt stop, a new version) and the reply when the owner writes "status" there. Hengs cannot report while it is down;
// it reports once it is back, from the health snapshot the previous process left behind (src/runtime/health.js).
const fs = require('node:fs');
const { slugOf } = require('../guilds/channel-style');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const CONNECTION = Object.freeze({ CONNECTED: 'tersambung', RECONNECTING: 'nyambung ulang', DISCONNECTED: 'putus',
  STARTING: 'baru mulai', DEGRADED: 'kurang stabil' });
const ASK = /^(?:cek\s+)?status\??$/i;

const wib = at => new Date(at + 7 * 3_600_000);
const clock = at => wib(at).toISOString().slice(11, 16);
const stamp = at => `${wib(at).getUTCDate()} ${MONTHS[wib(at).getUTCMonth()]} ${clock(at)} WIB`;

function duration(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return 'kurang dari semenit';
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam${minutes % 60 ? ` ${minutes % 60} menit` : ''}`;
  return `${Math.floor(hours / 24)} hari${hours % 24 ? ` ${hours % 24} jam` : ''}`;
}

// Read before this process's runtime health writer overwrites the file.
function readHealthSnapshot(filePath, fsImpl = fs) {
  try {
    const value = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
    const heartbeatAt = Date.parse(value?.heartbeat?.at || '');
    if (value?.schemaVersion !== 1 || value.service !== 'hengs-discord' || !Number.isFinite(heartbeatAt)) return null;
    return { version: typeof value.version === 'string' ? value.version.slice(0, 32) : null, heartbeatAt,
      stopped: value.heartbeat.status === 'STOPPED' };
  } catch { return null; }
}

function onlineNotice({ previous, version, startedAt }) {
  if (!previous) return `🟢 **Hengs online** · v${version}`;
  const gap = duration(startedAt - previous.heartbeatAt);
  const text = previous.stopped
    ? `🟢 **Hengs online lagi** · v${version} · sempat mati ${gap}, dimatikan dengan rapi.`
    : `🟠 **Hengs online lagi** · v${version} · sempat mati sekitar ${gap}, berhentinya mendadak (terakhir hidup ${clock(previous.heartbeatAt)} WIB).`;
  return previous.version && previous.version !== version ? `${text} Versi baru: v${previous.version} ke v${version}.` : text;
}

const lastSent = (row, kind) => Math.max(0, ...(row?.receipts || []).filter(r => r.kind === kind && r.status === 'sent').map(r => r.at));

function statusReport({ version, startedAt, now = Date.now(), connection, ping, newsRow, analisCheck, failures, logChannel }) {
  const when = at => (at ? stamp(at) : 'belum ada');
  return [
    `📡 **Status Hengs** · v${version}`,
    `• Online sejak ${stamp(startedAt)} (${duration(now - startedAt)})`,
    `• Koneksi Discord: ${CONNECTION[connection] || String(connection || 'tidak diketahui').toLowerCase()}, `
      + `${ping >= 0 ? `ping ${Math.round(ping)} ms` : 'ping belum ada'}`,
    `• News terakhir: ${when(lastSent(newsRow, 'news'))} · Meme terakhir: ${when(lastSent(newsRow, 'meme'))}`,
    `• Analis: ${analisCheck ? `cek Liquipedia terakhir ${stamp(analisCheck)}` : 'belum pernah cek Liquipedia'}`,
    `• Laporan gagal sejak online: ${failures}${failures ? ` (detailnya di ${logChannel ? `<#${logChannel.id}>` : 'bot-settings'})` : ''}`,
  ].join('\n');
}

// "status", "status?" or "cek status" (a mention of Hengs may come first) in bot-status, from someone allowed to ask.
async function handleStatusMessage(msg, { canAsk, report }) {
  if (slugOf(msg.channel?.name) !== 'bot-status') return false;
  if (!ASK.test(String(msg.content || '').replace(/<@!?\d+>/g, '').trim()) || !canAsk(msg)) return false;
  await msg.reply({ content: report(), allowedMentions: { parse: [] } });
  return true;
}

module.exports = { duration, readHealthSnapshot, onlineNotice, statusReport, handleStatusMessage };
