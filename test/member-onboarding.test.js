const test = require('node:test');
const assert = require('node:assert/strict');

const { findMemberRole, assignMemberRole } = require('../src/utils/member-onboarding');
const { generateCard, CARD } = require('../src/utils/welcome-card');

function cache(items) {
  const map = new Map(items.map((item) => [item.id, item]));
  map.find = (predicate) => [...map.values()].find(predicate);
  return map;
}

test('member role fallback requires an exact normalized Member name', () => {
  const wrong = { id: 'role-1', name: 'OG Member' };
  const right = { id: 'role-2', name: 'Member' };
  const guild = { roles: { cache: cache([wrong, right]) } };

  assert.equal(findMemberRole(guild, null), right);
  assert.equal(findMemberRole(guild, 'role-1'), wrong);
});

test('auto-role works independently and rejects invalid hierarchy', async () => {
  const role = { id: 'member-role', name: 'Member' };
  const added = [];
  const logger = { log() {}, warn() {}, error() {} };
  const member = {
    user: { username: 'new-member' },
    guild: {
      roles: { cache: cache([role]) },
      members: { me: { roles: { highest: { comparePositionTo: () => 1 } } } },
    },
    roles: {
      cache: new Map(),
      add: async (value) => added.push(value.id),
    },
  };

  const accepted = await assignMemberRole(member, null, logger);
  assert.equal(accepted.ok, true);
  assert.deepEqual(added, ['member-role']);

  member.guild.members.me.roles.highest.comparePositionTo = () => 0;
  const rejected = await assignMemberRole(member, null, logger);
  assert.equal(rejected.reason, 'role_hierarchy');
  assert.deepEqual(added, ['member-role']);
});

test('welcome and leave cards render valid PNG buffers offline', async () => {
  const now = new Date('2026-07-31T08:00:00Z');
  const member = {
    id: '570152798126342144',
    displayName: 'Henry',
    joinedAt: new Date('2026-07-30T08:00:00Z'),
    guild: { memberCount: 42 },
    user: {
      id: '570152798126342144',
      username: 'henry',
      createdAt: new Date('2020-01-01T00:00:00Z'),
      displayAvatarURL: () => null,
    },
  };

  for (const type of ['welcome', 'leave']) {
    const output = await generateCard(member, type, { now, serverName: 'Hengs' });
    assert.ok(Buffer.isBuffer(output));
    assert.deepEqual([...output.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(output.readUInt32BE(16), CARD.width);
    assert.equal(output.readUInt32BE(20), CARD.height);
  }
});
