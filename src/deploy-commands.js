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
  const setup = commands.filter(command => command.name === 'setup');
  if (setup.length !== 1) throw new Error('SETUP_COMMAND_INVALID');
  return {
    global: setup,
    home: commands.filter(command => command.name !== 'setup'),
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
  console.log(`Registering ${commands.length - 1} home commands dan 1 global setup command...`);
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
