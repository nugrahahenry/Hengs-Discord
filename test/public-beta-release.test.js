const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildCommandPlan, registerCommands } = require('../src/deploy-commands');
const { createPublicInviteUrl } = require('../src/create-public-invite');
const { buildConversationKey, buildSystemPrompt } = require('../src/agent');

const ROOT = path.join(__dirname, '..');

test('deployment plan keeps legacy commands home-only and publishes only setup globally', () => {
  const commands = [
    { name: 'admin', description: 'admin' },
    { name: 'fun', description: 'fun' },
    { name: 'setup', description: 'setup' },
  ];
  assert.deepEqual(buildCommandPlan(commands), {
    global: [commands[2]],
    home: [commands[0], commands[1]],
  });
});

test('command registration validates IDs before any external request', async () => {
  const calls = [];
  const rest = { put: async (...args) => calls.push(args) };
  const commands = [{ name: 'setup' }, { name: 'fun' }];
  await assert.rejects(
    registerCommands({ rest, clientId: 'invalid', guildId: '223456789012345678', commands }),
    /CLIENT_ID_INVALID/,
  );
  assert.deepEqual(calls, []);
  const plan = await registerCommands({
    rest,
    clientId: '123456789012345678',
    guildId: '223456789012345678',
    commands,
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(plan.global, [commands[0]]);
  assert.deepEqual(plan.home, [commands[1]]);
});

test('public invite has minimal permissions and no token', () => {
  const url = new URL(createPublicInviteUrl({ clientId: '123456789012345678' }));
  assert.equal(url.origin, 'https://discord.com');
  assert.equal(url.pathname, '/oauth2/authorize');
  assert.equal(url.searchParams.get('client_id'), '123456789012345678');
  assert.deepEqual(url.searchParams.get('scope').split(' ').sort(), ['applications.commands', 'bot']);
  assert.ok(BigInt(url.searchParams.get('permissions')) > 0n);
  assert.equal(url.searchParams.has('token'), false);
  assert.throws(() => createPublicInviteUrl({ clientId: 'unsafe' }), /CLIENT_ID_INVALID/);
});

test('AI context is separated by guild and public prompt has no Henry biography', () => {
  const one = buildConversationKey('123456789012345678', '223456789012345678');
  const two = buildConversationKey('323456789012345678', '223456789012345678');
  assert.equal(one, '123456789012345678:223456789012345678');
  assert.notEqual(one, two);
  const prompt = buildSystemPrompt({ kind: 'public' });
  assert.match(prompt, /Hengs/i);
  assert.doesNotMatch(prompt, /Henry|semester|Henzzz/i);
  assert.doesNotMatch(prompt, /[\u2013\u2014]/);
});

test('AI module can load during secretless immutable release acceptance', () => {
  const env = { ...process.env };
  delete env.GROQ_API_KEY;
  delete env.OPENROUTER_API_KEY;
  delete env.OPENAI_API_KEY;
  const agentPath = path.join(ROOT, 'src', 'agent.js');
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(agentPath)})`], {
    cwd: os.tmpdir(),
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('runtime gates legacy paths before public traffic', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'index.js'), 'utf8');
  assert.match(source, /createGuildAccess/);
  assert.match(source, /guildAccess\.classify\(msg\.guildId\)/);
  assert.match(source, /messageScope\.kind !== 'home' && messageScope\.kind !== 'public'/);
  assert.match(source, /publicTrafficGuard\.acquire\(msg\.guildId\)/);
  assert.match(source, /lease\.release\(\)/);
  assert.match(source, /content: reply\.substring\(0, 2000\),\s+allowedMentions: \{ parse: \[\] \}/);
  assert.match(source, /\[public-ai\] PUBLIC_AI_FAILED/);
  assert.match(source, /if \(interactionScope\.kind !== 'home' && interaction\.commandName !== 'setup'\)/);
  assert.match(source, /if \(!guildAccess\.isHome\(member\.guild\.id\)\) return;/);
  assert.match(source, /if \(!guildAccess\.isHome\(reaction\.message\.guildId\)\) return;/);
});
