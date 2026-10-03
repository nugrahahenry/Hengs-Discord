const assert = require('node:assert/strict');
const test = require('node:test');

const { formatOperationStatus, parseOperationPrompt, buildOperationQuestions } = require('../src/prompt-operations');
const { resolvePrompt } = require('../src/prompt-assistant');

const OWNER = '323456789012345678';
const OTHER = '423456789012345678';
const GUILD = { ownerId: OWNER };

function actor(id = OWNER) {
  return {
    user: { id },
    memberPermissions: { has: () => false },
    member: { roles: { cache: new Map() } },
  };
}

test('natural announcement prompt becomes an Ops draft brief without a provider call', () => {
  const route = parseOperationPrompt('Buat pengumuman maintenance server malam ini');
  assert.deepEqual(route, {
    kind: 'ops_draft',
    operation: 'announcement',
    brief: 'maintenance server malam ini',
    titleOverride: null,
  });
});

test('natural project prompt becomes a private project draft brief', () => {
  assert.deepEqual(
    parseOperationPrompt('Buat tugas proyek landing page: rapikan hero dan cek mobile'),
    {
      kind: 'project_draft',
      operation: 'project',
      brief: 'landing page: rapikan hero dan cek mobile',
      titleOverride: null,
    },
  );
});

test('incomplete project prompt asks for bounded details', () => {
  assert.deepEqual(
    parseOperationPrompt('Buat tugas proyek'),
    { kind: 'operation_questions', operation: 'project' },
  );
  assert.match(buildOperationQuestions('project'), /deadline/i);
  assert.doesNotMatch(buildOperationQuestions('project'), /[–—]/);
});

test('natural event prompt extracts title and explicit WIB time', () => {
  const route = parseOperationPrompt('Buat event mabar jam 20:00');
  assert.equal(route.kind, 'event_draft');
  assert.equal(route.title, 'mabar');
  assert.equal(route.scheduleInput, '20:00');
  assert.equal(route.description, 'Pengingat untuk mabar.');
});

test('event prompt without an explicit time asks for bounded clarification', () => {
  const route = parseOperationPrompt('Buat event tournament');
  assert.deepEqual(route, { kind: 'operation_questions', operation: 'event' });
  assert.match(buildOperationQuestions('event'), /HH:mm/);
  assert.match(buildOperationQuestions('event'), /bot-settings/);
});

test('relative time stays un scheduled instead of guessing a date', () => {
  assert.deepEqual(
    parseOperationPrompt('Buat event tournament besok jam 20:00'),
    { kind: 'operation_questions', operation: 'event' },
  );
});

test('ordinary community prompts do not enter the operation adapter', () => {
  assert.equal(parseOperationPrompt('Buatkan struktur server gaming'), null);
  assert.equal(parseOperationPrompt('Tolong jelaskan cara membuat reminder'), null);
});

test('natural operation status stays read-only and exposes only bounded counts', () => {
  assert.deepEqual(parseOperationPrompt('cek draft dan event'), {
    kind: 'operation_status', operation: 'status',
  });
  const content = formatOperationStatus({
    opsHub: { getStatus: () => ({ pending: 2, scheduled: 1, published: 5 }) },
    eventHub: { getStatus: () => ({ draft: 3, upcoming: [{}, {}], closed: 4 }) },
  });
  assert.match(content, /2 draft menunggu/);
  assert.match(content, /3 draft, 2 event aktif/);
  assert.doesNotMatch(content, /[\u2013\u2014]/);
});

test('home owner receives an event draft route while another member is denied', () => {
  const previous = process.env.OWNER_ID;
  process.env.OWNER_ID = OWNER;
  try {
    const owner = resolvePrompt({
      prompt: 'Buat event mabar jam 20:00',
      scopeKind: 'home',
      actor: actor(OWNER),
      guild: GUILD,
    });
    assert.equal(owner.handled, true);
    assert.equal(owner.kind, 'event_draft');

    const denied = resolvePrompt({
      prompt: 'Buat event mabar jam 20:00',
      scopeKind: 'home',
      actor: actor(OTHER),
      guild: GUILD,
    });
    assert.equal(denied.handled, true);
    assert.equal(denied.kind, 'permission');
    assert.match(denied.content, /owner atau editor Ops Hub/i);
  } finally {
    if (previous === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previous;
  }
});

test('operation status is home-owner only and never creates a draft', () => {
  const previous = process.env.OWNER_ID;
  process.env.OWNER_ID = OWNER;
  try {
    const owner = resolvePrompt({
      prompt: 'lihat status draft',
      scopeKind: 'home',
      actor: actor(OWNER),
      guild: GUILD,
    });
    assert.equal(owner.kind, 'operation_status');
    assert.equal(owner.operation, 'status');

    const denied = resolvePrompt({
      prompt: 'lihat status event',
      scopeKind: 'home',
      actor: actor(OTHER),
      guild: GUILD,
    });
    assert.equal(denied.kind, 'permission');
  } finally {
    if (previous === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previous;
  }
});
