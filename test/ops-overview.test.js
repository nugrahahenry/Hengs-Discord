const test = require('node:test');
const assert = require('node:assert/strict');

const opsCommand = require('../src/commands/ops');
const translationService = require('../src/translation/service');
const {
  collectCommunityOverview,
  formatCommunityOverview,
  formatDuration,
} = require('../src/ops/overview');

function dependencies(overrides = {}) {
  return {
    runtimeHealth: {
      snapshot: () => ({
        version: '1.10.0',
        uptimeSeconds: 7_500,
        connection: { status: 'CONNECTED' },
        lastIssue: null,
        token: 'must-not-leak',
      }),
    },
    opsHub: {
      getStatus: () => ({
        pending: 2,
        revising: 1,
        scheduled: 3,
        publishing: 0,
        latest: { title: 'private announcement title' },
      }),
    },
    eventHub: {
      getStatus: () => ({
        draft: 4,
        publishing: 1,
        published: 2,
        upcoming: [{ title: 'private event title', rsvp: ['private-user-id'] }],
      }),
    },
    translation: {
      getQueueStatus: () => ({
        configured: true,
        running: true,
        queued: 1,
        depth: 2,
        maxJobs: 3,
        filename: 'private-document.docx',
      }),
    },
    focusState: {
      getMode: () => 'study',
      getDuration: () => 42,
      getTopic: () => 'private study topic',
    },
    version: '1.10.0',
    ...overrides,
  };
}

test('community overview exposes aggregate operations only', () => {
  const overview = collectCommunityOverview(dependencies());
  const presentation = formatCommunityOverview(overview);
  const serialized = JSON.stringify({ overview, presentation });

  assert.equal(overview.runtime.online, true);
  assert.equal(overview.ops.scheduled, 3);
  assert.equal(overview.events.published, 2);
  assert.equal(overview.translation.depth, 2);
  assert.equal(overview.focus.label, 'Belajar');
  assert.deepEqual(overview.unavailable, []);
  assert.doesNotMatch(serialized, /must-not-leak/);
  assert.doesNotMatch(serialized, /private announcement title/);
  assert.doesNotMatch(serialized, /private event title/);
  assert.doesNotMatch(serialized, /private-user-id/);
  assert.doesNotMatch(serialized, /private-document\.docx/);
  assert.doesNotMatch(serialized, /private study topic/);
});

test('overview degrades per section without exposing thrown errors', () => {
  const secret = 'raw-error-with-secret-token';
  const broken = () => { throw new Error(secret); };
  const overview = collectCommunityOverview(dependencies({
    opsHub: { getStatus: broken },
    eventHub: { getStatus: broken },
    translation: { getQueueStatus: broken },
  }));
  const presentation = formatCommunityOverview(overview);
  const serialized = JSON.stringify({ overview, presentation });

  assert.deepEqual(overview.unavailable, [
    'OPS_UNAVAILABLE',
    'EVENTS_UNAVAILABLE',
    'TRANSLATION_UNAVAILABLE',
  ]);
  assert.equal(overview.ops.pending, 0);
  assert.equal(overview.events.published, 0);
  assert.equal(overview.translation.depth, 0);
  assert.match(presentation.description, /membutuhkan perhatian/i);
  assert.doesNotMatch(serialized, new RegExp(secret));
});

test('/ops overview is editor-gated, ephemeral, and mention-safe', async () => {
  const previousOwner = process.env.OWNER_ID;
  process.env.OWNER_ID = '570152798126342144';
  try {
    const schema = opsCommand.data.toJSON();
    assert.equal(schema.options.some(option => option.name === 'overview'), true);

    let response = null;
    await opsCommand.execute({
      inGuild: () => true,
      user: { id: process.env.OWNER_ID },
      options: { getSubcommand: () => 'overview' },
      reply: async payload => { response = payload; },
    }, {
      ...dependencies(),
      state: dependencies().focusState,
    });

    assert.equal(response.ephemeral, true);
    assert.deepEqual(response.allowedMentions, { parse: [] });
    const embed = response.embeds[0].toJSON();
    assert.equal(embed.title, 'Hengs Community Operations');
    assert.match(embed.fields.find(field => field.name === 'Runtime').value, /CONNECTED/);
    assert.match(embed.fields.find(field => field.name === 'Ops Hub').value, /Terjadwal 3/);
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previousOwner;
  }
});

test('translation queue snapshot and duration formatter are bounded summaries', () => {
  const queue = translationService.getQueueStatus();
  assert.equal(typeof queue.configured, 'boolean');
  assert.equal(queue.running, false);
  assert.equal(queue.queued, 0);
  assert.equal(queue.depth, 0);
  assert.ok(queue.maxJobs >= 1);
  assert.equal(formatDuration(59), '0m');
  assert.equal(formatDuration(3_661), '1j 1m');
  assert.equal(formatDuration(90_000), '1h 1j');
});
