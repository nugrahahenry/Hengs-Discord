const assert = require('node:assert/strict');
const test = require('node:test');

const policy = require('../src/moderation/policy');

function permissions(...names) {
  const allowed = new Set(names);
  return { has: value => allowed.has(value) || allowed.has(String(value)) };
}

test('missing private mod-log channel permissions force monitor mode', () => {
  const botMember = { permissions: permissions('BanMembers', 'ManageMessages') };
  const result = policy.assessPrerequisites({
    configuredMode: 'active',
    staticPolicy: { ownerId: '570152798126342144', configurationValid: true },
    guild: { roles: { everyone: { id: '111111111111111111' } } },
    everyoneRole: { id: '111111111111111111' },
    botMember,
    botPermissions: botMember.permissions,
    targetMember: { bannable: true },
    modLogChannel: {
      permissionsFor(holder) {
        if (holder === botMember) return permissions('ViewChannel', 'SendMessages');
        return permissions();
      },
    },
  });

  assert.equal(result.effectiveMode, 'monitor');
  assert.deepEqual(result.issues, ['MOD_LOG_UNAVAILABLE']);
});
