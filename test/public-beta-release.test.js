const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { PermissionFlagsBits } = require('discord.js');

const { buildCommandPlan, registerCommands } = require('../src/deploy-commands');
const { createPublicInviteUrl } = require('../src/create-public-invite');
const { buildConversationKey, buildSystemPrompt } = require('../src/agent');

const ROOT = path.join(__dirname, '..');

test('deployment plan keeps legacy commands home-only and publishes setup plus hengs globally', () => {
  const commands = [
    { name: 'admin', description: 'admin' },
    { name: 'fun', description: 'fun' },
    { name: 'hengs', description: 'hengs' },
    { name: 'setup', description: 'setup' },
  ];
  assert.deepEqual(buildCommandPlan(commands), {
    global: [commands[2], commands[3]],
    home: [commands[0], commands[1]],
  });
});

test('command registration validates IDs before any external request', async () => {
  const calls = [];
  const rest = { put: async (...args) => calls.push(args) };
  const commands = [{ name: 'setup' }, { name: 'hengs' }, { name: 'fun' }];
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
  assert.deepEqual(plan.global, [commands[0], commands[1]]);
  assert.deepEqual(plan.home, [commands[2]]);
});

test('public invite has minimal permissions and no token', () => {
  const url = new URL(createPublicInviteUrl({ clientId: '123456789012345678' }));
  assert.equal(url.origin, 'https://discord.com');
  assert.equal(url.pathname, '/oauth2/authorize');
  assert.equal(url.searchParams.get('client_id'), '123456789012345678');
  assert.deepEqual(url.searchParams.get('scope').split(' ').sort(), ['applications.commands', 'bot']);
  const expectedPermissions = PermissionFlagsBits.ViewChannel
    | PermissionFlagsBits.SendMessages
    | PermissionFlagsBits.ReadMessageHistory
    | PermissionFlagsBits.AttachFiles;
  assert.equal(BigInt(url.searchParams.get('permissions')), expectedPermissions);
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
  const concise = buildSystemPrompt({ kind: 'public', replyStyle: 'concise' });
  const technical = buildSystemPrompt({ kind: 'public', replyStyle: 'technical' });
  assert.match(concise, /ringkas/i);
  assert.match(technical, /teknis/i);
  const automatic = buildSystemPrompt({ kind: 'public', language: 'auto' });
  const indonesian = buildSystemPrompt({ kind: 'public', language: 'id' });
  const english = buildSystemPrompt({ kind: 'public', language: 'en' });
  assert.match(automatic, /bahasa pengguna/i);
  assert.match(indonesian, /Bahasa Indonesia/i);
  assert.match(english, /English/i);
  assert.throws(
    () => buildSystemPrompt({ kind: 'public', replyStyle: 'custom prompt' }),
    /PUBLIC_REPLY_STYLE_INVALID/,
  );
  assert.throws(
    () => buildSystemPrompt({ kind: 'public', language: 'free-form' }),
    /PUBLIC_LANGUAGE_INVALID/,
  );
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
  assert.match(source, /publicInsightsStore\.claimAccepted\(msg\.guildId\)/);
  assert.ok(
    source.indexOf('publicInsightsStore.claimAccepted(msg.guildId)')
      < source.indexOf('agent.chat(text, conversationKey'),
  );
  assert.match(source, /buildPublicFeedbackComponents/);
  assert.match(source, /handlePublicFeedback/);
  assert.match(source, /isPublicChannelAllowed\(messageScope\.config, msg\.channelId\)/);
  assert.match(source, /replyStyle: messageScope\.config\?\.settings\?\.replyStyle \|\| 'balanced'/);
  assert.match(source, /language: messageScope\.config\?\.settings\?\.language \|\| 'auto'/);
  assert.match(source, /Events\.GuildCreate/);
  assert.match(source, /lease\.release\(\)/);
  assert.match(source, /content: reply\.substring\(0, 2000\),[\s\S]+allowedMentions: \{ parse: \[\] \}/);
  assert.match(source, /\[public-ai\] PUBLIC_AI_FAILED/);
  assert.match(source, /PUBLIC_COMMANDS\.has\(interaction\.commandName\)/);
  assert.match(source, /\[public-command\] PUBLIC_COMMAND_FAILED/);
  assert.match(source, /publicTrafficGuard,/);
  assert.match(source, /publicInsightsStore,/);
  assert.match(source, /createCommunityPack/);
  assert.match(source, /communityPack\.sendMemberEvent\(member, 'welcome', scope\.config\)/);
  assert.match(source, /communityPack\.sendMemberEvent\(member, 'leave', scope\.config\)/);
  assert.match(source, /if \(scope\.kind !== 'home'\) return;/);
  assert.match(source, /if \(!guildAccess\.isHome\(reaction\.message\.guildId\)\) return;/);
});

test('runtime source contains no em dash or en dash', () => {
  const pending = [path.join(ROOT, 'src')];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        const source = fs.readFileSync(target, 'utf8');
        assert.doesNotMatch(source, /[\u2013\u2014]/, path.relative(ROOT, target));
      }
    }
  }
});
