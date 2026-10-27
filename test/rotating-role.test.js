'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rotateRole } = require('../src/utils/rotating-role');

function rig(roles = []) {
  const made = []; const log = [];
  const member = id => ({ id, roles: { async add(role) { log.push(['add', id, role.id]); }, async remove(role) { log.push(['remove', id, role.id]); } } });
  const guild = {
    roles: { async fetch() { return new Map(roles.map(role => [role.id, role])); },
      async create(options) { const role = { id: `new${made.length + 1}`, name: options.name, editable: true }; made.push(options); roles.push(role); return role; } },
    members: { async fetch(id) { if (id === 'gone') throw new Error('unknown member'); return member(id); } },
  };
  return { guild, made, log, member };
}

test('the role is made once, leaves holders who did not win again and goes to the winners', async () => {
  const { guild, made, log, member } = rig();
  const role = { name: 'Rajin Belajar', color: 0x2ECC71, reason: 'test' };
  assert.deepEqual(await rotateRole({ guild, ...role, previous: [], winners: [member('a')] }), { roleId: 'new1', holders: ['a'] });
  assert.deepEqual(made.map(o => [o.name, o.color, o.permissions, o.hoist, o.mentionable]), [['Rajin Belajar', 0x2ECC71, [], false, false]]);
  log.length = 0;
  assert.deepEqual(await rotateRole({ guild, ...role, previous: ['a', 'c', 'gone'], winners: [member('b'), member('a')] }),
    { roleId: 'new1', holders: ['b', 'a'] });
  assert.equal(made.length, 1); // found by name the second time
  assert.deepEqual(log, [['remove', 'c', 'new1'], ['add', 'b', 'new1'], ['add', 'a', 'new1']]);
});

test('a decorated name is the same role, and a role above Hengs is refused', async () => {
  const { guild, made } = rig([{ id: 'r1', name: '🏅 Rajin Belajar', editable: false }]);
  await assert.rejects(rotateRole({ guild, name: 'Rajin Belajar', color: 1, reason: 'test', previous: [], winners: [] }), /ROLE_ABOVE_HENGS/);
  assert.equal(made.length, 0);
});
