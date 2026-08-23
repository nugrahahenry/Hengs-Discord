const { resolveChannelScope } = require('./config-store');

const SNOWFLAKE = /^\d{17,20}$/;

function isPublicChannelAllowed(config, channelId) {
  const normalizedChannelId = String(channelId || '').trim();
  if (!SNOWFLAKE.test(normalizedChannelId)) throw new Error('CHANNEL_ID_INVALID');
  const scope = resolveChannelScope(config);
  return scope.channelMode === 'all' || scope.channelId === normalizedChannelId;
}

module.exports = { isPublicChannelAllowed };
