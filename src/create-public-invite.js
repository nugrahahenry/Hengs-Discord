const { PermissionFlagsBits } = require('discord.js');

const SNOWFLAKE = /^\d{17,20}$/;

function createPublicInviteUrl({ clientId }) {
  const normalized = String(clientId || '').trim();
  if (!SNOWFLAKE.test(normalized)) throw new Error('CLIENT_ID_INVALID');
  const permissions = PermissionFlagsBits.ViewChannel
    | PermissionFlagsBits.SendMessages
    | PermissionFlagsBits.ReadMessageHistory;
  const query = new URLSearchParams({
    client_id: normalized,
    permissions: permissions.toString(),
    scope: 'bot applications.commands',
  });
  return `https://discord.com/oauth2/authorize?${query.toString()}`;
}

if (require.main === module) {
  require('dotenv').config();
  try {
    console.log(createPublicInviteUrl({ clientId: process.env.DISCORD_CLIENT_ID }));
  } catch (error) {
    console.error(`INVITE_FAILED=${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createPublicInviteUrl };
