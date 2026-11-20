'use strict';

const GRACE_MS = 10 * 60 * 1000;
const MAX_PAGES = 10;

// Missing from one page is not proof that a send failed. Walk back to before
// the claim, with a hard bound, and keep the claim locked on incomplete evidence.
async function inspectPublishHistory(channel, draft, botId, now = Date.now()) {
  const startedAt = Date.parse(draft.actionStartedAt || '');
  const stale = Number.isFinite(startedAt) && now - startedAt >= GRACE_MS;
  let before;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let messages;
    try {
      messages = [...(await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) })).values()];
    } catch {
      return { status: 'review' };
    }
    const sent = messages.find(message => message.author?.id === botId
      && message.embeds?.some(embed => embed.footer?.text?.endsWith(`Draft ID: ${draft.id}`)));
    if (sent) return { status: 'published', messageId: sent.id };
    if (!stale) return { status: 'review' };
    if (!messages.length) return { status: 'absent' };
    if (messages.some(message => !Number.isFinite(message.createdTimestamp))) return { status: 'review' };
    const oldest = messages.reduce((a, b) => a.createdTimestamp < b.createdTimestamp ? a : b);
    // Allow a minute of host clock skew before considering the claim covered.
    if (oldest.createdTimestamp <= startedAt - 60_000) return { status: 'absent' };
    if (!oldest.id || oldest.id === before) return { status: 'review' };
    before = oldest.id;
  }
  return { status: 'review' };
}

module.exports = { inspectPublishHistory };
