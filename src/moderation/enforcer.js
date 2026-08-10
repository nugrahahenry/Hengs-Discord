const { assessPrerequisites, isMessageExempt } = require('./policy');

const DELETE_MESSAGE_SECONDS = 120;
const MAX_TRACKED_MESSAGE_DELETIONS = 25;
const INCIDENT_ID = /^[a-f0-9]{16}$/;

function result(status, banSucceeded, deletionSucceeded, deletedCount, issueCode) {
  return { status, banSucceeded, deletionSucceeded, deletedCount, issueCode };
}

function monitor(issueCode = null) {
  return result('monitor', false, false, 0, issueCode);
}

function incidentId(incident) {
  const value = String(incident?.id || '');
  return INCIDENT_ID.test(value) ? value : '0000000000000000';
}

function configuredMode(context) {
  return context.configuredMode ?? context.mode ?? context.staticPolicy?.initialMode ?? 'active';
}

function currentMessage(context, guild, targetMember) {
  const message = context.message || {};
  const memberId = String(context.incident?.memberId || targetMember?.id || '');
  return {
    ...message,
    guild,
    guildId: guild?.id,
    member: targetMember,
    author: message.author || targetMember?.user || { id: memberId, bot: false },
  };
}

function actionPrerequisites(context, guild, targetMember, botMember) {
  return assessPrerequisites({
    configuredMode: configuredMode(context),
    staticPolicy: context.staticPolicy,
    modLogChannel: context.modLogChannel,
    modLogPublic: context.modLogPublic,
    guild,
    everyoneRole: context.everyoneRole,
    botMember,
    botPermissions: botMember?.permissions,
    targetMember,
  });
}

async function isAlreadyBanned(guild, memberId) {
  if (typeof guild?.bans?.fetch !== 'function') return false;
  try {
    await guild.bans.fetch(memberId);
    return true;
  } catch {
    return false;
  }
}

function trackedMessages(messages) {
  const selected = [];
  const seenObjects = new Set();
  const seenIds = new Set();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message.delete !== 'function' || seenObjects.has(message)) continue;
    const id = message.id == null ? null : String(message.id);
    if (id && seenIds.has(id)) continue;
    seenObjects.add(message);
    if (id) seenIds.add(id);
    selected.push(message);
    if (selected.length === MAX_TRACKED_MESSAGE_DELETIONS) break;
  }
  return selected;
}

async function deleteTrackedMessages(messages) {
  const targets = trackedMessages(messages);
  let deletedCount = 0;
  let deletionSucceeded = targets.length > 0;
  for (const message of targets) {
    try {
      await message.delete();
      deletedCount += 1;
    } catch {
      deletionSucceeded = false;
    }
  }
  return { deletionSucceeded, deletedCount, attemptedCount: targets.length };
}

async function enforceIncident(context = {}) {
  const incident = context.incident || {};
  const guild = context.guild || context.message?.guild;
  const staticPolicy = context.staticPolicy || {};
  const persistedPolicy = context.persistedPolicy || {};
  const initialMessage = context.message || {};

  if (isMessageExempt(initialMessage, staticPolicy, persistedPolicy).exempt) {
    return monitor('PREREQUISITES_CHANGED');
  }

  const requestedMode = String(configuredMode(context)).trim().toLowerCase();
  if (requestedMode === 'monitor' || requestedMode === 'off') return monitor();
  if (!guild?.members || typeof guild.members.fetch !== 'function' || typeof guild.members.fetchMe !== 'function') {
    return monitor('PREREQUISITES_CHANGED');
  }

  let targetMember;
  try {
    targetMember = await guild.members.fetch(String(incident.memberId || ''));
  } catch {
    return (await isAlreadyBanned(guild, String(incident.memberId || '')))
      ? result('banned', true, true, 0, null)
      : result('failed', false, false, 0, 'NOT_BANNED');
  }

  let botMember;
  try {
    botMember = await guild.members.fetchMe();
  } catch {
    return monitor('PREREQUISITES_CHANGED');
  }

  if (isMessageExempt(currentMessage(context, guild, targetMember), staticPolicy, persistedPolicy).exempt) {
    return monitor('PREREQUISITES_CHANGED');
  }

  const prerequisites = actionPrerequisites(context, guild, targetMember, botMember);
  if (prerequisites.effectiveMode !== 'active') {
    return monitor(prerequisites.issues[0] || null);
  }

  try {
    await guild.members.ban(targetMember.id, {
      deleteMessageSeconds: DELETE_MESSAGE_SECONDS,
      reason: `Hengs Anti-Raid incident ${incidentId(incident)}`,
    });
    return result('banned', true, true, 0, null);
  } catch {
    if (await isAlreadyBanned(guild, targetMember.id)) {
      return result('banned', true, true, 0, null);
    }
    const deletion = await deleteTrackedMessages(context.trackedMessages);
    if (deletion.deletionSucceeded) {
      return result('partial', false, true, deletion.deletedCount, 'BAN_FAILED');
    }
    return result(
      'failed',
      false,
      false,
      deletion.deletedCount,
      deletion.attemptedCount > 0 ? 'BAN_AND_DELETE_FAILED' : 'BAN_FAILED',
    );
  }
}

module.exports = {
  enforceIncident,
};
