const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SNOWFLAKE = /^\d{17,20}$/;
const REQUEST_ID = /^[a-f0-9]{16}$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const STATE_KEYS = ['days', 'feedbackClaims', 'guildId', 'revision', 'schemaVersion', 'updatedAt'];
const DAY_KEYS = ['accepted', 'busyRejected', 'dailyLimited', 'date', 'helpful', 'needsWork', 'rateLimited'];
const CLAIM_KEYS = ['date', 'rating', 'requestId'];
const RATINGS = new Set(['helpful', 'needs_work']);
const REJECTIONS = Object.freeze({
  PUBLIC_GUILD_BUSY: 'busyRejected',
  PUBLIC_GUILD_RATE_LIMITED: 'rateLimited',
});
const DEFAULT_DAILY_LIMIT = 100;
const MIN_DAILY_LIMIT = 10;
const MAX_DAILY_LIMIT = 300;
const MAX_DAYS = 31;
const MAX_CLAIMS = MAX_DAYS * MAX_DAILY_LIMIT;
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const MAX_COUNTER = 1_000_000;

function parsePublicDailyRequestLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_DAILY_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_DAILY_LIMIT || parsed > MAX_DAILY_LIMIT) {
    throw new Error('PUBLIC_DAILY_LIMIT_INVALID');
  }
  return parsed;
}

function assertExactKeys(value, keys) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);
}

function assertCounter(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNTER;
}

function isDateKey(value) {
  if (!DATE_KEY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertIso(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function validateState(value, expectedGuildId) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !assertExactKeys(value, STATE_KEYS)) {
    throw new Error('PUBLIC_INSIGHTS_INVALID');
  }
  if (
    value.schemaVersion !== 1
    || value.guildId !== expectedGuildId
    || !SNOWFLAKE.test(value.guildId)
    || !Number.isSafeInteger(value.revision)
    || value.revision < 1
    || !assertIso(value.updatedAt)
    || !Array.isArray(value.days)
    || value.days.length > MAX_DAYS
    || !Array.isArray(value.feedbackClaims)
    || value.feedbackClaims.length > MAX_CLAIMS
  ) throw new Error('PUBLIC_INSIGHTS_INVALID');

  let previousDate = '';
  const dates = new Set();
  for (const day of value.days) {
    if (!day || typeof day !== 'object' || Array.isArray(day) || !assertExactKeys(day, DAY_KEYS)) {
      throw new Error('PUBLIC_INSIGHTS_INVALID');
    }
    if (!isDateKey(day.date) || day.date <= previousDate || dates.has(day.date)) {
      throw new Error('PUBLIC_INSIGHTS_INVALID');
    }
    for (const key of DAY_KEYS.filter(key => key !== 'date')) {
      if (!assertCounter(day[key])) throw new Error('PUBLIC_INSIGHTS_INVALID');
    }
    if (day.accepted > MAX_DAILY_LIMIT) throw new Error('PUBLIC_INSIGHTS_INVALID');
    previousDate = day.date;
    dates.add(day.date);
  }

  const requestIds = new Set();
  for (const claim of value.feedbackClaims) {
    if (!claim || typeof claim !== 'object' || Array.isArray(claim) || !assertExactKeys(claim, CLAIM_KEYS)) {
      throw new Error('PUBLIC_INSIGHTS_INVALID');
    }
    if (
      !REQUEST_ID.test(claim.requestId)
      || !isDateKey(claim.date)
      || !dates.has(claim.date)
      || requestIds.has(claim.requestId)
      || (claim.rating !== null && !RATINGS.has(claim.rating))
    ) throw new Error('PUBLIC_INSIGHTS_INVALID');
    requestIds.add(claim.requestId);
  }
  for (const day of value.days) {
    const claims = value.feedbackClaims.filter(claim => claim.date === day.date);
    if (
      claims.length !== day.accepted
      || claims.filter(claim => claim.rating === 'helpful').length !== day.helpful
      || claims.filter(claim => claim.rating === 'needs_work').length !== day.needsWork
    ) throw new Error('PUBLIC_INSIGHTS_INVALID');
  }
  return value;
}

function createPublicInsightsStore({
  rootDir = path.join(__dirname, '..', '..', 'data', 'public-insights'),
  fsImpl = fs,
  now = () => new Date(),
  dailyLimit = DEFAULT_DAILY_LIMIT,
} = {}) {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > MAX_DAILY_LIMIT) {
    throw new Error('PUBLIC_DAILY_LIMIT_INVALID');
  }
  const resolvedRoot = path.resolve(rootDir);

  function clock() {
    const value = now();
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('PUBLIC_INSIGHTS_CLOCK_INVALID');
    return { iso: date.toISOString(), date: date.toISOString().slice(0, 10) };
  }

  function fileFor(guildId) {
    const normalized = String(guildId || '').trim();
    if (!SNOWFLAKE.test(normalized)) throw new Error('GUILD_ID_INVALID');
    const file = path.join(resolvedRoot, `${normalized}.json`);
    if (path.dirname(file) !== resolvedRoot) throw new Error('PUBLIC_INSIGHTS_PATH_UNSAFE');
    return { guildId: normalized, file };
  }

  function assertSafe(target, directory = false) {
    if (!fsImpl.existsSync(target)) return;
    const stat = fsImpl.lstatSync(target);
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error('PUBLIC_INSIGHTS_PATH_UNSAFE');
    }
  }

  function inspect(paths, create = false) {
    if (create) fsImpl.mkdirSync(resolvedRoot, { recursive: true, mode: 0o700 });
    assertSafe(resolvedRoot, true);
    assertSafe(paths.file, false);
  }

  function load(guildId, currentDate) {
    const paths = fileFor(guildId);
    inspect(paths);
    if (!fsImpl.existsSync(paths.file)) return { paths, state: null };
    const stat = fsImpl.lstatSync(paths.file);
    if (stat.size > MAX_STATE_BYTES) throw new Error('PUBLIC_INSIGHTS_INVALID');
    let state;
    try {
      state = JSON.parse(fsImpl.readFileSync(paths.file, 'utf8'));
    } catch {
      throw new Error('PUBLIC_INSIGHTS_INVALID');
    }
    const validated = validateState(state, paths.guildId);
    if (currentDate && validated.days.some(day => day.date > currentDate)) {
      throw new Error('PUBLIC_INSIGHTS_INVALID');
    }
    return { paths, state: validated };
  }

  function freshState(guildId, timestamp) {
    return {
      schemaVersion: 1,
      guildId,
      revision: 0,
      updatedAt: timestamp,
      days: [],
      feedbackClaims: [],
    };
  }

  function retentionCutoff(dateKey, days = MAX_DAYS) {
    const date = new Date(`${dateKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - (days - 1));
    return date.toISOString().slice(0, 10);
  }

  function prune(state, dateKey) {
    const cutoff = retentionCutoff(dateKey);
    state.days = state.days.filter(day => day.date >= cutoff && day.date <= dateKey);
    const retainedDates = new Set(state.days.map(day => day.date));
    state.feedbackClaims = state.feedbackClaims.filter(claim => retainedDates.has(claim.date));
  }

  function dayFor(state, dateKey) {
    let day = state.days.find(value => value.date === dateKey);
    if (!day) {
      day = {
        date: dateKey,
        accepted: 0,
        busyRejected: 0,
        rateLimited: 0,
        dailyLimited: 0,
        helpful: 0,
        needsWork: 0,
      };
      state.days.push(day);
      state.days.sort((left, right) => left.date.localeCompare(right.date));
    }
    return day;
  }

  function increment(day, field) {
    if (day[field] < MAX_COUNTER) day[field] += 1;
  }

  function write(paths, state, timestamp) {
    inspect(paths, true);
    state.revision += 1;
    state.updatedAt = timestamp;
    validateState(state, paths.guildId);
    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > MAX_STATE_BYTES) throw new Error('PUBLIC_INSIGHTS_INVALID');
    const temporary = path.join(
      resolvedRoot,
      `.${paths.guildId}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
    );
    let descriptor;
    try {
      descriptor = fsImpl.openSync(temporary, 'wx', 0o600);
      fsImpl.writeFileSync(descriptor, serialized, 'utf8');
      fsImpl.fsyncSync(descriptor);
      fsImpl.closeSync(descriptor);
      descriptor = undefined;
      inspect(paths);
      fsImpl.renameSync(temporary, paths.file);
    } finally {
      if (descriptor !== undefined) fsImpl.closeSync(descriptor);
      if (fsImpl.existsSync(temporary)) fsImpl.rmSync(temporary, { force: true });
    }
  }

  function claimAccepted(guildId) {
    const current = clock();
    const loaded = load(guildId, current.date);
    const state = loaded.state || freshState(loaded.paths.guildId, current.iso);
    prune(state, current.date);
    const day = dayFor(state, current.date);
    if (day.accepted >= dailyLimit) {
      increment(day, 'dailyLimited');
      write(loaded.paths, state, current.iso);
      return { ok: false, code: 'PUBLIC_DAILY_LIMITED', used: day.accepted, limit: dailyLimit };
    }
    let requestId;
    const existing = new Set(state.feedbackClaims.map(claim => claim.requestId));
    do requestId = crypto.randomBytes(8).toString('hex'); while (existing.has(requestId));
    increment(day, 'accepted');
    state.feedbackClaims.push({ requestId, date: current.date, rating: null });
    write(loaded.paths, state, current.iso);
    return { ok: true, requestId, used: day.accepted, limit: dailyLimit };
  }

  function recordRejection(guildId, code) {
    const field = REJECTIONS[code];
    if (!field) throw new Error('PUBLIC_REJECTION_INVALID');
    const current = clock();
    const loaded = load(guildId, current.date);
    const state = loaded.state || freshState(loaded.paths.guildId, current.iso);
    prune(state, current.date);
    increment(dayFor(state, current.date), field);
    write(loaded.paths, state, current.iso);
    return { recorded: true };
  }

  function recordFeedback(guildId, requestId, rating) {
    const normalizedRequestId = String(requestId || '').trim();
    if (!REQUEST_ID.test(normalizedRequestId) || !RATINGS.has(rating)) {
      throw new Error('PUBLIC_FEEDBACK_INVALID');
    }
    const current = clock();
    const loaded = load(guildId, current.date);
    if (!loaded.state) return { recorded: false, code: 'FEEDBACK_NOT_FOUND' };
    const state = loaded.state;
    prune(state, current.date);
    const claim = state.feedbackClaims.find(value => value.requestId === normalizedRequestId);
    if (!claim) return { recorded: false, code: 'FEEDBACK_NOT_FOUND' };
    if (claim.rating !== null) return { recorded: false, code: 'FEEDBACK_ALREADY_RECORDED' };
    const day = state.days.find(value => value.date === claim.date);
    if (!day) throw new Error('PUBLIC_INSIGHTS_INVALID');
    claim.rating = rating;
    increment(day, rating === 'helpful' ? 'helpful' : 'needsWork');
    write(loaded.paths, state, current.iso);
    return { recorded: true, code: 'FEEDBACK_RECORDED' };
  }

  function getSummary(guildId, days) {
    if (![7, 30].includes(days)) throw new Error('PUBLIC_INSIGHTS_RANGE_INVALID');
    const current = clock();
    const loaded = load(guildId, current.date);
    const summary = {
      days,
      accepted: 0,
      busyRejected: 0,
      rateLimited: 0,
      dailyLimited: 0,
      helpful: 0,
      needsWork: 0,
      todayUsed: 0,
      dailyLimit,
      activeDays: 0,
      averagePerActiveDay: 0,
      busiestDay: null,
      busiestAccepted: 0,
      feedbackRated: 0,
      feedbackCoverage: 0,
      helpfulRate: 0,
      comparisonDays: 7,
      recentAccepted: 0,
      previousAccepted: 0,
      usageTrend: 'steady',
      trendPercent: 0,
    };
    if (!loaded.state) return summary;
    const cutoff = retentionCutoff(current.date, days);
    const recentCutoff = retentionCutoff(current.date, summary.comparisonDays);
    const previousEndDate = new Date(`${current.date}T00:00:00.000Z`);
    previousEndDate.setUTCDate(previousEndDate.getUTCDate() - summary.comparisonDays);
    const previousEnd = previousEndDate.toISOString().slice(0, 10);
    const previousCutoff = retentionCutoff(previousEnd, summary.comparisonDays);
    for (const day of loaded.state.days) {
      if (day.date >= recentCutoff && day.date <= current.date) {
        summary.recentAccepted += day.accepted;
      } else if (day.date >= previousCutoff && day.date <= previousEnd) {
        summary.previousAccepted += day.accepted;
      }
      if (day.date < cutoff || day.date > current.date) continue;
      for (const key of ['accepted', 'busyRejected', 'rateLimited', 'dailyLimited', 'helpful', 'needsWork']) {
        summary[key] += day[key];
      }
      if (day.accepted > 0) summary.activeDays += 1;
      if (day.accepted > summary.busiestAccepted) {
        summary.busiestDay = day.date;
        summary.busiestAccepted = day.accepted;
      }
      if (day.date === current.date) summary.todayUsed = day.accepted;
    }
    summary.averagePerActiveDay = summary.activeDays === 0
      ? 0
      : Number((summary.accepted / summary.activeDays).toFixed(1));
    summary.feedbackRated = summary.helpful + summary.needsWork;
    summary.feedbackCoverage = summary.accepted === 0
      ? 0
      : Math.round((summary.feedbackRated / summary.accepted) * 100);
    summary.helpfulRate = summary.feedbackRated === 0
      ? 0
      : Math.round((summary.helpful / summary.feedbackRated) * 100);
    if (summary.previousAccepted === 0 && summary.recentAccepted > 0) {
      summary.usageTrend = 'new';
    } else if (summary.recentAccepted > summary.previousAccepted) {
      summary.usageTrend = 'up';
    } else if (summary.recentAccepted < summary.previousAccepted) {
      summary.usageTrend = 'down';
    }
    summary.trendPercent = summary.previousAccepted === 0
      ? 0
      : Math.round((Math.abs(summary.recentAccepted - summary.previousAccepted)
        / summary.previousAccepted) * 100);
    return summary;
  }

  function remove(guildId) {
    const current = clock();
    const loaded = load(guildId, current.date);
    if (!loaded.state) return { removed: false };
    fsImpl.unlinkSync(loaded.paths.file);
    return { removed: true };
  }

  return { claimAccepted, getSummary, recordFeedback, recordRejection, remove };
}

module.exports = {
  createPublicInsightsStore,
  parsePublicDailyRequestLimit,
  validateState,
};
