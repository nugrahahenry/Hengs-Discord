const test = require('node:test');
const assert = require('node:assert/strict');

const { findMemberRole, assignMemberRole } = require('../src/utils/member-onboarding');
const { formatDuration, generateCard, CARD } = require('../src/utils/welcome-card');

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

test('production welcome background is an optimized card-sized PNG', async () => {
  const { loadImage } = require('@napi-rs/canvas');
  const backgroundPath = require('node:path').join(
    __dirname,
    '..',
    'assets',
    'welcome',
    'aurora-gateway-v2.png',
  );
  const stat = require('node:fs').statSync(backgroundPath);
  const image = await loadImage(backgroundPath);
  assert.equal(image.width, CARD.width);
  assert.equal(image.height, CARD.height);
  assert.ok(stat.size < 512 * 1024);
});

test('member tenure keeps minute and hour precision instead of showing zero days', () => {
  const joined = new Date('2026-08-23T11:33:00.000Z');
  assert.equal(formatDuration(joined, new Date('2026-08-23T11:41:00.000Z')), '8m');
  assert.equal(formatDuration(joined, new Date('2026-08-23T13:38:00.000Z')), '2h 5m');
  assert.equal(formatDuration(joined, new Date('2026-08-24T13:33:00.000Z')), '1d 2h');
  assert.equal(formatDuration(null, new Date('2026-08-24T13:33:00.000Z')), 'Unknown');
});

test('welcome runtime copy contains no em dash or en dash', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'src', 'index.js'),
    'utf8',
  );
  const welcomeStart = source.indexOf('client.on(Events.GuildMemberAdd');
  const welcomeEnd = source.indexOf('client.on(Events.GuildMemberUpdate');
  const welcomeSurface = source.slice(welcomeStart, welcomeEnd);
  assert.doesNotMatch(welcomeSurface, /[\u2013\u2014]/);
});
