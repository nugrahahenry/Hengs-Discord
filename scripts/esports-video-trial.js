'use strict';

// Supervised public-video experiment only. Never imported by the bot or a scheduler.
const { canonicalVideoUrl, inspectScoreboard, REVIEW_PROMPT } = require('./esports-video-lab');
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_RESPONSE_BYTES = 128 * 1024;
const fail = code => { throw new Error(code); };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const uint = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;

function validateTrial(plan, now = Date.now()) {
  if (!record(plan) || plan.model !== MODEL || plan.freeTierConfirmed !== true
    || plan.publicArchiveVerified !== true || plan.approvedRequests !== 1
    || typeof plan.trialId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(plan.trialId)) fail('TRIAL_NOT_APPROVED');
  if (typeof plan.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(plan.verifiedAt)) fail('PREFLIGHT_STALE');
  const verified = Date.parse(plan.verifiedAt);
  if (!Number.isFinite(now) || !Number.isFinite(verified) || verified > now
    || new Date(verified).toISOString() !== plan.verifiedAt || now - verified > 24 * 3600 * 1000) fail('PREFLIGHT_STALE');
  const source = canonicalVideoUrl(plan.sourceUrl);
  if (!uint(plan.durationSeconds, 28800) || !uint(plan.startSeconds, plan.durationSeconds)
    || !uint(plan.endSeconds, plan.durationSeconds) || plan.endSeconds <= plan.startSeconds
    || plan.endSeconds - plan.startSeconds > 60) fail('INVALID_TRIAL_WINDOW');
  return { trialId: plan.trialId, sourceUrl: source.url, model: MODEL,
    startSeconds: plan.startSeconds, endSeconds: plan.endSeconds };
}

function buildRequest(plan, now) {
  const trial = validateTrial(plan, now);
  return { contents: [{ role: 'user', parts: [
    { fileData: { fileUri: trial.sourceUrl, mimeType: 'video/mp4' },
      videoMetadata: { startOffset: `${trial.startSeconds}s`, endOffset: `${trial.endSeconds}s`, fps: 1 } },
    { text: `${REVIEW_PROMPT}\nReturn JSON only, one final scoreboard at most. Use status SCOREBOARD or NO_READABLE_SCREEN.
Do not use web search or prior knowledge. Do not include prose, commentary, faces or chat.
videoOffsetSeconds must be an absolute integer position in the original video, within ${trial.startSeconds}..${trial.endSeconds - 1}.
The JSON keys are status, videoOffsetSeconds, event, seriesId (visible match number or label), gameNumber,
durationSeconds (in-game duration), winnerIndex (0 for blue/left, 1 for red/right), teams.
teams has exactly two objects in left/right order: name, kills, gold, players.
Each players array has exactly five objects: name, kills, deaths, assists, gold. Gold is an integer, not a K string.
Unknown fields are null. If no final scoreboard is visible, return only {"status":"NO_READABLE_SCREEN"}.` },
  ] }], generationConfig: { candidateCount: 1, maxOutputTokens: 4096, temperature: 0,
    responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 512, includeThoughts: false } } };
}

function safeLabel(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 80
    && !/[\x00-\x1f\x7f<>@]/.test(value) && !/(?:AIza|AQ\.)[A-Za-z0-9._-]{15}/.test(value)
    ? value.trim() : null;
}

function parseObservation(payload, plan) {
  const candidate = payload?.candidates;
  if (!Array.isArray(candidate) || candidate.length !== 1 || candidate[0].finishReason !== 'STOP') {
    fail('INCOMPLETE_MODEL_RESULT');
  }
  const parts = candidate[0].content?.parts;
  if (!Array.isArray(parts) || parts.some(p => !record(p) || p.functionCall || p.executableCode)) fail('INVALID_MODEL_RESULT');
  const text = parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
  if (text.length > 32000) fail('INVALID_MODEL_RESULT');
  let value;
  try { value = JSON.parse(text); } catch { fail('INVALID_MODEL_JSON'); }
  if (!record(value)) fail('INVALID_MODEL_RESULT');
  if (value.status === 'NO_READABLE_SCREEN') return { code: 'NO_READABLE_SCREEN', trustedForCoach: false };
  if (value.status !== 'SCOREBOARD' || !Array.isArray(value.teams) || value.teams.length !== 2
    || value.teams.some(t => !record(t) || !Array.isArray(t.players) || t.players.length !== 5
      || t.players.some(p => !record(p)))) fail('INVALID_MODEL_RESULT');
  const number = (v, max) => uint(v, max) ? v : null;
  const observation = { sourceUrl: plan.sourceUrl,
    videoOffsetSeconds: number(value.videoOffsetSeconds, 28800),
    event: safeLabel(value.event), seriesId: safeLabel(value.seriesId),
    gameNumber: number(value.gameNumber, 99), durationSeconds: number(value.durationSeconds, 10800),
    winnerIndex: [0, 1].includes(value.winnerIndex) ? value.winnerIndex : null,
    teams: value.teams.map(t => ({ name: safeLabel(t.name), kills: number(t.kills, 200), gold: number(t.gold, 1000000),
      players: t.players.map(p => ({ name: safeLabel(p.name), kills: number(p.kills, 200),
        deaths: number(p.deaths, 200), assists: number(p.assists, 200), gold: number(p.gold, 200000) })) })) };
  const report = inspectScoreboard(observation);
  if (observation.videoOffsetSeconds === null || observation.videoOffsetSeconds < plan.startSeconds
    || observation.videoOffsetSeconds >= plan.endSeconds) {
    report.issues.push('EVIDENCE_OUTSIDE_TRIAL_WINDOW'); report.status = 'REVIEW_REQUIRED';
  }
  return { code: 'CANDIDATE_ONLY', trustedForCoach: false, observation, report };
}

async function readBounded(response) {
  const reader = response.body?.getReader();
  if (!reader) fail('EMPTY_PROVIDER_RESPONSE');
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) fail('PROVIDER_RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); }
}

// Provider prose is never returned, logged or stored. Classification is diagnostic, not retry permission.
function rejectionCategory(payload) {
  const status = payload?.error?.status;
  const message = typeof payload?.error?.message === 'string' ? payload.error.message : '';
  if (status === 'NOT_FOUND' && /youtube|video|file/i.test(message)) return 'VIDEO_INPUT_UNAVAILABLE';
  if (status === 'NOT_FOUND' && /model/i.test(message)) return 'MODEL_UNAVAILABLE';
  const categories = { RESOURCE_EXHAUSTED: 'QUOTA_OR_RATE_LIMIT', UNAUTHENTICATED: 'AUTHENTICATION_REQUIRED',
    PERMISSION_DENIED: 'ACCESS_DENIED', INVALID_ARGUMENT: 'REQUEST_REJECTED', NOT_FOUND: 'RESOURCE_NOT_FOUND' };
  return typeof status === 'string' && Object.hasOwn(categories, status) ? categories[status] : 'UNCLASSIFIED';
}

async function runTrial(plan, apiKey, { fetchImpl = fetch, now = Date.now(), timeoutMs = 90000 } = {}) {
  const trial = validateTrial(plan, now);
  const body = buildRequest(plan, now);
  if (typeof apiKey !== 'string' || !/^(?:AIza|AQ\.)[A-Za-z0-9._-]{20,4096}$/.test(apiKey)) fail('INVALID_PRIVATE_CONFIG');
  if (!uint(timeoutMs, 90000) || timeoutMs < 1) fail('INVALID_TIMEOUT');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Fixed official destination, header-only secret, one request, no SDK retry or redirects.
    const response = await fetchImpl(ENDPOINT, { method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) });
    if (!response.ok) {
      let category = 'UNCLASSIFIED';
      try { category = rejectionCategory(JSON.parse(await readBounded(response))); } catch { /* Unreadable body stays unclassified. */ }
      return { code: 'PROVIDER_REJECTED', httpStatus: response.status, category, requests: 1, trustedForCoach: false };
    }
    let payload;
    try { payload = JSON.parse(await readBounded(response)); } catch (err) {
      if (err.message === 'PROVIDER_RESPONSE_TOO_LARGE') throw err;
      fail('INVALID_PROVIDER_RESPONSE');
    }
    const result = parseObservation(payload, trial);
    const usage = {};
    for (const field of ['promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'totalTokenCount']) {
      if (uint(payload.usageMetadata?.[field], 10000000)) usage[field] = payload.usageMetadata[field];
    }
    return { ...result, requests: 1, usage, trial };
  } catch (err) {
    const codes = ['INCOMPLETE_MODEL_RESULT', 'INVALID_MODEL_RESULT', 'INVALID_MODEL_JSON',
      'PROVIDER_RESPONSE_TOO_LARGE', 'EMPTY_PROVIDER_RESPONSE', 'INVALID_PROVIDER_RESPONSE'];
    const certificateFailure = ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_HAS_EXPIRED'].includes(err.cause?.code);
    return { code: controller.signal.aborted ? 'PROVIDER_TIMEOUT' : certificateFailure ? 'PROVIDER_CERTIFICATE_UNTRUSTED'
      : codes.includes(err.message) ? err.message : 'PROVIDER_REQUEST_FAILED',
      requests: 1, trustedForCoach: false };
  } finally { clearTimeout(timer); }
}

module.exports = { validateTrial, buildRequest, parseObservation, runTrial, MODEL, ENDPOINT };

if (require.main === module) {
  (async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.resolve(__dirname, '..');
    if (process.argv.length !== 4 || process.argv[2] !== '--execute-once') fail('EXPLICIT_EXECUTE_REQUIRED');
    const planPath = path.resolve(process.argv[3]);
    const evalRoot = path.join(root, '.cloud', 'evals', 'youtube-observer-2026-10-25');
    const assertLocal = target => {
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) fail('INVALID_PLAN_FILE');
      let current = root;
      for (const part of relative.split(path.sep)) {
        current = path.join(current, part);
        if (fs.lstatSync(current).isSymbolicLink()) fail('INVALID_PLAN_FILE');
      }
    };
    if (path.dirname(planPath) !== evalRoot) fail('INVALID_PLAN_FILE');
    assertLocal(planPath);
    if (!fs.statSync(planPath).isFile() || fs.statSync(planPath).size > 8192) fail('INVALID_PLAN_FILE');
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    const trial = validateTrial(plan);
    const resultPath = path.join(evalRoot, `${trial.trialId}.result.json`);
    if (fs.existsSync(resultPath)) fail('TRIAL_ALREADY_RECORDED');
    // Permanent attempt marker. A timeout or process crash is not permission to retry.
    fs.writeFileSync(path.join(evalRoot, `${trial.trialId}.attempt.json`), JSON.stringify({ startedAt: new Date().toISOString(), trial }), { flag: 'wx', mode: 0o600 });
    const privatePath = path.join(root, '.cloud', 'credentials', 'hengs', 'gemini.env');
    assertLocal(privatePath);
    if (!fs.statSync(privatePath).isFile() || fs.statSync(privatePath).size > 8192) fail('INVALID_PRIVATE_CONFIG');
    let secret = fs.readFileSync(privatePath, 'utf8').trim();
    const match = /^GEMINI_API_KEY=((?:AIza|AQ\.)[A-Za-z0-9._-]{20,4096})$/.exec(secret);
    if (!match) fail('INVALID_PRIVATE_CONFIG');
    secret = null;
    const result = await runTrial(plan, match[1]);
    match[0] = ''; match[1] = '';
    fs.writeFileSync(resultPath, JSON.stringify({ ...result, completedAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ code: result.code, requests: result.requests, httpStatus: result.httpStatus,
      category: result.category, trustedForCoach: false, usage: result.usage, resultStored: true }));
    if (!['CANDIDATE_ONLY', 'NO_READABLE_SCREEN'].includes(result.code)) process.exitCode = 1;
  })().catch(err => {
    const allowed = ['EXPLICIT_EXECUTE_REQUIRED', 'INVALID_PLAN_FILE', 'TRIAL_NOT_APPROVED', 'PREFLIGHT_STALE',
      'INVALID_TRIAL_WINDOW', 'INVALID_PRIVATE_CONFIG', 'TRIAL_ALREADY_RECORDED', 'INVALID_VIDEO_URL'];
    console.log(JSON.stringify({ code: err.code === 'EEXIST' ? 'TRIAL_ALREADY_CLAIMED' : allowed.includes(err.message) ? err.message : 'TRIAL_LOCAL_FAILURE', trustedForCoach: false }));
    process.exitCode = 1;
  });
}
