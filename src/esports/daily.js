'use strict';

// What the match-day cards and captions say, built only from parsed Liquipedia data and stored votes. No AI text in
// v1.80.0: the LLM caster arrives in v1.81.0 and must pass a check against these same facts.
const crypto = require('node:crypto');
const { wibDate } = require('./card');
const { record, heroPool, statsOf, tag, wibDay } = require('./schedule');
const { shareRight } = require('./predictions');
const { heroes } = require('../scrim/mlbb-heroes.json');

const HERO_NAMES = heroes.map(hero => hero.name);
const words = text => ` ${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

const wibTime = at => new Date(at + 7 * 3_600_000).toISOString().slice(11, 16);
const dayLabel = day => wibDate(Date.parse(`${day}T05:00:00Z`)).split(' · ')[0];
const leagues = matches => [...new Set(matches.map(m => m.league).filter(Boolean))].join(' · ');
const done = m => m.finished && m.valid;
const bo = m => `Bo${m.bestof || '?'}`;
// Names drawn on a card: the VM has no emoji font, so only letters, digits, punctuation and spaces stay.
const cleanName = value => String(value || '').replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 32) || 'Anggota';

function previewData(match, all) {
  const [a, b] = match.teams;
  const rec = record(all, match.family, a, b);
  return {
    title: [match.league, match.stage].filter(Boolean).join(' · '),
    date: dayLabel(new Date(match.startAt + 7 * 3_600_000).toISOString().slice(0, 10)),
    time: `${wibTime(match.startAt)} WIB`,
    bestof: bo(match),
    teams: match.teams.map(t => ({ name: t.name, ticker: t.ticker })),
    record: rec.series[0] + rec.series[1]
      ? `Musim ini: ${tag(a)} ${rec.series[0]}-${rec.series[1]} ${tag(b)} (game ${rec.games[0]}-${rec.games[1]})`
      : 'Belum pernah ketemu musim ini',
    heroes: [heroPool(all, match.family, a), heroPool(all, match.family, b)],
  };
}
// Captions take an optional line from the LLM caster; without one the template stands.
const previewCaption = (match, line = null) => [
  `**${match.teams[0].name} vs ${match.teams[1].name}** · ${wibTime(match.startAt)} WIB · ${bo(match)}`,
  line,
  'Tebak pemenangnya pakai tombol di bawah. Tebakan dikunci pas laga mulai, cuma buat seru-seruan.',
].filter(Boolean).join('\n');
// What a posted preview shows; a different hash means the schedule changed and the card is edited.
const previewHash = match => crypto.createHash('sha256').update(JSON.stringify({ at: match.startAt, stage: match.stage,
  bestof: match.bestof, teams: match.teams.map(t => [t.key, t.name, t.ticker]) })).digest('hex').slice(0, 16);

function compactData(matches, day, featuredIds) {
  return { title: `Jadwal hari ini · ${leagues(matches)}`, date: dayLabel(day), sections: [{ heading: `${matches.length} laga`,
    lines: matches.map(m => `${wibTime(m.startAt)} WIB · ${tag(m.teams[0])} vs ${tag(m.teams[1])} · ${bo(m)}${featuredIds.has(m.id) ? ' · ada tebakan' : ''}`) }] };
}
const compactCaption = (matches, day) => `**Jadwal ${dayLabel(day)}**: ${matches.length} laga. Tombol tebakan ada di kartu laga unggulan di bawah.`;

// Pekan Playoff H-1 (owner request, 2026-10-31): an event's whole schedule on one card. Liquipedia's open slots read in
// Indonesian; the first 12 matches are listed and the rest summed up.
const WEEK_LINES = 12;
function slotName(team) {
  if (team?.ticker) return team.ticker;
  const name = String(team?.name || '').trim();
  const slot = /^(.+?)\s+(winner|loser)$/i.exec(name);
  return slot ? `${slot[2].toLowerCase() === 'winner' ? 'Pemenang' : 'Kalah'} ${slot[1]}` : name || 'TBD';
}
function weekData(matches, event) {
  const list = matches.filter(m => m.startAt).sort((a, b) => a.startAt - b.startAt);
  const shown = list.slice(0, WEEK_LINES);
  const days = [...new Set(shown.map(m => wibDay(m.startAt)))];
  const sections = days.map(day => ({ heading: dayLabel(day), lines: shown.filter(m => wibDay(m.startAt) === day)
    .map(m => [`${wibTime(m.startAt)} WIB`, `${slotName(m.teams[0])} vs ${slotName(m.teams[1])}`, bo(m), m.stage].filter(Boolean).join(' · ')) }));
  if (list.length > shown.length) sections.at(-1).lines.push(`+${list.length - shown.length} laga lagi, jadwal lengkap di Liquipedia`);
  const first = wibDay(list[0].startAt); const last = wibDay(list.at(-1).startAt);
  return { title: `Jadwal lengkap · ${event}`, date: first === last ? dayLabel(first) : `${dayLabel(first)} sampai ${dayLabel(last)}`, sections };
}
const weekCaption = (event, { stream = null, today = false } = {}) => [
  `**${event} mulai ${today ? 'hari ini' : 'besok'}!** Jadwal lengkapnya ada di kartu.`,
  '• Tebakan: tiap hari tanding jam 08:00 WIB ada preview dengan tombol tebak, masuk klasemen Liga Tebak.',
  '• Nobar: masuk 🎬・Bikin Nobar buat bikin room. Pemilik room bisa nyalain 📢 Mode siaran biar cuma dia (dan yang dikasih mic) yang ngomong.',
  '• Klik 🔔 Ingetin aku di bawah buat di-ping sekitar 15 menit sebelum tiap laga yang ada preview-nya. Klik lagi buat berhenti.',
  stream ? `Live: <${stream}>` : '',
].filter(Boolean).join('\n');

// A Liga Tebak standings row: rank, display name (no ping), points and right guesses.
const standingLine = (row, names) => `${row.rank}. ${names[row.user] || 'Anggota'} · ${row.points} poin (${row.right} benar dari ${row.votes})`;
const participantLine = (row, names) => `${names[row.user] || 'Anggota'} · ${row.votes} tebakan · ${row.right} benar · ${row.points} poin`;

function guessLines(matches, votesByMatch = {}, names = {}) {
  return matches.filter(done).flatMap(match => {
    const picks = Object.entries(votesByMatch[match.id] || {});
    if (!picks.length) return [];
    const label = `${tag(match.teams[0])} vs ${tag(match.teams[1])}`;
    return picks.map(([user, team]) => `${label} · ${names[user] || 'Anggota'} → ${tag(match.teams[Number(team) - 1])} ${Number(team) === match.winner ? '✅' : '❌'}`);
  }).slice(0, 30);
}

// hot: the day's Laga Panas ids; tables: [{ event, rows }] of ranked Liga Tebak rows (league.js), shown top 5.
function dayRecapData(matches, day, votesByMatch, { hot = new Set(), tables = [], names = {} } = {}) {
  const finished = matches.filter(done);
  const s = statsOf(finished);
  const result = m => {
    const share = shareRight(votesByMatch[m.id], m.winner);
    return `${tag(m.teams[0])} ${m.score[0]}-${m.score[1]} ${tag(m.teams[1])}${share.voters ? ` · ${share.share}% nebak bener (${share.voters} orang)` : ''}`;
  };
  const hotLines = matches.filter(m => hot.has(m.id)).map(m =>
    `Laga Panas: ${tag(m.teams[0])} vs ${tag(m.teams[1])} (${Object.keys(votesByMatch[m.id] || {}).length} penebak, poin dobel)`);
  const sections = [
    { heading: 'Hasil', lines: [...finished.map(result), ...matches.filter(m => !done(m)).map(m => `${tag(m.teams[0])} vs ${tag(m.teams[1])} · belum selesai`),
      ...hotLines] },
    { heading: 'Angka hari ini', lines: [
      s.picks[0] ? `Hero terlaris: ${s.picks[0].name} (${s.picks[0].count} dari ${s.games} game)` : null,
      s.bans[0] ? `Ban terbanyak: ${s.bans[0].name} (${s.bans[0].count} kali)` : null,
      s.best ? `Winrate tertinggi: ${s.best.name} (${s.best.wins} menang dari ${s.best.picks} pick)` : null,
      s.sides.decided ? `Sisi biru menang ${s.sides.blue}, sisi merah menang ${s.sides.red}` : null,
    ].filter(Boolean) },
    { heading: 'MVP', lines: s.mvps.map(x => `${x.mvp} (${tag(x.match.teams[x.match.winner - 1])})`) },
    ...tables.map(t => ({ heading: `Klasemen sementara ${t.event}`, lines: t.rows.slice(0, 5).map(row => standingLine(row, names)) })),
    ...tables.map(t => ({ heading: `Yang sudah nebak · ${t.event}`,
      lines: (t.participants || []).slice(0, 20).map(row => participantLine(row, names)) })),
    ...(guessLines(matches, votesByMatch, names).length ? [{ heading: 'Tebakan member', lines: guessLines(matches, votesByMatch, names) }] : []),
  ].filter(section => section.lines.length);
  return { title: `Rekap hari ini · ${leagues(matches)}`, date: dayLabel(day), sections };
}
const dayCaption = (matches, day, line = null) => `**Rekap ${dayLabel(day)}**: ${line || `${matches.filter(done)
  .map(m => `${tag(m.teams[m.winner - 1])} menang ${Math.max(...m.score)}-${Math.min(...m.score)}`).join(', ')}.`}`;

// table: the event's ranked Liga Tebak rows (league.js), shown top 10 under the champions.
function eventRecapData(state, event, { table = [], participants = [], names = {}, votesByMatch = {} } = {}) {
  const { final, matches } = state;
  const s = statsOf(matches, { top: 5 });
  const winner = final.teams[final.winner - 1]; const loser = final.teams[2 - final.winner];
  const game = x => `${tag(x.match.teams[0])} vs ${tag(x.match.teams[1])} game ${x.number} (${x.length})`;
  const champs = table.filter(row => row.rank === 1).map(row => names[row.user] || 'Anggota');
  return {
    title: `Rekap event · ${event}`, date: dayLabel(new Date(final.startAt + 7 * 3_600_000).toISOString().slice(0, 10)),
    headline: `${winner.name} juara!`,
    subline: `Final: ${tag(final.teams[0])} ${final.score[0]}-${final.score[1]} ${tag(final.teams[1])} · runner-up ${loser.name}${final.mvp ? ` · MVP final ${final.mvp}` : ''}`,
    sections: [
      { heading: `${s.series} series, ${s.games} game`, lines: [
        s.picks.length ? `Hero terlaris: ${s.picks.map(h => `${h.name} ${h.count}`).join(', ')}` : null,
        s.bans.length ? `Ban terbanyak: ${s.bans.map(h => `${h.name} ${h.count}`).join(', ')}` : null,
        s.longest ? `Game terlama: ${game(s.longest)}` : null,
        s.shortest ? `Game tercepat: ${game(s.shortest)}` : null,
        s.sides.decided ? `Sisi biru menang ${s.sides.blue}, sisi merah menang ${s.sides.red}` : null,
      ].filter(Boolean) },
      { heading: 'Klasemen final Liga Tebak', lines: table.length
        ? [`Juara Liga Tebak: ${champs.join(' dan ')}`, ...table.slice(0, 10).map(row => standingLine(row, names))] : [] },
      ...(participants.length ? [{ heading: 'Yang sudah nebak', lines: participants.slice(0, 20).map(row => participantLine(row, names)) }] : []),
      ...(guessLines([final], votesByMatch, names).length
        ? [{ heading: 'Tebakan final', lines: guessLines([final], votesByMatch, names) }]
        : []),
    ].filter(section => section.lines.length),
  };
}
const eventCaption = (state, event, line = null, champions = []) => `**${state.final.teams[state.final.winner - 1].name} juara ${event}!** `
  + `${line || 'Rekap lengkapnya ada di kartu.'}${champions.length ? `\nJuara Liga Tebak: ${champions.join(' dan ')} 🏆` : ''}`;

// The facts a caption may use: exactly the lines on the card.
function factsOf(data) {
  if (data.teams) {
    return [data.title, data.date, `${data.time} · ${data.bestof}`, `${data.teams[0].name} vs ${data.teams[1].name}`, data.record,
      ...data.teams.map((team, i) => `Andalan ${team.ticker || team.name}: ${data.heroes[i].map(h => `${h.name} (${h.picks} game)`).join(', ') || 'belum ada data hero'}`)]
      .join('\n');
  }
  return [data.title, data.date, data.headline, data.subline, ...data.sections.map(s => `${s.heading}: ${s.lines.join('; ')}`)]
    .filter(Boolean).join('\n');
}

// What Hengs knows for an Analis question: results of the last 7 days, today's schedule, the next matches, hero counts,
// and a line for every hero the question names (the top-5 lists alone left those out).
function analisCard(all, now, question = '') {
  const WEEK = 7 * 86_400_000;
  const day = m => new Date(m.startAt + 7 * 3_600_000).toISOString().slice(0, 10);
  const today = new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
  const known = m => m.startAt && m.teams.every(t => t.key?.trim() && !/^(tbd|tba)$/i.test(t.key.trim()));
  const recent = all.filter(m => done(m) && m.startAt && m.startAt <= now && now - m.startAt <= WEEK)
    .sort((a, b) => b.startAt - a.startAt).slice(0, 15);
  const todays = all.filter(m => known(m) && !done(m) && day(m) === today).sort((a, b) => a.startAt - b.startAt);
  const next = all.filter(m => known(m) && !done(m) && day(m) > today && m.startAt - now <= 2 * WEEK)
    .sort((a, b) => a.startAt - b.startAt).slice(0, 5);
  const s = statsOf(recent, { top: 5 });
  const asked = words(question);
  const named = HERO_NAMES.filter(name => words(name).trim().length >= 3 && asked.includes(words(name)))
    .sort((a, b) => asked.indexOf(words(a)) - asked.indexOf(words(b))).slice(0, 3);
  const decided = recent.flatMap(m => m.games.filter(g => g.winner));
  const heroLine = name => {
    const picks = decided.flatMap(g => [0, 1].filter(t => (g.picks[t] || []).includes(name)).map(t => g.winner === t + 1));
    const bans = decided.filter(g => [0, 1].some(t => (g.bans[t] || []).includes(name))).length;
    return `${name}: dipick ${picks.length} kali (menang ${picks.filter(Boolean).length}), diban ${bans} kali dalam 7 hari terakhir`;
  };
  return [
    recent.length ? `Hasil 7 hari terakhir:\n${recent.map(m => `- ${dayLabel(day(m))} · ${m.league} · ${m.teams[0].name} ${m.score[0]}-${m.score[1]} ${m.teams[1].name}${m.mvp ? ` · MVP ${m.mvp}` : ''}`).join('\n')}` : null,
    todays.length ? `Jadwal hari ini:\n${todays.map(m => `- ${wibTime(m.startAt)} WIB · ${m.teams[0].name} vs ${m.teams[1].name} · ${m.league}`).join('\n')}` : null,
    next.length ? `Jadwal berikutnya:\n${next.map(m => `- ${dayLabel(day(m))} ${wibTime(m.startAt)} WIB · ${m.teams[0].name} vs ${m.teams[1].name} · ${m.league}`).join('\n')}` : null,
    s.picks.length ? `Hero terlaris 7 hari: ${s.picks.map(h => `${h.name} ${h.count}`).join(', ')} (dari ${s.games} game)` : null,
    s.bans.length ? `Ban terbanyak 7 hari: ${s.bans.map(h => `${h.name} ${h.count}`).join(', ')}` : null,
    recent.length && named.length ? `Hero yang ditanya:\n${named.map(heroLine).join('\n')}` : null,
  ].filter(Boolean).join('\n');
}

module.exports = { wibTime, dayLabel, cleanName, previewData, previewCaption, previewHash, compactData, compactCaption,
  guessLines, dayRecapData, dayCaption, eventRecapData, eventCaption, factsOf, analisCard, slotName, weekData, weekCaption };
