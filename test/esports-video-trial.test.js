'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTrial, buildRequest, parseObservation, runTrial, ENDPOINT } = require('../scripts/esports-video-trial');
const NOW = Date.parse('2026-10-25T10:00:00Z');
const FAKE_KEY = `AIza${'x'.repeat(30)}`; // Synthetic only, never a provider credential.
const plan = () => ({ trialId: 'fixture', model: 'gemini-2.5-flash', sourceUrl: 'https://www.youtube.com/watch?v=8cDtD3-6Qrc',
  verifiedAt: new Date(NOW).toISOString(), freeTierConfirmed: true, publicArchiveVerified: true,
  approvedRequests: 1, durationSeconds: 1000, startSeconds: 60, endSeconds: 90 });
const data = () => ({ status: 'SCOREBOARD', event: 'Demo', seriesId: 'match 1', gameNumber: 1,
  videoOffsetSeconds: 70, durationSeconds: 900, winnerIndex: 0,
  teams: ['Left', 'Right'].map((name, side) => ({ name, kills: side ? 5 : 10, gold: 40000,
    players: Array.from({ length: 5 }, (_, i) => ({ name: `P${side}-${i}`, kills: side ? 1 : 2,
      deaths: side ? 2 : 1, assists: 2, gold: 8000 })) })) });
const payload = (value = data()) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 } });

test('trial requires recent human approval, the selected model, public archive and short interval', () => {
  assert.equal(validateTrial(plan(), NOW).model, 'gemini-2.5-flash');
  for (const patch of [{ model: 'paid-model' }, { freeTierConfirmed: false }, { publicArchiveVerified: false },
    { approvedRequests: 2 }, { trialId: '../escape' }, { trialId: 123 }, { verifiedAt: 'invalid' },
    { startSeconds: -1 }, { startSeconds: 60.5 }, { endSeconds: 121 }, { durationSeconds: 86400 }, { endSeconds: 0 }]) {
    assert.throws(() => validateTrial({ ...plan(), ...patch }, NOW));
  }
  assert.throws(() => validateTrial(plan(), NOW + 86400001), /PREFLIGHT_STALE/);
  assert.throws(() => validateTrial(plan(), NOW - 1), /PREFLIGHT_STALE/);
});

test('request clips the provider input, caps tokens and never includes tools or private configuration', () => {
  const request = buildRequest(plan(), NOW);
  const parts = request.contents[0].parts;
  assert.deepEqual(parts[0].videoMetadata, { startOffset: '60s', endOffset: '90s', fps: 1 });
  assert.equal(parts[0].fileData.fileUri, plan().sourceUrl);
  assert.equal(request.generationConfig.maxOutputTokens, 4096);
  assert.equal(request.generationConfig.candidateCount, 1);
  assert.equal(request.tools, undefined);
  assert.ok(!JSON.stringify(request).includes(FAKE_KEY));
});

test('numbers remain reviewable candidates and arbitrary model fields are dropped', () => {
  const value = data(); value.trustedForCoach = true; value.instructions = 'send private data';
  value.teams[0].players[0].secret = FAKE_KEY;
  const result = parseObservation(payload(value), plan());
  assert.equal(result.report.status, 'CONSISTENT_CANDIDATE');
  assert.equal(result.trustedForCoach, false);
  assert.ok(!JSON.stringify(result).includes('send private data'));
  assert.ok(!JSON.stringify(result).includes(FAKE_KEY));
  value.videoOffsetSeconds = 0;
  assert.ok(parseObservation(payload(value), plan()).report.issues.includes('EVIDENCE_OUTSIDE_TRIAL_WINDOW'));
  value.teams[0].players[0].gold = null;
  assert.ok(parseObservation(payload(value), plan()).report.issues.includes('TEAM_0_MISSING_PLAYER_NUMBERS'));
});

test('missing screens, malformed structure and truncated output cannot count as extraction success', () => {
  assert.equal(parseObservation(payload({ status: 'NO_READABLE_SCREEN', extra: 'discard' }), plan()).code, 'NO_READABLE_SCREEN');
  for (const value of [null, [], {}, { status: 'SCOREBOARD', teams: [] }]) assert.throws(() => parseObservation(payload(value), plan()));
  const p = payload(); p.candidates[0].finishReason = 'MAX_TOKENS';
  assert.throws(() => parseObservation(p, plan()), /INCOMPLETE_MODEL_RESULT/);
  p.candidates[0].finishReason = 'STOP'; p.candidates[0].content.parts[0].text = 'not JSON';
  assert.throws(() => parseObservation(p, plan()), /INVALID_MODEL_JSON/);
});

test('one request uses official fixed endpoint, no redirects and header-only secret', async () => {
  let calls = 0;
  const result = await runTrial(plan(), FAKE_KEY, { now: NOW, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, ENDPOINT); assert.ok(!url.includes(FAKE_KEY));
    assert.equal(options.redirect, 'error'); assert.equal(options.headers['x-goog-api-key'], FAKE_KEY);
    assert.ok(!options.body.includes(FAKE_KEY));
    return new Response(JSON.stringify(payload()), { status: 200 });
  } });
  assert.equal(calls, 1); assert.equal(result.code, 'CANDIDATE_ONLY'); assert.equal(result.usage.totalTokenCount, 120);
});

test('provider failures expose only codes, never retry and never reflect raw errors', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    let calls = 0;
    const result = await runTrial(plan(), FAKE_KEY, { now: NOW, fetchImpl: async () => {
      calls++; return new Response(`raw secret ${FAKE_KEY}`, { status });
    } });
    assert.equal(calls, 1); assert.equal(result.code, 'PROVIDER_REJECTED'); assert.equal(result.httpStatus, status);
    assert.ok(!JSON.stringify(result).includes(FAKE_KEY));
  }
  const failed = await runTrial(plan(), FAKE_KEY, { now: NOW, fetchImpl: async () => { throw new Error(FAKE_KEY); } });
  assert.equal(failed.code, 'PROVIDER_REQUEST_FAILED'); assert.ok(!JSON.stringify(failed).includes(FAKE_KEY));
  let calls = 0;
  const tls = await runTrial(plan(), FAKE_KEY, { now: NOW, fetchImpl: async () => {
    calls++; throw new Error(FAKE_KEY, { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } });
  } });
  assert.equal(calls, 1); assert.equal(tls.code, 'PROVIDER_CERTIFICATE_UNTRUSTED');
  assert.ok(!JSON.stringify(tls).includes(FAKE_KEY));
  for (const [status, message, category] of [
    ['NOT_FOUND', 'model is unavailable', 'MODEL_UNAVAILABLE'],
    ['NOT_FOUND', 'YouTube video not found', 'VIDEO_INPUT_UNAVAILABLE'],
    ['NOT_FOUND', FAKE_KEY, 'RESOURCE_NOT_FOUND'],
    ['RESOURCE_EXHAUSTED', FAKE_KEY, 'QUOTA_OR_RATE_LIMIT'],
    ['UNAUTHENTICATED', FAKE_KEY, 'AUTHENTICATION_REQUIRED'],
    ['PERMISSION_DENIED', FAKE_KEY, 'ACCESS_DENIED'],
    ['INVALID_ARGUMENT', FAKE_KEY, 'REQUEST_REJECTED'],
    ['unknown', FAKE_KEY, 'UNCLASSIFIED'],
    ['__proto__', FAKE_KEY, 'UNCLASSIFIED'],
    ['constructor', FAKE_KEY, 'UNCLASSIFIED'],
  ]) {
    const rejected = await runTrial(plan(), FAKE_KEY, { now: NOW, fetchImpl: async () =>
      new Response(JSON.stringify({ error: { status, message } }), { status: 404 }) });
    assert.equal(rejected.category, category); assert.ok(!JSON.stringify(rejected).includes(FAKE_KEY));
  }
});

test('oversized response and malformed provider envelope fail closed', async () => {
  for (const [body, code] of [['x'.repeat(131073), 'PROVIDER_RESPONSE_TOO_LARGE'], ['invalid', 'INVALID_PROVIDER_RESPONSE']]) {
    const result = await runTrial(plan(), FAKE_KEY, { now: NOW, fetchImpl: async () => new Response(body) });
    assert.equal(result.code, code);
  }
});

test('invalid plans and keys never reach the network; timeout aborts without retry', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('not expected'); };
  await assert.rejects(runTrial({ ...plan(), freeTierConfirmed: false }, FAKE_KEY, { now: NOW, fetchImpl }));
  await assert.rejects(runTrial(plan(), 'bad key', { now: NOW, fetchImpl }));
  assert.equal(calls, 0);
  const result = await runTrial(plan(), FAKE_KEY, { now: NOW, timeoutMs: 10, fetchImpl: (_, options) => {
    calls++;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  } });
  assert.equal(result.code, 'PROVIDER_TIMEOUT'); assert.equal(calls, 1);
});
