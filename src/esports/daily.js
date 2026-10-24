'use strict';

// What the match-day cards and captions say, built only from parsed Liquipedia data and stored votes. No AI text in
// v1.80.0: the LLM caster arrives in v1.81.0 and must pass a check against these same facts.
const crypto = require('node:crypto');
const { wibDate } = require('./card');
const { record, heroPool, statsOf, tag } = require('./schedule');
const { shareRight, topGuessers } = require('./predictions');

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
const previewCaption = match => [
  `**${match.teams[0].name} vs ${match.teams[1].name}** · ${wibTime(match.startAt)} WIB · ${bo(match)}`,
  'Tebak pemenangnya pakai tombol di bawah. Tebakan dikunci pas laga mulai, cuma buat seru-seruan.',
].join('\n');
// What a posted preview shows; a different hash means the schedule changed and the card is edited.
const previewHash = match => crypto.createHash('sha256').update(JSON.stringify({ at: match.startAt, stage: match.stage,
  bestof: match.bestof, teams: match.teams.map(t => [t.key, t.name, t.ticker]) })).digest('hex').slice(0, 16);

function compactData(matches, day, featuredIds) {
  return { title: `Jadwal hari ini · ${leagues(matches)}`, date: dayLabel(day), sections: [{ heading: `${matches.length} laga`,
    lines: matches.map(m => `${wibTime(m.startAt)} WIB · ${tag(m.teams[0])} vs ${tag(m.teams[1])} · ${bo(m)}${featuredIds.has(m.id) ? ' · ada tebakan' : ''}`) }] };
}
const compactCaption = (matches, day) => `**Jadwal ${dayLabel(day)}**: ${matches.length} laga. Tombol tebakan ada di kartu laga unggulan di bawah.`;

function dayRecapData(matches, day, votesByMatch) {
  const finished = matches.filter(done);
  const s = statsOf(finished);
  const result = m => {
    const share = shareRight(votesByMatch[m.id], m.winner);
    return `${tag(m.teams[0])} ${m.score[0]}-${m.score[1]} ${tag(m.teams[1])}${share.voters ? ` · ${share.share}% nebak bener (${share.voters} orang)` : ''}`;
  };
  const sections = [
    { heading: 'Hasil', lines: [...finished.map(result), ...matches.filter(m => !done(m)).map(m => `${tag(m.teams[0])} vs ${tag(m.teams[1])} · belum selesai`)] },
    { heading: 'Angka hari ini', lines: [
      s.picks[0] ? `Hero terlaris: ${s.picks[0].name} (${s.picks[0].count} dari ${s.games} game)` : null,
      s.bans[0] ? `Ban terbanyak: ${s.bans[0].name} (${s.bans[0].count} kali)` : null,
      s.best ? `Winrate tertinggi: ${s.best.name} (${s.best.wins} menang dari ${s.best.picks} pick)` : null,
      s.sides.decided ? `Sisi biru menang ${s.sides.blue}, sisi merah menang ${s.sides.red}` : null,
    ].filter(Boolean) },
    { heading: 'MVP', lines: s.mvps.map(x => `${x.mvp} (${tag(x.match.teams[x.match.winner - 1])})`) },
  ].filter(section => section.lines.length);
  return { title: `Rekap hari ini · ${leagues(matches)}`, date: dayLabel(day), sections };
}
const dayCaption = (matches, day) => `**Rekap ${dayLabel(day)}**: ${matches.filter(done)
  .map(m => `${tag(m.teams[m.winner - 1])} menang ${Math.max(...m.score)}-${Math.min(...m.score)}`).join(', ')}.`;

function eventRecapData(state, event, votesByMatch, names) {
  const { final, matches } = state;
  const s = statsOf(matches, { top: 5 });
  const winner = final.teams[final.winner - 1]; const loser = final.teams[2 - final.winner];
  const game = x => `${tag(x.match.teams[0])} vs ${tag(x.match.teams[1])} game ${x.number} (${x.length})`;
  const guessers = topGuessers(votesByMatch, matches);
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
      { heading: 'Penebak paling jitu', lines: guessers.map((x, i) => `${i + 1}. ${names[x.user] || 'Anggota'} · ${x.right} benar dari ${x.votes} tebakan`) },
    ].filter(section => section.lines.length),
  };
}
const eventCaption = (state, event) => `**${state.final.teams[state.final.winner - 1].name} juara ${event}!** Rekap lengkapnya ada di kartu.`;

module.exports = { wibTime, dayLabel, cleanName, previewData, previewCaption, previewHash, compactData, compactCaption,
  dayRecapData, dayCaption, eventRecapData, eventCaption };
