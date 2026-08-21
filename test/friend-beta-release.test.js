const assert = require('node:assert/strict');
const test = require('node:test');

const { createBetaInviteUrl } = require('../src/create-beta-invite');
const { createPublicInviteUrl } = require('../src/create-public-invite');

test('legacy beta invite helper delegates to the public invite contract', () => {
  const input = { clientId: '123456789012345678' };
  assert.equal(createBetaInviteUrl(input), createPublicInviteUrl(input));
});
