'use strict';

// Hengs Coach phase 1: honest numbers from the team's own scrim games. Every line says "X dari N game";
// a percent appears from MIN_SAMPLE games and "paling sering" from MIN_SAMPLE losses, below that the text says so.
const { escapeMarkdown } = require('discord.js');

const MIN_SAMPLE = 5;
const MAX_TEXT = 2000;
const DAY = 86_400_000;
const WIB = 7 * 3_600_000;
const REASON_LABEL = Object.freeze({ early: 'early game', objective: 'objective', teamfight: 'teamfight', draft: 'draft', lainnya: 'lainnya' });
const REASON_ORDER = Object.keys(REASON_LABEL);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const opponentKey = name => String(name).toLowerCase().replace(/\s+/g, ' ').trim();
const wibDay = at => Math.floor((at + WIB) / DAY);
const dateLabel = at => { const day = new Date(at + WIB); return `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`; };
const whenLabel = at => { const time = new Date(at + WIB); return `${dateLabel(at)} ${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')} WIB`; };
const wins = games => games.filter(game => game.outcome === 'menang').length;

// Slice to max UTF-16 units (what the store and Discord limits count) without leaving half an emoji at the end.
function cutUnits(value, max) {
  const kept = value.slice(0, max);
  const last = kept.charCodeAt(kept.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? kept.slice(0, -1) : kept;
}
const cut = (value, max) => (value.length > max ? `${cutUnits(value, max - 3)}...` : value);
// Coach voice: Gen Z santai for kids. W/L, slang only where it never hides a number, no blaming or mocking anyone.
const outcomeText = game => (game.outcome === 'menang' ? 'W' : `L (${REASON_LABEL[game.reason]})`);
const percent = games => Math.round((100 * wins(games)) / games.length);
const vibe = pct => (pct >= 60 ? 'lumayan gacor 🔥' : pct >= 40 ? 'masih naik turun, gas terus' : 'lagi seret, santuy, gas latihan 💪');

const share = games => `W ${wins(games)} dari ${games.length} game${games.length >= MIN_SAMPLE ? ` (${percent(games)}%)` : ''}`;

// Only the total line gets the hype phrase, and only once the sample can carry it.
function winLine(label, games, { hype = false } = {}) {
  if (!games.length) return `${label}: belum ada game`;
  if (games.length < MIN_SAMPLE) return `${label}: ${share(games)}, datanya masih dikit, belum bisa dinilai`;
  return `${label}: ${share(games)}${hype ? `, ${vibe(percent(games))}` : ''}`;
}

function reasonLine(games) {
  const losses = games.filter(game => game.outcome === 'kalah');
  if (!losses.length) return 'Kalah: belum ada L, mantap';
  // Stable sort keeps REASON_ORDER for equal counts.
  const counts = REASON_ORDER.map(reason => [reason, losses.filter(game => game.reason === reason).length])
    .filter(([, count]) => count).sort((a, b) => b[1] - a[1]);
  const verdict = losses.length < MIN_SAMPLE ? 'Belum cukup buat disimpulin.'
    : counts[1]?.[1] === counts[0][1] ? 'Alasannya masih rata, belum ada yang paling sering.'
      : `Paling sering: ${REASON_LABEL[counts[0][0]]} (${counts[0][1]} dari ${losses.length}), itu PR latihan berikutnya.`;
  return `Kalah (${losses.length}): ${counts.map(([reason, count]) => `${REASON_LABEL[reason]} ${count}`).join(', ')}. ${verdict}`;
}

function opponentLines(games) {
  const groups = new Map();
  for (const game of games) {
    const key = opponentKey(game.opponent);
    const group = groups.get(key) || groups.set(key, { games: [] }).get(key);
    group.name = game.opponent;
    group.games.push(game);
  }
  const sorted = [...groups.values()].sort((a, b) => b.games.length - a.games.length || b.games.at(-1).at - a.games.at(-1).at);
  return ['Per lawan:', ...sorted.slice(0, 5).map(group => `• ${escapeMarkdown(group.name)}: ${share(group.games)}`),
    ...(sorted.length > 5 ? [`• dan ${sorted.length - 5} tim lain`] : [])];
}

function noteLines(games) {
  const notes = games.filter(game => game.note).slice(-3).reverse();
  return notes.length ? ['Catatan terakhir:', ...notes.map(game =>
    `• ${dateLabel(game.at)} vs ${escapeMarkdown(game.opponent)}, ${outcomeText(game)}: ${escapeMarkdown(cut(game.note, 120))}`)] : [];
}

function body(games, now, { perOpponent }) {
  const since = days => games.filter(game => game.at > now - days * DAY);
  const form = games.slice(-5).map(game => (game.outcome === 'menang' ? 'W' : 'L')).join(' ');
  return [winLine('Semua', games, { hype: true }), winLine('7 hari', since(7)), winLine('30 hari', since(30)),
    `Form ${Math.min(5, games.length)} terakhir (kanan paling baru): ${form}`, reasonLine(games),
    ...(perOpponent ? opponentLines(games) : []), ...noteLines(games)];
}

// Only hostile names and notes get this long.
const fit = text => cut(text, MAX_TEXT);

function formatTeamRecap(games, { opponent = null, now = Date.now() } = {}) {
  const key = opponent ? opponentKey(opponent) : null;
  const scoped = key ? games.filter(game => opponentKey(game.opponent) === key) : games;
  const title = key ? `📒 **Rekap scrim vs ${escapeMarkdown(scoped.at(-1)?.opponent || opponent)}**` : '📒 **Rekap scrim Hengs Family (MLBB)**';
  if (!scoped.length) return `${title}\n${key ? 'Belum ada game vs tim ini yang kecatat.' : 'Belum ada game yang kecatat. Catat tiap game pakai `/scrim hasil` ya.'}`;
  return fit([title, ...body(scoped, now, { perOpponent: !key }),
    '-# Angka cuma dari /scrim hasil. Persen muncul mulai 5 game, kesimpulan mulai 5 kali kalah.'].join('\n'));
}

function formatPlayerStats(games, userId, { now = Date.now() } = {}) {
  const mine = games.filter(game => game.lineup.includes(userId));
  const title = '📒 **Stat scrim kamu, Hengs Family (MLBB)**';
  if (!mine.length) return `${title}\nBelum ada game yang ada kamu di lineup. Minta yang nyatet pilih kamu di lineup pas \`/scrim hasil\` ya.`;
  return fit([title, ...body(mine, now, { perOpponent: true }),
    '-# Dari game yang ada kamu di lineup, cuma buat kamu. Alasan kalah itu label tim, bukan nilai kamu pribadi. Persen muncul mulai 5 game.'].join('\n'));
}

// Running score for the card: same opponent, same WIB calendar day.
function todayScore(games, opponent, at) {
  const key = opponentKey(opponent);
  const today = games.filter(game => opponentKey(game.opponent) === key && wibDay(game.at) === wibDay(at));
  return { won: wins(today), lost: today.length - wins(today) };
}

module.exports = { MIN_SAMPLE, REASON_LABEL, cutUnits, opponentKey, wibDay, whenLabel, todayScore, formatTeamRecap, formatPlayerStats };
