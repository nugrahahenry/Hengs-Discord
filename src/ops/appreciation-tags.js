'use strict';

const { createHash } = require('node:crypto');
const { readAppreciationDraft } = require('./appreciation');
const validId = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const validIds = ids => Array.isArray(ids) && ids.length <= 8 && new Set(ids).size === ids.length && ids.every(validId);
const contentHash = draft => createHash('sha256').update(JSON.stringify([draft.title, draft.body, draft.lastRevisedAt || ''])).digest('hex');

function selectedTags(draft) {
  const tags = draft.appreciationTags;
  if (!tags) return [];
  if (tags.version !== 1 || !validIds(tags.memberIds) || !validId(tags.selectedBy)
    || !/^[a-f0-9]{64}$/.test(tags.contentHash)) throw new Error('APPRECIATION_TAGS_INVALID');
  // A factual edit requires a new explicit choice, never a guess based on roster names.
  return tags.contentHash === contentHash(draft) && readAppreciationDraft(draft) ? tags.memberIds : [];
}

async function validateMembers(guild, ids) {
  if (!validIds(ids)) throw new Error('APPRECIATION_TAGS_INVALID');
  for (const id of ids) {
    let member;
    try { member = await guild.members.fetch({ user: id, force: true }); }
    catch { throw new Error('APPRECIATION_MEMBER_UNAVAILABLE'); }
    if (!member || member.id !== id || member.guild?.id !== guild.id || member.user?.bot !== false) {
      throw new Error('APPRECIATION_MEMBER_UNAVAILABLE');
    }
  }
  return [...ids];
}

module.exports = { validIds, contentHash, selectedTags, validateMembers };
