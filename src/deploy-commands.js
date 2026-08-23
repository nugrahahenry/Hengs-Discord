const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

function loadCommands(commandsPath = path.join(__dirname, 'commands')) {
  return fs.readdirSync(commandsPath)
    .filter(file => file.endsWith('.js'))
    .sort()
    .map(file => require(path.join(commandsPath, file)))
    .filter(command => command.data)
    .map(command => command.data.toJSON());
}

function buildCommandPlan(commands) {
  const publicNames = new Set(['hengs', 'setup']);
  for (const name of publicNames) {
    if (commands.filter(command => command.name === name).length !== 1) {
      throw new Error('PUBLIC_COMMAND_INVALID');
    }
  }
  return {
    global: commands.filter(command => publicNames.has(command.name)),
    home: commands.filter(command => !publicNames.has(command.name)),
  };
}

async function registerCommands({ rest, clientId, guildId, commands }) {
  if (!/^\d{17,20}$/.test(String(clientId || ''))) throw new Error('CLIENT_ID_INVALID');
  if (!/^\d{17,20}$/.test(String(guildId || ''))) throw new Error('GUILD_ID_INVALID');
  if (!rest || typeof rest.put !== 'function') throw new Error('REST_CLIENT_INVALID');
  const plan = buildCommandPlan(commands);
  await rest.put(Routes.applicationCommands(clientId), { body: plan.global });
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: plan.home });
  return plan;
}

async function main() {
  require('dotenv').config();
  const commands = loadCommands();
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  console.log(`Registering ${commands.length - 2} home commands dan 2 global public commands...`);
  try {
    await registerCommands({
      rest,
      clientId: process.env.DISCORD_CLIENT_ID,
      guildId: process.env.DISCORD_GUILD_ID,
      commands,
    });
    console.log('COMMAND_REGISTRATION_OK');
  } catch {
    console.error('COMMAND_REGISTRATION_FAILED');
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { buildCommandPlan, loadCommands, registerCommands };
