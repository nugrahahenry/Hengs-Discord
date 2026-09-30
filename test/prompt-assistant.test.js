const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BLUEPRINTS,
  buildCommunityPlan,
  buildPromptHelp,
  classifyPrompt,
  resolvePrompt,
} = require('../src/prompt-assistant');

const GUILD = '223456789012345678';
const OWNER = '323456789012345678';
const MEMBER = '423456789012345678';

function guild(names = []) {
  return {
    ownerId: OWNER,
    channels: { cache: new Map(names.map((name, index) => [String(index), { name }])) },
  };
}

function actor(id = OWNER, administrator = false) {
  return {
    user: { id },
    memberPermissions: { has: flag => flag === 'Administrator' && administrator },
  };
}

test('prompt classifier keeps ordinary chat on the AI path', () => {
  assert.equal(classifyPrompt('Jelaskan queue dengan contoh sederhana').kind, 'chat');
  assert.equal(classifyPrompt('').kind, 'empty');
  assert.equal(classifyPrompt('Apa yang bisa Hengs bantu?').kind, 'help');
});

test('prompt classifier recognizes safe community planning language', () => {
  const result = classifyPrompt('Rancang struktur server gaming dengan area mabar dan creator');
  assert.equal(result.kind, 'community_plan');
  assert.equal(result.prompt, 'Rancang struktur server gaming dengan area mabar dan creator');
});

test('community blueprint is fixed, bounded, and marks existing channels', () => {
  const content = buildCommunityPlan(
    'Buat struktur server gaming dan creator',
    guild(['announcements', 'ngobrol-santai']),
  );
  assert.match(content, /LOBI MASUK/);
  assert.match(content, /AREA GAMING/);
  assert.match(content, /CREATOR STUDIO/);
  assert.match(content, /#announcements \(sudah ada\)/);
  assert.match(content, /#info-mabar \(disarankan\)/);
  assert.ok(content.length <= 1900);
  assert.doesNotMatch(content, /[\u2013\u2014]/);
  assert.equal(BLUEPRINTS.length, 4);
});

test('community plan is home owner or administrator only', () => {
  const prompt = 'Buatkan struktur server gaming';
  const denied = resolvePrompt({
    prompt,
    scopeKind: 'home',
    actor: actor(MEMBER),
    guild: guild(),
  });
  assert.equal(denied.handled, true);
  assert.equal(denied.kind, 'permission');
  assert.match(denied.content, /Administrator/i);

  const allowed = resolvePrompt({
    prompt,
    scopeKind: 'home',
    actor: actor(OWNER),
    guild: guild(),
  });
  assert.equal(allowed.kind, 'community_plan');
  assert.match(allowed.content, /Belum ada channel/);

  const publicScope = resolvePrompt({
    prompt,
    scopeKind: 'public',
    actor: actor(OWNER),
    guild: guild(),
  });
  assert.equal(publicScope.handled, false);
});

test('prompt help stays provider-free and does not promise mutations', () => {
  const result = resolvePrompt({ prompt: 'contoh prompt apa yang bisa dipakai', scopeKind: 'public' });
  assert.equal(result.handled, true);
  assert.equal(result.kind, 'help');
  assert.match(result.content, /rancang struktur server/i);
  assert.match(buildPromptHelp(), /menunggu review dan konfirmasi owner/i);
  assert.doesNotMatch(result.content, /[\u2013\u2014]/);
});
