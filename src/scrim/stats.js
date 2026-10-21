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
const wins = games => games.filter(game => game.outcome === 'menang').length;
const cut = (value, max) => (value.length > max ? `${value.slice(0, max - 3)}...` : value);
const outcomeText = game => (game.outcome === 'menang' ? 'menang' : `kalah (${REASON_LABEL[game.reason]})`);

function share(games) {
  const n = games.length;
  return `menang ${wins(games)} dari ${n} game${n >= MIN_SAMPLE ? ` (${Math.round((100 * wins(games)) / n)}%)` : ''}`;
}

const winLine = (label, games) => (games.length
  ? `${label}: ${share(games)}${games.length < MIN_SAMPLE ? ', belum cukup data' : ''}.` : `${label}: belum ada game.`);

function reasonLine(games) {
  const losses = games.filter(game => game.outcome === 'kalah');
  if (!losses.length) return 'Alasan kalah: belum ada kekalahan.';
  // Stable sort keeps REASON_ORDER for equal counts.
  const counts = REASON_ORDER.map(reason => [reason, losses.filter(game => game.reason === reason).length])
    .filter(([, count]) => count).sort((a, b) => b[1] - a[1]);
  const verdict = losses.length < MIN_SAMPLE ? 'Belum cukup data buat kesimpulan.'
    : counts[1]?.[1] === counts[0][1] ? 'Belum ada satu alasan yang paling sering.'
      : `Paling sering: ${REASON_LABEL[counts[0][0]]} (${counts[0][1]} dari ${losses.length}).`;
  return `Alasan kalah (${losses.length} kalah): ${counts.map(([reason, count]) => `${REASON_LABEL[reason]} ${count}`).join(', ')}. ${verdict}`;
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
    ...(sorted.length > 5 ? [`• dan ${sorted.length - 5} lawan lain`] : [])];
}

function noteLines(games) {
  const notes = games.filter(game => game.note).slice(-3).reverse();
  return notes.length ? ['Catatan terakhir:', ...notes.map(game =>
    `• ${dateLabel(game.at)} vs ${escapeMarkdown(game.opponent)}, ${outcomeText(game)}: ${escapeMarkdown(cut(game.note, 120))}`)] : [];
}

function body(games, now, { perOpponent }) {
  const since = days => games.filter(game => game.at > now - days * DAY);
  const form = games.slice(-5).map(game => (game.outcome === 'menang' ? 'M' : 'K')).join(' ');
  return [winLine('Semua', games), winLine('7 hari', since(7)), winLine('30 hari', since(30)),
    `Form ${Math.min(5, games.length)} game terakhir (terbaru di kanan): ${form}`, reasonLine(games),
    ...(perOpponent ? opponentLines(games) : []), ...noteLines(games)];
}

// Only hostile names and notes get this long; cut without splitting an emoji.
function fit(text) {
  if (text.length <= MAX_TEXT) return text;
  let kept = text.slice(0, MAX_TEXT - 3);
  const last = kept.charCodeAt(kept.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) kept = kept.slice(0, -1);
  return `${kept}...`;
}

function formatTeamRecap(games, { opponent = null, now = Date.now() } = {}) {
  const key = opponent ? opponentKey(opponent) : null;
  const scoped = key ? games.filter(game => opponentKey(game.opponent) === key) : games;
  const title = key ? `📒 **Rekap scrim vs ${escapeMarkdown(scoped.at(-1)?.opponent || opponent)}**` : '📒 **Rekap scrim Hengs Family (MLBB)**';
  if (!scoped.length) return `${title}\n${key ? 'Belum ada game vs lawan ini yang tercatat.' : 'Belum ada game tercatat. Catat tiap game lewat `/scrim hasil`.'}`;
  return fit([title, ...body(scoped, now, { perOpponent: !key }),
    '-# Cuma game yang dicatat lewat /scrim hasil. Persen mulai 5 game, kesimpulan mulai 5 kekalahan.'].join('\n'));
}

function formatPlayerStats(games, userId, { now = Date.now() } = {}) {
  const mine = games.filter(game => game.lineup.includes(userId));
  const title = '📒 **Statistik scrim kamu, Hengs Family (MLBB)**';
  if (!mine.length) return `${title}\nBelum ada game dengan kamu di lineup. Minta pencatat memilih kamu di lineup waktu \`/scrim hasil\`.`;
  return fit([title, ...body(mine, now, { perOpponent: true }),
    '-# Dari game yang mencantumkan kamu di lineup, cuma untukmu. Alasan kalah adalah label tim, bukan nilai pribadi. Persen mulai 5 game.'].join('\n'));
}

// Running score for the card: same opponent, same WIB calendar day.
function todayScore(games, opponent, at) {
  const key = opponentKey(opponent);
  const today = games.filter(game => opponentKey(game.opponent) === key && wibDay(game.at) === wibDay(at));
  return { won: wins(today), lost: today.length - wins(today) };
}

module.exports = { MIN_SAMPLE, REASON_LABEL, opponentKey, todayScore, formatTeamRecap, formatPlayerStats };
