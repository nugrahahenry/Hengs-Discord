const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BLUEPRINTS,
  applyFocusAction,
  buildCommunityPlan,
  buildCommunityQuestions,
  resolveChannelNameStyle,
  buildPromptHelp,
  classifyPrompt,
  parseFocusPrompt,
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

test('generic community prompts ask bounded preference questions before preview', () => {
  const result = classifyPrompt('Buatkan server');
  assert.equal(result.kind, 'community_questions');
  assert.match(buildCommunityQuestions(), /Fokus komunitasnya/);
  assert.match(buildCommunityQuestions(), /Voice room/);
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
  assert.match(content, /🔊 mabar-1 \(disarankan\)/);
  assert.ok(content.length <= 1900);
  assert.doesNotMatch(content, /[\u2013\u2014]/);
  assert.equal(BLUEPRINTS.length, 4);
});

test('community planning supports an emoji layout without changing the safety flow', () => {
  assert.equal(resolveChannelNameStyle('pakai ikon dan emoji'), 'emoji');
  const content = buildCommunityPlan(
    'Rancang server gaming pakai emoji',
    guild(['📢・announcements']),
  );
  assert.match(content, /🎉・LOBI MASUK/);
  assert.match(content, /📢・announcements \(sudah ada\)/);
  assert.match(content, /Gaya nama: \*\*ikon dan emoji\*\*/);
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

test('generic community request stays private and does not issue a review ticket', () => {
  const result = resolvePrompt({
    prompt: 'Buatkan server',
    scopeKind: 'home',
    actor: actor(OWNER),
    guild: guild(),
  });
  assert.equal(result.kind, 'community_questions');
  assert.match(result.content, /tiga hal/i);
  assert.equal(Object.hasOwn(result, 'blueprintKeys'), false);
});

test('prompt help stays provider-free and does not promise mutations', () => {
  const result = resolvePrompt({ prompt: 'contoh prompt apa yang bisa dipakai', scopeKind: 'public' });
  assert.equal(result.handled, true);
  assert.equal(result.kind, 'help');
  assert.match(result.content, /rancang struktur server/i);
  assert.match(buildPromptHelp(), /menunggu review dan konfirmasi owner/i);
  assert.doesNotMatch(result.content, /[\u2013\u2014]/);
});

test('focus prompts become bounded owner actions', () => {
  assert.deepEqual(parseFocusPrompt('fokus belajar topik AI'), {
    action: 'start', mode: 'study', topic: 'AI',
  });
  assert.deepEqual(classifyPrompt('mulai scrim MLBB'), {
    kind: 'focus_action', prompt: 'mulai scrim MLBB', action: 'start', mode: 'scrim', topic: null,
  });
  assert.deepEqual(parseFocusPrompt('selesai fokus'), { action: 'off', mode: null });
  assert.deepEqual(parseFocusPrompt('status mode'), { action: 'status' });
  for (const prompt of [
    'jangan aktifkan mode belajar',
    'cara fokus belajar?',
    'aktifkan scrim besok jam 9',
  ]) assert.equal(classifyPrompt(prompt).kind, 'chat', prompt);
  assert.deepEqual(parseFocusPrompt('fokus belajar atau scrim'), { action: 'clarify' });
});

test('focus actions are home-owner only and mutate only the in-memory mode state', () => {
  const denied = resolvePrompt({
    prompt: 'fokus belajar',
    scopeKind: 'home',
    actor: actor(MEMBER),
    guild: guild(),
  });
  assert.equal(denied.kind, 'permission');

  const publicRoute = resolvePrompt({
    prompt: 'fokus belajar',
    scopeKind: 'public',
    actor: actor(OWNER),
    guild: guild(),
  });
  assert.equal(publicRoute.handled, false);

  const calls = [];
  const state = {
    mode: 'off',
    topic: null,
    setMode(mode, topic) { this.mode = mode; this.topic = topic || null; calls.push([mode, topic || null]); },
    getMode() { return this.mode; },
    getTopic() { return this.topic; },
    getDuration() { return 12; },
  };
  const allowed = resolvePrompt({ prompt: 'fokus belajar topik AI', scopeKind: 'home', actor: actor(OWNER), guild: guild() });
  assert.equal(allowed.kind, 'focus_action');
  assert.match(applyFocusAction({ route: allowed, state }), /BELAJAR aktif/);
  assert.deepEqual(calls, [['study', 'AI']]);
  assert.match(applyFocusAction({ route: { kind: 'focus_action', action: 'status' }, state }), /Topik: AI/);
  assert.match(applyFocusAction({ route: { kind: 'focus_action', action: 'off', mode: 'study' }, state }), /dimatikan/);
});

test('personal notes and reminders stay private and require the home owner path', () => {
  const allowed = resolvePrompt({
    prompt: 'catat daftar tugas',
    scopeKind: 'home',
    actor: actor(OWNER),
    guild: guild(),
    privateReply: true,
  });
  assert.equal(allowed.kind, 'personal_action');
  assert.equal(allowed.kind === 'personal_action', true);

  const mention = resolvePrompt({
    prompt: 'catat daftar tugas',
    scopeKind: 'home',
    actor: actor(OWNER),
    guild: guild(),
    privateReply: false,
  });
  assert.equal(mention.kind, 'permission');
  assert.match(mention.content, /tetap privat/i);

  const publicScope = resolvePrompt({
    prompt: 'ingatkan aku besok jam 7 pagi cek tugas',
    scopeKind: 'public',
    actor: actor(OWNER),
    guild: guild(),
    privateReply: true,
  });
  assert.equal(publicScope.kind, 'permission');
  assert.doesNotMatch(publicScope.content, /cek tugas/);
});
