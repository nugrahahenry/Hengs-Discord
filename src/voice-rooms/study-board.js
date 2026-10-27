'use strict';

// The weekly Rajin Belajar board, the pure part: who is on it (at least 25 focus minutes, equal minutes share a rank,
// the top 10 shown), durations, and the texts of the board and the Menitku reply.
const FLOOR = 25 * 60; const TOP = 10; const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MEDALS = ['🥇', '🥈', '🥉'];

// totals: { userId: seconds } to [{ user, seconds, rank }] best first, everyone at the floor.
function ranked(totals) {
  const rows = Object.entries(totals).filter(([, seconds]) => seconds >= FLOOR)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  let rank = 0;
  return rows.map(([user, seconds], i) => {
    if (!i || seconds !== rows[i - 1][1]) rank = i + 1;
    return { user, seconds, rank };
  });
}

function duration(seconds) {
  const minutes = Math.floor(seconds / 60); const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  if (!hours) return `${rest} menit`;
  return rest ? `${hours} jam ${rest} menit` : `${hours} jam`;
}

// "20-26 Okt", or "27 Okt-2 Nov" across months.
function weekLabel(monday) {
  const start = new Date(`${monday}T00:00:00Z`); const end = new Date(start.getTime() + 6 * DAY);
  const day = d => `${d.getUTCDate()}`; const month = d => MONTHS[d.getUTCMonth()];
  return month(start) === month(end) ? `${day(start)}-${day(end)} ${month(end)}` : `${day(start)} ${month(start)}-${day(end)} ${month(end)}`;
}

const names = ids => (ids.length > 1 ? `${ids.slice(0, -1).join(', ')} dan ${ids.at(-1)}` : ids[0]);

// rows: ranked members still in the server; roleTo: who got the role this week (empty when it did not move).
function boardText({ monday, rows, total, roleTo }) {
  return [`📚 **Rajin Belajar** · ${weekLabel(monday)}`,
    ...rows.slice(0, TOP).map(row => `${MEDALS[row.rank - 1] || `${row.rank}.`} <@${row.user}> · ${duration(row.seconds)}`),
    `Total server: ${duration(total)} fokus bareng.`,
    ...(roleTo.length ? [`Role **Rajin Belajar** pindah ke ${names(roleTo.map(id => `<@${id}>`))}.`] : []),
  ].join('\n');
}

function myMinutesText({ seconds, rank, count, lastSeconds }) {
  const last = lastSeconds ? ` Minggu lalu: ${duration(lastSeconds)}.` : '';
  if (!seconds) return `Minggu ini belum ada menit fokus. Masuk 📚・Bikin Belajar, terus mulai Pomodoro dari panel room.${last}`;
  if (seconds < FLOOR) return `Minggu ini: ${duration(seconds)} fokus. Belum masuk papan, minimal 25 menit.${last}`;
  return `Minggu ini: ${duration(seconds)} fokus (peringkat ${rank} dari ${count}).${last}`;
}

module.exports = { FLOOR, ranked, duration, weekLabel, boardText, myMinutesText };
