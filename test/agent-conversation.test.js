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
      if (name === './conversation-context') return require('../src/conversation-context');
      if (name === './news/completion') return require('../src/news/completion');
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

test('news completion reuses the provider without private or shared conversation history', async () => {
  const value = fixture();
  await value.agent.chat('PRIVATE_CHAT_SENTINEL', KEY, { visibility: 'private' });
  value.respondWith(async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"items":[]}' } }] }));
  const messages = [{ role: 'system', content: 'Public news editor' }, { role: 'user', content: 'PUBLIC_FEED_FIXTURE' }];
  await value.agent.completeNews(messages, { signal: new AbortController().signal });
  assert.deepEqual(value.calls.at(-1).messages, messages);
  assert.equal(JSON.stringify(value.calls.at(-1)).includes('PRIVATE_CHAT_SENTINEL'), false);
  assert.equal(value.calls.at(-1).model, 'openai/gpt-oss-120b');
  assert.equal(value.calls.at(-1).reasoning_effort, 'low');
  assert.equal(value.calls.at(-1).include_reasoning, false);
  assert.equal(value.calls.at(-1).response_format.type, 'json_schema');
});

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

test('longer private context recalls an older relevant exchange without storing failed turns', async () => {
  const value = fixture();
  await value.agent.chat('Proyek Nebula deadline Jumat.', KEY, { visibility: 'private' });
  value.tick();
  for (let i = 0; i < 20; i++) {
    await value.agent.chat(`selingan-${i} tanaman`, KEY, { visibility: 'private' });
    value.tick();
  }
  await value.agent.chat('Balik ke Nebula, deadline kapan?', KEY, { visibility: 'private' });
  assert.equal(turns(value.calls.at(-1)).includes('Proyek Nebula deadline Jumat.'), true);
  assert.equal(value.calls.at(-1).messages.length <= 26, true);
  value.tick();
  value.respondWith(async () => { throw new Error('PRIVATE_PROVIDER_DETAIL'); });
  await value.agent.chat('FAILED_TURN', KEY, { visibility: 'private' });
  value.tick();
  value.respondWith(async () => ({ choices: [{ message: { content: 'Recovered' } }] }));
  await value.agent.chat('RECOVERED_TURN', KEY, { visibility: 'private' });
  assert.equal(turns(value.calls.at(-1)).includes('FAILED_TURN'), false);
  assert.equal(value.logs.some(line => line.includes('PRIVATE_PROVIDER_DETAIL')), false);
});

test('private feature receipts contain no payload and reset invalidates an awaited tool lease', async () => {
  const value = fixture();
  const lease = value.agent.createConversationLease(KEY);
  assert.equal(lease.recordFeature('notes', 'PENDING_CONFIRMATION'), true);
  assert.equal(lease.recordFeature('private-note-payload', 'SAVED'), false);
  assert.equal(lease.recordFeature('notes', 'forged-success'), false);
  await value.agent.chat('yang tadi sudah tersimpan?', KEY, { visibility: 'private' });
  assert.match(turns(value.calls.at(-1)).join(' '), /catatan.*PENDING_CONFIRMATION/);
  value.tick();
  await value.agent.chat('publik', KEY);
  assert.doesNotMatch(turns(value.calls.at(-1)).join(' '), /catatan|PENDING_CONFIRMATION/);
  value.agent.clearHistory(KEY);
  assert.equal(lease.recordFeature('notes', 'SAVED'), false);
  await value.agent.chat('setelah reset', KEY, { visibility: 'private' });
  assert.deepEqual(turns(value.calls.at(-1)), ['setelah reset']);
});

test('six-hour session expiry drops old chat and tool receipts', async () => {
  const value = fixture();
  value.agent.createConversationLease(KEY).recordFeature('notes', 'SAVED');
  await value.agent.chat('OLD_CONTEXT', KEY, { visibility: 'private' });
  value.tick(6 * 60 * 60 * 1000);
  await value.agent.chat('NEW_CONTEXT', KEY, { visibility: 'private' });
  assert.deepEqual(turns(value.calls.at(-1)), ['NEW_CONTEXT']);
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

test('coach chat keeps its own history apart from shared chat and adds the coach data to the system prompt', async () => {
  const value = fixture();
  await value.agent.chat('SHARED_1', KEY);
  value.tick();
  await value.agent.chat('COACH_1', KEY, { visibility: 'coach', system: 'COACH_DATA_FIXTURE' });
  assert.deepEqual(turns(value.calls[1]), ['COACH_1']);
  assert.ok(value.calls[1].messages[0].content.endsWith('\n\nCOACH_DATA_FIXTURE'));
  value.tick();
  await value.agent.chat('SHARED_2', KEY);
  assert.deepEqual(turns(value.calls[2]), ['SHARED_1', 'Jawaban fixture', 'SHARED_2']);
  assert.doesNotMatch(value.calls[2].messages[0].content, /COACH_DATA_FIXTURE/);
  value.tick();
  await value.agent.chat('COACH_2', KEY, { visibility: 'coach', system: 'COACH_DATA_FIXTURE' });
  assert.deepEqual(turns(value.calls[3]), ['COACH_1', 'Jawaban fixture', 'COACH_2']);
});

test('coach data goes in as its own user message right before the question and never into history', async () => {
  const value = fixture();
  await value.agent.chat('Q1', KEY, { visibility: 'coach', system: 'RULES_FIXTURE', data: 'DATA_1' });
  assert.deepEqual(turns(value.calls[0]), ['DATA_1', 'Q1']);
  assert.deepEqual(value.calls[0].messages.slice(-2).map(message => message.role), ['user', 'user']);
  assert.doesNotMatch(value.calls[0].messages[0].content, /DATA_1/);
  value.tick();
  await value.agent.chat('Q2', KEY, { visibility: 'coach', system: 'RULES_FIXTURE', data: 'DATA_2' });
  assert.deepEqual(turns(value.calls[1]), ['Q1', 'Jawaban fixture', 'DATA_2', 'Q2']);
});

test('a guard rewrites the model reply before it is stored or returned, and fixed replies skip it', async () => {
  const value = fixture();
  const seen = [];
  const guard = text => { seen.push(text); return text.toUpperCase(); };
  assert.equal(await value.agent.chat('Q1', KEY, { visibility: 'coach', guard }), 'JAWABAN FIXTURE');
  assert.match(await value.agent.chat('too soon', KEY, { visibility: 'coach', guard }), /jangan spam/);
  value.tick();
  value.respondWith(async () => { throw new Error('PROVIDER_DOWN'); });
  assert.match(await value.agent.chat('down', KEY, { visibility: 'coach', guard }), /semua model lagi sibuk/);
  assert.deepEqual(seen, ['Jawaban fixture']);
  value.tick();
  value.respondWith(async () => ({ choices: [{ message: { content: 'next' } }] }));
  await value.agent.chat('Q2', KEY, { visibility: 'coach', guard });
  assert.deepEqual(turns(value.calls.at(-1)), ['Q1', 'JAWABAN FIXTURE', 'Q2']);
});

test('a turn may lower the temperature; anything else keeps the default', async () => {
  const value = fixture();
  await value.agent.chat('Q1', KEY, { visibility: 'coach', temperature: 0.3 });
  value.tick();
  await value.agent.chat('Q2', KEY, { visibility: 'coach', temperature: 'hot' });
  value.tick();
  await value.agent.chat('Q3', KEY);
  assert.deepEqual(value.calls.map(call => call.temperature), [0.3, 0.7, 0.7]);
});

test('a turn may raise the answer budget within bounds; anything else keeps 700 tokens', async () => {
  const value = fixture();
  await value.agent.chat('Q1', KEY, { visibility: 'coach', maxTokens: 900 });
  value.tick();
  await value.agent.chat('Q2', KEY, { visibility: 'coach', maxTokens: 99_999 });
  value.tick();
  await value.agent.chat('Q3', KEY);
  assert.deepEqual(value.calls.map(call => call.max_tokens), [900, 700, 700]);
});

test('a stateless coach turn neither reads nor writes history', async () => {
  const value = fixture();
  await value.agent.chat('COACH_1', KEY, { visibility: 'coach' });
  value.tick();
  await value.agent.chat('ONCE_WITH_PRIVATE_STATS', KEY, { visibility: 'coach', stateless: true, system: 'STAT KAMU' });
  assert.deepEqual(turns(value.calls[1]), ['ONCE_WITH_PRIVATE_STATS']);
  value.tick();
  await value.agent.chat('COACH_2', KEY, { visibility: 'coach' });
  assert.deepEqual(turns(value.calls[2]), ['COACH_1', 'Jawaban fixture', 'COACH_2']);
});
