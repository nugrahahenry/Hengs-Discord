const assert = require('node:assert/strict');
const test = require('node:test');
const { MessageFlags } = require('discord.js');

const {
  buildPublicFeedbackComponents,
  handlePublicFeedback,
} = require('../src/guilds/public-feedback');

const GUILD = '223456789012345678';
const REQUESTER = '323456789012345678';
const OTHER = '423456789012345678';
const BOT = '523456789012345678';
const REQUEST = 'a1b2c3d4e5f60718';

function interaction({ userId = REQUESTER, customId, authorId = BOT } = {}) {
  return {
    customId: customId || `hengs-feedback:${REQUEST}:${REQUESTER}:helpful`,
    guildId: GUILD,
    user: { id: userId },
    message: { author: { id: authorId } },
    inGuild: () => true,
    isButton: () => true,
    async reply(payload) { this.replyPayload = payload; this.replied = true; },
    async update(payload) { this.updatePayload = payload; this.replied = true; },
    async followUp(payload) { this.followUpPayload = payload; },
  };
}

function dependencies(result = { recorded: true, code: 'FEEDBACK_RECORDED' }) {
  const calls = [];
  return {
    calls,
    botUserId: BOT,
    guildAccess: { classify: () => ({ kind: 'public', config: {} }) },
    publicInsightsStore: {
      recordFeedback(guildId, requestId, rating) {
        calls.push({ guildId, requestId, rating });
        return result;
      },
    },
    logger: { error: code => calls.push({ log: code }) },
  };
}

test('public AI feedback uses bounded requester-specific custom IDs', () => {
  const rows = buildPublicFeedbackComponents({ requestId: REQUEST, requesterId: REQUESTER });
  const json = rows.map(row => row.toJSON());
  assert.equal(json.length, 1);
  assert.deepEqual(json[0].components.map(component => component.label), ['Membantu', 'Kurang pas']);
  assert.deepEqual(json[0].components.map(component => component.custom_id), [
    `hengs-feedback:${REQUEST}:${REQUESTER}:helpful`,
    `hengs-feedback:${REQUEST}:${REQUESTER}:needs_work`,
  ]);
  assert.throws(() => buildPublicFeedbackComponents({ requestId: '../private', requesterId: REQUESTER }));
});

test('original requester can rate once and receives a private acknowledgement', async () => {
  const deps = dependencies();
  const value = interaction();
  assert.equal(await handlePublicFeedback(value, deps), true);
  assert.deepEqual(deps.calls, [{ guildId: GUILD, requestId: REQUEST, rating: 'helpful' }]);
  assert.deepEqual(value.updatePayload, { components: [] });
  assert.equal(value.followUpPayload.flags, MessageFlags.Ephemeral);
  assert.deepEqual(value.followUpPayload.allowedMentions, { parse: [] });
  assert.match(value.followUpPayload.content, /makasih/i);
});

test('other users, forged bot messages, and inactive guilds cannot mutate feedback', async () => {
  for (const [value, mutateDeps] of [
    [interaction({ userId: OTHER }), () => {}],
    [interaction({ authorId: OTHER }), () => {}],
    [interaction(), deps => { deps.guildAccess.classify = () => ({ kind: 'pending' }); }],
  ]) {
    const deps = dependencies();
    mutateDeps(deps);
    assert.equal(await handlePublicFeedback(value, deps), true);
    assert.deepEqual(deps.calls, []);
    assert.equal(value.replyPayload.flags, MessageFlags.Ephemeral);
    assert.deepEqual(value.replyPayload.allowedMentions, { parse: [] });
  }
});

test('duplicate and unknown feedback do not increment aggregates', async () => {
  for (const [result, expected] of [
    [{ recorded: false, code: 'FEEDBACK_ALREADY_RECORDED' }, /sudah tercatat/i],
    [{ recorded: false, code: 'FEEDBACK_NOT_FOUND' }, /kedaluwarsa|tidak dikenali/i],
  ]) {
    const deps = dependencies(result);
    const value = interaction();
    await handlePublicFeedback(value, deps);
    assert.deepEqual(deps.calls, [{ guildId: GUILD, requestId: REQUEST, rating: 'helpful' }]);
    if (result.code === 'FEEDBACK_ALREADY_RECORDED') {
      assert.deepEqual(value.updatePayload, { components: [] });
      assert.match(value.followUpPayload.content, expected);
    } else {
      assert.match(value.replyPayload.content, expected);
    }
  }
});
