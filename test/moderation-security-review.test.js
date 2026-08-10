const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const policy = require('../src/moderation/policy');

function permissions(...names) {
  const allowed = new Set(names);
  return { has: value => allowed.has(value) || allowed.has(String(value)) };
}
function privateLogChannel() {
  return { permissionsFor: () => permissions() };
}

test('static policy requires a valid owner and rejects partially invalid operator lists', () => {
  const valid = policy.readStaticPolicy({
    OWNER_ID: '570152798126342144',
    ANTI_RAID_MODE: 'active',
    ANTI_RAID_BLOCKED_DOMAINS: 'bad.example, scam.example',
    MODERATION_ROLE_IDS: '800000000000000001',
  });
  assert.equal(valid.ownerId, '570152798126342144');
  assert.equal(valid.configurationValid, true);

  for (const environment of [
    { ANTI_RAID_MODE: 'active', ANTI_RAID_BLOCKED_DOMAINS: 'bad.example' },
    { OWNER_ID: '570152798126342144', ANTI_RAID_MODE: 'active', ANTI_RAID_BLOCKED_DOMAINS: 'bad.example/path' },
    { OWNER_ID: '570152798126342144', ANTI_RAID_MODE: 'active', MODERATION_ROLE_IDS: 'not-a-role' },
  ]) {
    assert.equal(policy.readStaticPolicy(environment).configurationValid, false);
  }
});

test('invalid static policy forces active enforcement into monitor mode', () => {
  const result = policy.assessPrerequisites({
    configuredMode: 'active',
    staticPolicy: { ownerId: null, configurationValid: false },
    modLogChannel: privateLogChannel(),
    botPermissions: permissions('BanMembers', 'ManageMessages'),
    targetMember: { bannable: true },
  });

  assert.equal(result.effectiveMode, 'monitor');
  assert.deepEqual(result.issues, ['POLICY_INVALID']);
});

test('fallback message references have a 120-second timer and matched cleanup', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/moderation/hub.js'), 'utf8');
  assert.match(source, /TRACKED_MESSAGE_TTL_MS\s*=\s*120_000/);
  assert.match(source, /expiresAt:\s*Date\.now\(\)\s*\+\s*TRACKED_MESSAGE_TTL_MS/);
  assert.match(source, /setTimeout\(\(\)\s*=>\s*\{[\s\S]*?pruneTrackedMessages\(\)/);
  assert.match(source, /finally\s*\{\s*forgetMatchedMessages\(message, matched\)/);
});