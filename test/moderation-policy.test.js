const assert = require('node:assert/strict');
const test = require('node:test');

const policy = require('../src/moderation/policy');

function permissions(...names) {
  const allowed = new Set(names);
  return { has: value => allowed.has(value) || allowed.has(String(value)) };
}

function member({ id = 'member-1', roleIds = [], permissionNames = [] } = {}) {
  return {
    id,
    user: { id, bot: false },
    roles: { cache: new Map(roleIds.map(roleId => [roleId, {}])) },
    permissions: permissions(...permissionNames),
  };
}

function privateLogChannel() {
  return {
    permissionsFor: () => permissions(),
  };
}

function basePrerequisiteContext(overrides = {}) {
  return {
    configuredMode: 'active',
    modLogChannel: privateLogChannel(),
    botPermissions: permissions('BanMembers', 'ManageMessages'),
    targetMember: { bannable: true },
    ...overrides,
  };
}

test('domain matching uses exact labels and allowlist overrides blocked domains', () => {
  assert.equal(policy.normalizeDomain(' HTTPS://Sub.Example.COM/path '), 'sub.example.com');
  assert.equal(policy.domainMatches('sub.example.com', 'example.com'), true);
  assert.equal(policy.domainMatches('notexample.com', 'example.com'), false);
  assert.equal(policy.domainDecision('sub.example.com', {
    blockedDomains: new Set(['example.com']),
    allowedDomains: new Set(['sub.example.com']),
  }), 'allowed');
});

test('normalization rejects unicode, credentials, ports, paths in rules, wildcards, and oversized values', () => {
  assert.equal(policy.normalizeDomain('https://user:pass@example.com'), null);
  assert.equal(policy.normalizeDomain('https://example.com:443'), null);
  assert.equal(policy.normalizeDomain('https://\u4f8b\u3048.\u30c6\u30b9\u30c8'), null);
  assert.equal(policy.normalizeDomain('*.example.com'), null);
  assert.equal(policy.normalizeDomain('ftp://example.com'), null);
  assert.deepEqual(policy.parseDomainList('https://example.com/path, example.com:443, *.bad.test'), new Set());
  assert.equal(policy.normalizeDomain(`${'a'.repeat(244)}.com`), null);
});

test('domain lists normalize duplicates and built-in Discord hosts are allowed', () => {
  assert.deepEqual(
    policy.parseDomainList(' Example.COM,example.com,Sub.Example.com '),
    new Set(['example.com', 'sub.example.com']),
  );
  assert.equal(policy.domainDecision('discord.com', {
    blockedDomains: new Set(['discord.com']),
    allowedDomains: new Set(),
  }), 'allowed');
  assert.equal(policy.domainDecision('cdn.discordapp.com', {
    blockedDomains: new Set(['discordapp.com']),
    allowedDomains: new Set(),
  }), 'allowed');
});

test('static policy defaults active and fails closed for invalid mode and invalid role ids', () => {
  const policyValue = policy.readStaticPolicy({
    ANTI_RAID_MODE: 'unexpected',
    ANTI_RAID_BLOCKED_DOMAINS: 'EXAMPLE.com, example.com, https://bad.test/path, not a domain',
    MODERATION_ROLE_IDS: '123456789012345, nope, 123456789012345678901234',
  });

  assert.equal(policyValue.initialMode, 'monitor');
  assert.deepEqual(policyValue.blockedDomains, new Set(['example.com']));
  assert.deepEqual(policyValue.reviewerRoleIds, new Set(['123456789012345']));
  assert.equal(policy.readStaticPolicy({ ANTI_RAID_MODE: ' OFF ' }).initialMode, 'off');
});

test('message exemptions cover bot, webhook, DM, owner, guild owner, administrator, reviewer, and persisted allowlists', () => {
  const staticPolicy = { ownerId: 'owner-1', reviewerRoleIds: new Set(['reviewer-1']) };
  const persistedPolicy = {
    allowedRoleIds: new Set(['allowed-role-1']),
    allowedChannelIds: new Set(['allowed-channel-1']),
  };
  const guild = { id: 'guild-1', ownerId: 'guild-owner-1' };

  assert.deepEqual(policy.isMessageExempt({ author: { bot: true }, guild }, staticPolicy, persistedPolicy), {
    exempt: true,
    reason: 'bot',
  });
  assert.equal(policy.isMessageExempt({ author: { id: 'member-1' }, webhookId: 'hook-1', guild }, staticPolicy, persistedPolicy).reason, 'webhook');
  assert.equal(policy.isMessageExempt({ author: { id: 'member-1' }, guild: null }, staticPolicy, persistedPolicy).reason, 'dm');
  assert.equal(policy.isMessageExempt({ author: { id: 'owner-1' }, guild }, staticPolicy, persistedPolicy).reason, 'owner');
  assert.equal(policy.isMessageExempt({ author: { id: 'guild-owner-1' }, guild }, staticPolicy, persistedPolicy).reason, 'guild_owner');
  assert.equal(policy.isMessageExempt({ author: { id: 'member-1' }, member: member({ permissionNames: ['Administrator'] }), guild }, staticPolicy, persistedPolicy).reason, 'administrator');
  assert.equal(policy.isMessageExempt({ author: { id: 'member-1' }, member: member({ roleIds: ['reviewer-1'] }), guild }, staticPolicy, persistedPolicy).reason, 'reviewer_role');
  assert.equal(policy.isMessageExempt({ author: { id: 'member-1' }, member: member({ roleIds: ['allowed-role-1'] }), guild }, staticPolicy, persistedPolicy).reason, 'persisted_role_allowlist');
  assert.equal(policy.isMessageExempt({ author: { id: 'member-1' }, channelId: 'allowed-channel-1', guild }, staticPolicy, persistedPolicy).reason, 'persisted_channel_allowlist');
  assert.deepEqual(policy.isMessageExempt({ author: { id: 'member-1' }, guild }, staticPolicy, persistedPolicy), {
    exempt: false,
    reason: null,
  });
});

test('system Discord messages are exempt while ordinary guild messages remain eligible', () => {
  const guild = { id: 'guild-1', ownerId: 'guild-owner-1' };

  assert.deepEqual(policy.isMessageExempt({
    system: true,
    author: { id: 'member-1', bot: false },
    guild,
  }), {
    exempt: true,
    reason: 'system',
  });
  assert.deepEqual(policy.isMessageExempt({
    system: false,
    author: { id: 'member-1', bot: false },
    guild,
  }), {
    exempt: false,
    reason: null,
  });
});

test('exemption logic never reads message content', () => {
  const message = { author: { id: 'member-1' }, guild: { ownerId: 'other' } };
  Object.defineProperty(message, 'content', {
    get() {
      throw new Error('content must not be inspected');
    },
  });
  assert.deepEqual(policy.isMessageExempt(message, {}, {}), { exempt: false, reason: null });
});

test('prerequisite failures force monitor with fixed issue codes', () => {
  const cases = [
    ['invalid policy', { configuredMode: 'invalid' }, 'POLICY_INVALID'],
    ['public mod logs', { modLogChannel: { permissionsFor: () => permissions('ViewChannel') } }, 'MOD_LOG_PUBLIC'],
    ['missing Ban Members', { botPermissions: permissions('ManageMessages') }, 'BAN_MEMBERS_MISSING'],
    ['missing Manage Messages', { botPermissions: permissions('BanMembers') }, 'MANAGE_MESSAGES_MISSING'],
    ['unbannable target', { targetMember: { bannable: false } }, 'TARGET_UNBANNABLE'],
  ];

  for (const [label, overrides, issue] of cases) {
    const result = policy.assessPrerequisites(basePrerequisiteContext(overrides));
    assert.equal(result.effectiveMode, 'monitor', label);
    assert.ok(result.issues.includes(issue), label);
    assert.ok(result.issues.every(code => [
      'MOD_LOG_PUBLIC',
      'BAN_MEMBERS_MISSING',
      'MANAGE_MESSAGES_MISSING',
      'TARGET_UNBANNABLE',
      'POLICY_INVALID',
    ].includes(code)), label);
  }
});

test('valid prerequisites preserve the configured mode', () => {
  assert.deepEqual(policy.assessPrerequisites(basePrerequisiteContext()), {
    configuredMode: 'active',
    effectiveMode: 'active',
    issues: [],
  });
  assert.equal(policy.assessPrerequisites(basePrerequisiteContext({ configuredMode: 'monitor' })).effectiveMode, 'monitor');
  assert.equal(policy.assessPrerequisites(basePrerequisiteContext({ configuredMode: 'off' })).effectiveMode, 'off');
});

test('unknown mod-log shape fails closed to monitor', () => {
  const result = policy.assessPrerequisites(basePrerequisiteContext({ modLogChannel: {}, modLogPrivate: true }));
  assert.equal(result.effectiveMode, 'monitor');
  assert.deepEqual(result.issues, ['MOD_LOG_PUBLIC']);
});

test('mod-log permission lookup errors fail closed without escaping raw errors', () => {
  const result = policy.assessPrerequisites(basePrerequisiteContext({
    modLogChannel: {
      permissionsFor() {
        throw new Error('private fixture error');
      },
    },
  }));
  assert.equal(result.effectiveMode, 'monitor');
  assert.deepEqual(result.issues, ['MOD_LOG_PUBLIC']);
});
