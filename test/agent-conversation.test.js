const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'agent.js'), 'utf8');
const GUILD = '223456789012345678';
const USER = '323456789012345678';
const KEY = `${GUILD}:${USER}`;

function fixture() {
  let now = 10_000;
  const calls = [];
  const logs = [];
  let responder = async () => ({ choices: [{ message: { content: 'Jawaban fixture' } }] });
  class FakeOpenAI {
    constructor() {
      this.chat = { completions: { create: async (params) => {
        calls.push(structuredClone(params));
        return responder(params);
      } } };
    }
  }
  const module = { exports: {} };
  vm.runInNewContext(SOURCE, {
    module,
    require(name) {
      if (name === 'dotenv') return { config() {} };
      if (name === 'openai') return FakeOpenAI;
      throw new Error('UNEXPECTED_TEST_DEPENDENCY');
    },
    process: { env: { GROQ_API_KEY: 'fixture-only' } },
    console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    AbortController,
    setTimeout,
    clearTimeout,
    Date: class extends Date { static now() { return now; } },
  }, { filename: 'agent.js' });
  return {
    agent: module.exports,
    calls,
    logs,
    tick(ms = 3000) { now += ms; },
    respondWith(callback) { responder = callback; },
  };
}

function turns(call) {
  return call.messages.filter(message => message.role !== 'system').map(message => message.content);
}

test('private AI turns never reach shared chat for the same guild and user', async () => {
  const value = fixture();
  await value.agent.chat('PRIVATE_FIXTURE', KEY, { visibility: 'private' });
  value.tick();
  await value.agent.chat('SHARED_FIXTURE', KEY, { visibility: 'shared' });
  assert.deepEqual(turns(value.calls[1]), ['SHARED_FIXTURE']);
  value.tick();
  await value.agent.chat('PRIVATE_FOLLOWUP', KEY, { visibility: 'private' });
  assert.deepEqual(turns(value.calls[2]), ['PRIVATE_FIXTURE', 'Jawaban fixture', 'PRIVATE_FOLLOWUP']);
  value.tick();
  await value.agent.chat('DEFAULT_SHARED', KEY);
  assert.deepEqual(turns(value.calls[3]), ['SHARED_FIXTURE', 'Jawaban fixture', 'DEFAULT_SHARED']);
});

test('reset clears both surfaces only for its caller and blocks an old in-flight reply', async () => {
  const value = fixture();
  const otherKey = `${GUILD}:423456789012345678`;
  await value.agent.chat('OTHER_USER', otherKey);
  await value.agent.chat('OLD_SHARED', KEY);
  value.tick();
  let resolve;
  value.respondWith(() => new Promise(done => { resolve = done; }));
  const pending = value.agent.chat('OLD_PRIVATE', KEY, { visibility: 'private' });
  value.agent.clearHistory(KEY);
  resolve({ choices: [{ message: { content: 'OLD_REPLY' } }] });
  assert.match(await pending, /direset/i);
  value.respondWith(async () => ({ choices: [{ message: { content: 'New reply' } }] }));
  await value.agent.chat('NEW_PRIVATE', KEY, { visibility: 'private' });
  assert.deepEqual(turns(value.calls.at(-1)), ['NEW_PRIVATE']);
  value.tick();
  await value.agent.chat('NEW_SHARED', KEY);
  assert.deepEqual(turns(value.calls.at(-1)), ['NEW_SHARED']);
  await value.agent.chat('OTHER_FOLLOWUP', otherKey);
  assert.deepEqual(turns(value.calls.at(-1)), ['OTHER_USER', 'Jawaban fixture', 'OTHER_FOLLOWUP']);
});

test('each surface retains at most ten messages without storing failed turns', async () => {
  const value = fixture();
  for (let i = 0; i < 8; i++) {
    await value.agent.chat(`private-${i}`, KEY, { visibility: 'private' });
    value.tick();
  }
  assert.equal(value.calls.at(-1).messages.length, 12);
  assert.deepEqual(turns(value.calls.at(-1)).filter((_, index) => index % 2 === 0), [
    'private-2', 'private-3', 'private-4', 'private-5', 'private-6', 'private-7',
  ]);
  value.respondWith(async () => { throw new Error('PRIVATE_PROVIDER_DETAIL'); });
  await value.agent.chat('FAILED_TURN', KEY, { visibility: 'private' });
  value.tick();
  value.respondWith(async () => ({ choices: [{ message: { content: 'Recovered' } }] }));
  await value.agent.chat('RECOVERED_TURN', KEY, { visibility: 'private' });
  assert.equal(turns(value.calls.at(-1)).includes('FAILED_TURN'), false);
});

test('invalid visibility fails closed before cooldown or provider traffic', async () => {
  const value = fixture();
  await assert.rejects(value.agent.chat('ignored', KEY, { visibility: 'forged' }), /CONVERSATION_VISIBILITY_INVALID/);
  assert.equal(value.calls.length, 0);
  await value.agent.chat('valid', KEY, { visibility: 'private' });
  assert.equal(value.calls.length, 1);
});

test('shared cooldown cannot be bypassed by switching visibility and guilds remain isolated', async () => {
  const value = fixture();
  await value.agent.chat('private', KEY, { visibility: 'private' });
  await value.agent.chat('shared', KEY);
  assert.equal(value.calls.length, 1);
  await value.agent.chat('other guild', `523456789012345678:${USER}`, { visibility: 'private' });
  assert.deepEqual(turns(value.calls.at(-1)), ['other guild']);
});
