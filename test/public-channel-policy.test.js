const assert = require('node:assert/strict');
const test = require('node:test');

const { isPublicChannelAllowed } = require('../src/guilds/public-channel-policy');

const CHANNEL = '523456789012345678';
const OTHER = '623456789012345678';

test('public channel policy allows legacy and all-channel configs', () => {
  assert.equal(isPublicChannelAllowed({ schemaVersion: 1 }, CHANNEL), true);
  assert.equal(isPublicChannelAllowed({
    schemaVersion: 3,
    settings: { channelId: null, channelMode: 'all', language: 'auto', replyStyle: 'balanced' },
  }, CHANNEL), true);
});

test('public channel policy permits only the selected current channel', () => {
  const config = {
    schemaVersion: 3,
    settings: {
      channelId: CHANNEL,
      channelMode: 'current',
      language: 'id',
      replyStyle: 'concise',
    },
  };
  assert.equal(isPublicChannelAllowed(config, CHANNEL), true);
  assert.equal(isPublicChannelAllowed(config, OTHER), false);
  assert.throws(() => isPublicChannelAllowed(config, 'invalid'), /CHANNEL_ID_INVALID/);
});
