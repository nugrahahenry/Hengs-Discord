const assert = require('node:assert/strict');
const test = require('node:test');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const {
  CHAT_PERMISSIONS,
  SETUP_PERMISSIONS,
  SETUP_STANDARD_CHANNEL_ID,
  buildSetupWizardComponents,
  canUseSetupChannel,
  isSetupWizardInteraction,
  reviewPublicConfiguration,
} = require('../src/guilds/setup-wizard');

const GUILD = '223456789012345678';
const CHANNEL = '523456789012345678';

function fixture({ allowed = SETUP_PERMISSIONS, guildId = GUILD, type = ChannelType.GuildText } = {}) {
  const permissionSet = new Set(allowed);
  const guild = { id: GUILD, members: { me: { id: 'bot' } } };
  const channel = {
    id: CHANNEL,
    guildId,
    type,
    isTextBased: () => true,
    send() {},
    permissionsFor: () => ({ has: permission => permissionSet.has(permission) }),
  };
  guild.channels = {
    cache: new Map([[CHANNEL, channel]]),
    async fetch(id) { return id === CHANNEL ? channel : null; },
  };
  return { guild, channel };
}

test('setup wizard exposes one exact text-channel selector', () => {
  const components = buildSetupWizardComponents();
  assert.equal(components.length, 1);
  const selector = components[0].toJSON().components[0];
  assert.equal(selector.custom_id, SETUP_STANDARD_CHANNEL_ID);
  assert.equal(selector.min_values, 1);
  assert.equal(selector.max_values, 1);
  assert.deepEqual(selector.channel_types, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
  assert.equal(isSetupWizardInteraction({
    customId: SETUP_STANDARD_CHANNEL_ID,
    isChannelSelectMenu: () => true,
  }), true);
  assert.equal(isSetupWizardInteraction({
    customId: 'hengs-setup:forged',
    isChannelSelectMenu: () => true,
  }), false);
});

test('setup channel permission gate rejects cross-guild, wrong-type, and incomplete access', () => {
  assert.equal(canUseSetupChannel(fixture().channel, fixture().guild), true);
  const crossGuild = fixture({ guildId: '623456789012345678' });
  assert.equal(canUseSetupChannel(crossGuild.channel, crossGuild.guild), false);
  const wrongType = fixture({ type: ChannelType.GuildVoice });
  assert.equal(canUseSetupChannel(wrongType.channel, wrongType.guild), false);
  for (const missing of SETUP_PERMISSIONS) {
    const value = fixture({ allowed: SETUP_PERMISSIONS.filter(permission => permission !== missing) });
    assert.equal(canUseSetupChannel(value.channel, value.guild), false);
  }
  assert.ok(CHAT_PERMISSIONS.includes(PermissionFlagsBits.ReadMessageHistory));
  assert.ok(SETUP_PERMISSIONS.includes(PermissionFlagsBits.AttachFiles));
});

test('configuration review reports only fixed issue codes', async () => {
  const { guild } = fixture();
  const config = {
    schemaVersion: 4,
    settings: {
      channelId: CHANNEL,
      channelMode: 'current',
      language: 'auto',
      replyStyle: 'balanced',
      welcomeChannelId: CHANNEL,
      welcomeEnabled: true,
    },
  };
  const healthy = await reviewPublicConfiguration(guild, config, {
    canUseChannel: () => true,
  });
  assert.deepEqual(healthy, { ok: true, issues: [] });
  const noAttachment = fixture({ allowed: CHAT_PERMISSIONS });
  const chatOnly = await reviewPublicConfiguration(noAttachment.guild, {
    ...config,
    settings: { ...config.settings, welcomeEnabled: false, welcomeChannelId: null },
  }, { canUseChannel: () => false });
  assert.deepEqual(chatOnly, { ok: true, issues: [] });
  guild.channels.cache.clear();
  guild.channels.fetch = async () => null;
  const broken = await reviewPublicConfiguration(guild, config, {
    canUseChannel: () => false,
  });
  assert.deepEqual(broken, {
    ok: false,
    issues: ['CHAT_CHANNEL_UNAVAILABLE', 'COMMUNITY_CHANNEL_UNAVAILABLE'],
  });
});
