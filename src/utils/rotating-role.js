'use strict';

// A role that moves to the newest winners (Analis Jitu for Liga Tebak, Rajin Belajar for the study board): found by name
// (decorations ignored) or created once with no permissions, taken from previous holders who did not win again, given
// to the winners. Throws when the role sits above Hengs; callers report it and store the returned holders.
const { slugOf } = require('../guilds/channel-style');

async function rotateRole({ guild, name, color, reason, previous = [], winners }) {
  const roles = await guild.roles.fetch();
  const role = [...roles.values()].find(r => slugOf(r.name) === slugOf(name))
    || await guild.roles.create({ name, color, permissions: [], hoist: false, mentionable: false, reason });
  if (!role.editable) throw new Error('ROLE_ABOVE_HENGS');
  const keep = new Set(winners.map(member => member.id));
  for (const id of previous.filter(id => !keep.has(id))) {
    try { await (await guild.members.fetch(id)).roles.remove(role, reason); } catch { /* left or already removed */ }
  }
  for (const member of winners) await member.roles.add(role, reason);
  return { roleId: role.id, holders: [...keep] };
}

module.exports = { rotateRole };
