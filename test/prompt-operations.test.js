const assert = require('node:assert/strict');
const test = require('node:test');

const { parseOperationPrompt, buildOperationQuestions } = require('../src/prompt-operations');
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
