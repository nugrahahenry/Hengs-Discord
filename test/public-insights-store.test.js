const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createPublicInsightsStore,
  parsePublicDailyRequestLimit,
} = require('../src/guilds/public-insights-store');

const GUILD = '223456789012345678';

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-insights-'));
  const store = createPublicInsightsStore({ rootDir: root, ...options });
  return { root, store };
}

test('public daily request limit is bounded and defaults to 100', () => {
  assert.equal(parsePublicDailyRequestLimit(), 100);
  assert.equal(parsePublicDailyRequestLimit('10'), 10);
  assert.equal(parsePublicDailyRequestLimit('300'), 300);
  for (const value of ['9', '301', '10.5', 'private']) {
    assert.throws(() => parsePublicDailyRequestLimit(value), /PUBLIC_DAILY_LIMIT_INVALID/);
  }
});

test('accepted requests are claimed atomically before the daily limit', t => {
  const { root, store } = fixture({
    dailyLimit: 2,
    now: () => new Date('2026-08-23T01:00:00.000Z'),
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const first = store.claimAccepted(GUILD);
  const second = store.claimAccepted(GUILD);
  const denied = store.claimAccepted(GUILD);

  assert.equal(first.ok, true);
  assert.match(first.requestId, /^[a-f0-9]{16}$/);
  assert.equal(second.ok, true);
  assert.notEqual(second.requestId, first.requestId);
  assert.deepEqual(denied, {
    ok: false,
    code: 'PUBLIC_DAILY_LIMITED',
    used: 2,
    limit: 2,
  });
  assert.deepEqual(store.getSummary(GUILD, 7), {
    days: 7,
    accepted: 2,
    busyRejected: 0,
    rateLimited: 0,
    dailyLimited: 1,
    helpful: 0,
    needsWork: 0,
    todayUsed: 2,
    dailyLimit: 2,
    activeDays: 1,
    averagePerActiveDay: 2,
    busiestDay: '2026-08-23',
    busiestAccepted: 2,
    feedbackRated: 0,
    feedbackCoverage: 0,
    helpfulRate: 0,
    comparisonDays: 7,
    recentAccepted: 2,
    previousAccepted: 0,
    usageTrend: 'new',
    trendPercent: 0,
  });
});

test('feedback only accepts issued IDs and one rating per response', t => {
  const { root, store } = fixture({ now: () => new Date('2026-08-23T01:00:00.000Z') });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const claim = store.claimAccepted(GUILD);

  assert.deepEqual(store.recordFeedback(GUILD, 'aaaaaaaaaaaaaaaa', 'helpful'), {
    recorded: false,
    code: 'FEEDBACK_NOT_FOUND',
  });
  assert.deepEqual(store.recordFeedback(GUILD, claim.requestId, 'helpful'), {
    recorded: true,
    code: 'FEEDBACK_RECORDED',
  });
  assert.deepEqual(store.recordFeedback(GUILD, claim.requestId, 'needs_work'), {
    recorded: false,
    code: 'FEEDBACK_ALREADY_RECORDED',
  });
  assert.equal(store.getSummary(GUILD, 7).helpful, 1);
  assert.equal(store.getSummary(GUILD, 7).needsWork, 0);
  assert.equal(store.getSummary(GUILD, 7).feedbackCoverage, 100);
  assert.equal(store.getSummary(GUILD, 7).helpfulRate, 100);
});

test('summary rolls over by UTC day and retains at most 31 daily buckets', t => {
  let now = new Date('2026-07-01T23:59:59.000Z');
  const { root, store } = fixture({ now: () => now });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (let day = 0; day < 35; day += 1) {
    now = new Date(Date.UTC(2026, 6, 1 + day, 23, 59, 59));
    store.claimAccepted(GUILD);
  }
  const raw = JSON.parse(fs.readFileSync(path.join(root, `${GUILD}.json`), 'utf8'));
  assert.equal(raw.days.length, 31);
  assert.equal(raw.feedbackClaims.length, 31);
  assert.equal(store.getSummary(GUILD, 30).accepted, 30);
  assert.equal(store.getSummary(GUILD, 7).accepted, 7);
  assert.equal(store.getSummary(GUILD, 7).activeDays, 7);
  assert.equal(store.getSummary(GUILD, 7).averagePerActiveDay, 1);
  assert.equal(store.getSummary(GUILD, 7).busiestAccepted, 1);
});

test('summary compares the latest seven days with the preceding seven days at read time', t => {
  let now = new Date('2026-08-15T12:00:00.000Z');
  const { root, store } = fixture({ now: () => now });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.claimAccepted(GUILD);
  store.claimAccepted(GUILD);
  now = new Date('2026-08-22T12:00:00.000Z');
  for (let index = 0; index < 4; index += 1) store.claimAccepted(GUILD);

  const summary = store.getSummary(GUILD, 30);
  assert.equal(summary.comparisonDays, 7);
  assert.equal(summary.previousAccepted, 2);
  assert.equal(summary.recentAccepted, 4);
  assert.equal(summary.usageTrend, 'up');
  assert.equal(summary.trendPercent, 100);

  const persisted = fs.readFileSync(path.join(root, `${GUILD}.json`), 'utf8');
  assert.doesNotMatch(persisted, /usageTrend|trendPercent|recentAccepted|previousAccepted/);
});

test('persistent state contains aggregates only and rejects unknown fields', t => {
  const { root, store } = fixture({ now: () => new Date('2026-08-23T01:00:00.000Z') });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.claimAccepted(GUILD);
  store.recordRejection(GUILD, 'PUBLIC_GUILD_BUSY');
  const file = path.join(root, `${GUILD}.json`);
  const text = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /user|channel|prompt|answer|username|displayName/i);
  assert.doesNotMatch(text, /activeDays|averagePerActiveDay|busiestDay|feedbackCoverage|helpfulRate/);

  const raw = JSON.parse(text);
  raw.privateDetail = 'must fail closed';
  fs.writeFileSync(file, JSON.stringify(raw));
  assert.throws(() => store.getSummary(GUILD, 7), /PUBLIC_INSIGHTS_INVALID/);
});

test('future daily buckets fail closed instead of being silently ignored', t => {
  const { root, store } = fixture({ now: () => new Date('2026-08-23T01:00:00.000Z') });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.claimAccepted(GUILD);
  const file = path.join(root, `${GUILD}.json`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.days[0].date = '2026-08-24';
  raw.feedbackClaims[0].date = '2026-08-24';
  fs.writeFileSync(file, JSON.stringify(raw));
  assert.throws(() => store.getSummary(GUILD, 7), /PUBLIC_INSIGHTS_INVALID/);
  assert.throws(() => store.claimAccepted(GUILD), /PUBLIC_INSIGHTS_INVALID/);
});

test('aggregate counters must match issued and rated feedback claims', t => {
  const { root, store } = fixture({ now: () => new Date('2026-08-23T01:00:00.000Z') });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.claimAccepted(GUILD);
  const file = path.join(root, `${GUILD}.json`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.days[0].helpful = 1;
  fs.writeFileSync(file, JSON.stringify(raw));
  assert.throws(() => store.getSummary(GUILD, 7), /PUBLIC_INSIGHTS_INVALID/);
});

test('remove validates state and fails closed on unsafe paths', t => {
  const { root, store } = fixture({ now: () => new Date('2026-08-23T01:00:00.000Z') });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.claimAccepted(GUILD);
  assert.deepEqual(store.remove(GUILD), { removed: true });
  assert.deepEqual(store.remove(GUILD), { removed: false });

  const target = path.join(root, 'target.json');
  fs.writeFileSync(target, '{}');
  const linked = path.join(root, `${GUILD}.json`);
  try {
    fs.symlinkSync(target, linked, 'file');
  } catch {
    return;
  }
  assert.throws(() => store.getSummary(GUILD, 7), /PUBLIC_INSIGHTS_PATH_UNSAFE/);
});

test('failed atomic replacement preserves the last valid state and cleans temp files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-insights-atomic-'));
  let failRename = false;
  const fsImpl = new Proxy(fs, {
    get(target, property) {
      if (property === 'renameSync' && failRename) {
        return () => { throw new Error('private rename detail'); };
      }
      return Reflect.get(target, property);
    },
  });
  const store = createPublicInsightsStore({
    rootDir: root,
    fsImpl,
    now: () => new Date('2026-08-23T01:00:00.000Z'),
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.claimAccepted(GUILD);
  const file = path.join(root, `${GUILD}.json`);
  const before = fs.readFileSync(file, 'utf8');

  failRename = true;
  assert.throws(() => store.recordRejection(GUILD, 'PUBLIC_GUILD_BUSY'), /private rename detail/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(root), [`${GUILD}.json`]);
});

test('guild files remain isolated from each other', t => {
  const otherGuild = '323456789012345678';
  const { root, store } = fixture({ now: () => new Date('2026-08-23T01:00:00.000Z') });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.claimAccepted(GUILD);
  store.recordRejection(otherGuild, 'PUBLIC_GUILD_RATE_LIMITED');
  assert.equal(store.getSummary(GUILD, 7).accepted, 1);
  assert.equal(store.getSummary(GUILD, 7).rateLimited, 0);
  assert.equal(store.getSummary(otherGuild, 7).accepted, 0);
  assert.equal(store.getSummary(otherGuild, 7).rateLimited, 1);
});
