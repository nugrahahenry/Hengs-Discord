const assert = require('node:assert/strict');
const test = require('node:test');

const { enforceIncident } = require('../src/moderation/enforcer');

const INCIDENT = Object.freeze({
  id: '0123456789abcdef',
  memberId: '200000000000001',
});

function permissions(...names) {
  const allowed = new Set(names);
  return { has: value => allowed.has(value) || allowed.has(String(value)) };
}

function privateLogChannel() {
  return {
    permissionsFor: subject => String(subject?.id || '') === '300000000000001'
      ? permissions('ViewChannel', 'SendMessages', 'EmbedLinks', 'ReadMessageHistory')
      : permissions(),
  };
}

function member(id, overrides = {}) {
  return {
    id,
    user: { id, bot: false },
    bannable: true,
    manageable: true,
    permissions: permissions(),
    roles: { cache: new Map() },
    ...overrides,
  };
}

function fakeContext(overrides = {}) {
  const calls = overrides.calls || [];
  const target = overrides.target || member(INCIDENT.memberId);
  const bot = overrides.bot || member('300000000000001', {
    permissions: permissions('BanMembers', 'ManageMessages'),
  });
  const guild = overrides.guild || {
    id: '100000000000001',
    members: {
      fetch: async id => (id === target.id ? target : bot),
      fetchMe: async () => bot,
      ban: async (id, options) => calls.push({ type: 'ban', id, options }),
    },
    bans: {
      fetch: async () => {
        const error = new Error('Unknown Ban');
        error.code = 10026;
        throw error;
      },
    },
  };
  const message = overrides.message || {
    author: { id: INCIDENT.memberId, bot: false },
    member: target,
    guild,
    channelId: '400000000000001',
  };

  return {
    incident: INCIDENT,
    guild,
    message,
    configuredMode: 'active',
    modLogChannel: privateLogChannel(),
    trackedMessages: [],
    calls,
    ...overrides,
  };
}

test('active enforcement bans once with a 120-second deletion window', async () => {
  const calls = [];
  const result = await enforceIncident(fakeContext({
    calls,
    ban: async (id, options) => calls.push({ id, options }),
    guild: undefined,
  }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.deleteMessageSeconds, 120);
  assert.match(calls[0].options.reason, /^Hengs Anti-Raid incident [a-f0-9]{16}$/);
  assert.deepEqual(result, {
    status: 'banned',
    banSucceeded: true,
    deletionSucceeded: true,
    deletedCount: 0,
    issueCode: null,
  });
});

test('monitor enforcement performs no Discord writes', async () => {
  const calls = [];
  const result = await enforceIncident(fakeContext({ configuredMode: 'monitor', calls }));

  assert.equal(calls.length, 0);
  assert.deepEqual(result, {
    status: 'monitor',
    banSucceeded: false,
    deletionSucceeded: false,
    deletedCount: 0,
    issueCode: null,
  });
});

test('a fresh reviewer-role exemption prevents the ban', async () => {
  const calls = [];
  const target = member(INCIDENT.memberId, {
    roles: { cache: new Map([['500000000000001', {}]]) },
  });
  const result = await enforceIncident(fakeContext({
    calls,
    target,
    message: {
      author: { id: INCIDENT.memberId, bot: false },
      member: member(INCIDENT.memberId),
      guild: { id: '100000000000001' },
      channelId: '400000000000001',
    },
    staticPolicy: { reviewerRoleIds: new Set(['500000000000001']) },
  }));

  assert.equal(calls.length, 0);
  assert.deepEqual(result, {
    status: 'monitor',
    banSucceeded: false,
    deletionSucceeded: false,
    deletedCount: 0,
    issueCode: 'PREREQUISITES_CHANGED',
  });
});

test('fresh missing Manage Messages prevents both ban and deletion', async () => {
  const calls = [];
  const bot = member('300000000000001', { permissions: permissions('BanMembers') });
  const result = await enforceIncident(fakeContext({ calls, bot }));

  assert.equal(calls.length, 0);
  assert.deepEqual(result, {
    status: 'monitor',
    banSucceeded: false,
    deletionSucceeded: false,
    deletedCount: 0,
    issueCode: 'MANAGE_MESSAGES_MISSING',
  });
});

test('fresh missing Ban Members prevents both ban and deletion', async () => {
  const calls = [];
  const bot = member('300000000000001', { permissions: permissions('ManageMessages') });
  const result = await enforceIncident(fakeContext({ calls, bot }));

  assert.equal(calls.length, 0);
  assert.deepEqual(result, {
    status: 'monitor',
    banSucceeded: false,
    deletionSucceeded: false,
    deletedCount: 0,
    issueCode: 'BAN_MEMBERS_MISSING',
  });
});

test('fresh target hierarchy prevents the ban before the Discord action', async () => {
  const calls = [];
  const result = await enforceIncident(fakeContext({
    calls,
    target: member(INCIDENT.memberId, { bannable: false }),
  }));

  assert.equal(calls.length, 0);
  assert.equal(result.status, 'monitor');
  assert.equal(result.issueCode, 'TARGET_UNBANNABLE');
});

test('a failed ban deletes only unique tracked message objects up to the hard maximum', async () => {
  const calls = [];
  const trackedMessages = Array.from({ length: 30 }, (_, index) => ({
    id: `message-${index}`,
    delete: async () => calls.push({ type: 'delete', index }),
  }));
  trackedMessages.push(trackedMessages[0]);
  const context = fakeContext({ calls, trackedMessages });
  context.guild.members.ban = async () => {
    throw new Error('private Discord error');
  };

  const result = await enforceIncident(context);

  assert.equal(calls.filter(call => call.type === 'delete').length, 25);
  assert.deepEqual(result, {
    status: 'partial',
    banSucceeded: false,
    deletionSucceeded: true,
    deletedCount: 25,
    issueCode: 'BAN_FAILED',
  });
  assert.doesNotMatch(JSON.stringify(result), /private Discord error/);
});

test('an ambiguous ban error is idempotently recovered when Discord reports the member banned', async () => {
  const calls = [];
  const context = fakeContext({ calls });
  context.guild.members.ban = async () => {
    throw new Error('request timed out');
  };
  context.guild.bans.fetch = async id => ({ user: { id } });

  const result = await enforceIncident(context);

  assert.equal(calls.length, 0);
  assert.deepEqual(result, {
    status: 'banned',
    banSucceeded: true,
    deletionSucceeded: true,
    deletedCount: 0,
    issueCode: null,
  });
});

test('ban and deletion errors map to fixed codes without notices or raw error text', async () => {
  const calls = [];
  const notice = () => {
    throw new Error('no public or DM notice may be sent');
  };
  const context = fakeContext({
    calls,
    trackedMessages: [{ id: 'message-1', delete: async () => { throw new Error('secret delete failure'); } }],
    send: notice,
    reply: notice,
  });
  context.guild.members.ban = async () => {
    throw new Error('secret ban failure');
  };

  const result = await enforceIncident(context);

  assert.deepEqual(result, {
    status: 'failed',
    banSucceeded: false,
    deletionSucceeded: false,
    deletedCount: 0,
    issueCode: 'BAN_AND_DELETE_FAILED',
  });
  assert.doesNotMatch(JSON.stringify(result), /secret|notice/i);
});
