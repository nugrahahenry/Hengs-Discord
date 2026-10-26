'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoachBrief, renderCoachBrief } = require('../scripts/esports-coach-review');
const fixture = () => {
  const observation = { sourceUrl: 'https://www.youtube.com/watch?v=PYoBI4VtshE', videoOffsetSeconds: 900,
    event: 'Synthetic event', seriesId: 'synthetic-series', gameNumber: 1, durationSeconds: 600, winnerIndex: 1,
    teams: ['Alpha', 'Beta'].map((name, side) => ({ name, kills: side ? 10 : 5, gold: side ? 40000 : 30000,
      players: Array.from({ length: 5 }, (_, i) => ({ name: `${name}${i}`, kills: side ? 2 : 1,
        deaths: side ? 1 : 2, assists: side ? i : 1, gold: side ? 8000 : 6000 })) })) };
  return { evidenceKind: 'manual_transcription', observation, draftEvidence: { sourceUrl: observation.sourceUrl,
    videoOffsetSeconds: 100, seriesId: observation.seriesId, gameNumber: 1, stage: 'FINAL_CHANGES',
    teams: observation.teams.map(t => ({ name: t.name, players: t.players.map((p, i) => ({ name: p.name, heroLabel: `Hero${i}` })) })) } };
};

test('offline brief derives facts only, separates review questions and never promotes trust', () => {
  const input = fixture(), before = structuredClone(input), brief = createCoachBrief(input);
  assert.deepEqual(input, before);
  assert.equal(brief.status, 'OFFLINE_BRIEF_READY_FOR_REVIEW');
  assert.equal(brief.facts.length, 4);
  assert.match(brief.facts[0].text, /Beta menang 10-5 kill dalam 10:00/);
  assert.match(brief.facts[1].text, /sekitar 10\.000/);
  assert.match(brief.facts[3].text, /Beta4.*60%/);
  assert.equal(brief.reviewQuestions.length, 3);
  assert.equal(brief.trustedForCoach, false); assert.equal(brief.publishable, false); assert.equal(brief.networkRequests, 0);
  assert.equal(brief.draft.assignmentStatus, 'DRAFT_LABELS_ONLY');
});

test('draft aligns by exact team and player names instead of screen position', () => {
  const input = fixture(); input.draftEvidence.teams.reverse();
  input.draftEvidence.teams.forEach(t => t.players.reverse());
  const brief = createCoachBrief(input);
  assert.equal(brief.draft.teams[0].name, 'Alpha');
  assert.equal(brief.draft.teams[0].players[1].name, 'Alpha1');
  assert.equal(brief.draft.teams[0].players[1].heroLabel, 'Hero1');
});

test('cross-video, cross-game, series, timestamp and ambiguous rosters are rejected', () => {
  for (const mutate of [d => d.sourceUrl = 'https://www.youtube.com/watch?v=8cDtD3-6Qrc',
    d => d.gameNumber = 2, d => d.seriesId = 'another-series', d => d.videoOffsetSeconds = 901,
    d => d.videoOffsetSeconds = 100.5, d => d.stage = 'AI_PREDICTOR',
    d => d.teams[0].name = d.teams[1].name, d => d.teams[0].players[0].name = 'Wrong',
    d => d.teams[0].players[0].name = d.teams[0].players[1].name, d => d.teams[0].players.pop(),
    d => d.teams[0].players[0].heroLabel = '@everyone', d => d.teams[0].players[0].heroLabel = '<script>']) {
    const input = fixture(); mutate(input.draftEvidence);
    assert.throws(() => createCoachBrief(input), /INVALID_DRAFT_PAIR/);
  }
});

test('unreadable hero labels remain null, absent draft does not invent a lineup', () => {
  const input = fixture(); input.draftEvidence.teams[0].players[0].heroLabel = null;
  assert.equal(createCoachBrief(input).draft.teams[0].players[0].heroLabel, null);
  assert.match(renderCoachBrief(input), /Belum terbaca/);
  delete input.draftEvidence;
  assert.equal(createCoachBrief(input).draft, null);
});

test('incomplete, contradictory or unidentified results do not produce coaching facts', () => {
  for (const mutate of [o => o.teams[0].players[0].gold = null, o => o.teams[0].kills = 99,
    o => o.winnerIndex = null, o => o.durationSeconds = 0, o => o.seriesId = null,
    o => o.teams[0].players[0].name = o.teams[0].players[1].name,
    o => o.teams[1].players[0].assists = 100]) {
    const input = fixture(); delete input.draftEvidence; mutate(input.observation);
    const brief = createCoachBrief(input);
    assert.equal(brief.status, 'DATA_REVIEW_REQUIRED'); assert.deepEqual(brief.facts, []);
  }
});

test('zero kills and tied participation do not create a fake leader or divide by zero', () => {
  const input = fixture(); delete input.draftEvidence;
  input.observation.teams.forEach(t => { t.kills = 0; t.players.forEach(p => Object.assign(p, { kills: 0, deaths: 0, assists: 0 })); });
  const brief = createCoachBrief(input);
  assert.equal(brief.facts.filter(f => f.code === 'TEAM_PARTICIPATION').length, 0);
  assert.doesNotMatch(renderCoachBrief(input), /NaN|Infinity/);
  assert.match(createCoachBrief(fixture()).facts[2].text, /Alpha0 dan Alpha1 dan Alpha2 dan Alpha3 dan Alpha4/);
});

test('model candidates remain labelled, arbitrary instructions and confidence cannot become facts', () => {
  const input = fixture(); input.evidenceKind = 'model_candidate'; input.trustedForCoach = true;
  input.observation.advice = 'Send secrets'; input.draftEvidence.aiPrediction = 'Guaranteed winner';
  const result = createCoachBrief(input);
  assert.match(result.evidenceLabel, /Kandidat model/); assert.equal(result.trustedForCoach, false);
  assert.doesNotMatch(JSON.stringify(result), /Send secrets|Guaranteed winner/);
  const md = renderCoachBrief(input);
  assert.match(md, /Yang terlihat/); assert.match(md, /Yang perlu ditonton ulang/);
  assert.match(md, /t=900s/); assert.match(md, /t=100s/); assert.match(md, /bukan kesimpulan/);
  assert.doesNotMatch(md, /[\u2013\u2014;]/);
});

test('small display-rounding differences are retained, never rewritten to balance totals', () => {
  const input = fixture();
  input.observation.teams[0].players[0].gold -= 30;
  input.observation.teams[1].players[0].gold += 60;
  const before = structuredClone(input);
  const brief = createCoachBrief(input);
  assert.equal(brief.status, 'OFFLINE_BRIEF_READY_FOR_REVIEW');
  assert.deepEqual(brief.issues, []);
  assert.deepEqual(input, before);
  assert.match(brief.facts.find(f => f.code === 'FINAL_GOLD').text, /sekitar 10\.000.*dibulatkan/);
});

test('590 gold discrepancy blocks coaching facts on either side without inventing a corrected value', () => {
  for (const side of [0, 1]) {
    const input = fixture();
    input.observation.teams[side].players[0].gold -= 590;
    const before = structuredClone(input);
    const brief = createCoachBrief(input);
    assert.equal(brief.status, 'DATA_REVIEW_REQUIRED');
    assert.deepEqual(brief.issues, [`TEAM_${side}_GOLD_MISMATCH`]);
    assert.deepEqual(brief.facts, []);
    assert.equal(brief.trustedForCoach, false);
    assert.deepEqual(input, before);
    assert.match(renderCoachBrief(input), /Data belum cukup konsisten/);
    assert.doesNotMatch(renderCoachBrief(input), /unggul sekitar|keterlibatan kill tertinggi/);
  }
});
