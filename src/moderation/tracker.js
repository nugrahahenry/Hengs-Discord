const crypto = require('node:crypto');

const { domainDecision, domainMatches, normalizeDomain } = require('./policy');

const HISTORY_MS = 120_000;
const CROSS_CHANNEL_WINDOW_MS = 60_000;
const SINGLE_CHANNEL_WINDOW_MS = 30_000;
const MAX_MEMBER_OBSERVATIONS = 100;
const MAX_GUILD_OBSERVATIONS = 2_000;
const MAX_NORMALIZED_INPUT = 8_192;
const TRIGGER_PRIORITY = Object.freeze([
  'BLOCKED_DOMAIN',
  'CROSS_CHANNEL_ATTACHMENT_FLOOD',
  'CROSS_CHANNEL_REPEAT',
  'SINGLE_CHANNEL_BURST',
]);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    .replace(/<(?:@!?\d+|@&\d+|#\d+)>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, MAX_NORMALIZED_INPUT);
}

function normalizeUrlToken(value) {
  const token = String(value || '').replace(/[),.!?;:]+$/, '');
  try {
    const url = new URL(token);
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = normalizeDomain(url.hostname);
    if (!host) return null;
    const trusted = !url.username && !url.password && !url.port;
    const port = url.port ? `:${url.port}` : '';
    const path = `${url.pathname || '/'}${url.search || ''}`.toLowerCase();
    return { host, trusted, canonical: `${host}${port}${path}`.slice(0, MAX_NORMALIZED_INPUT) };
  } catch {
    return null;
  }
}

function unsafeDomainDecision(url, input) {
  if (url.trusted) return domainDecision(url.host, input);
  const blocked = input.blockedDomains instanceof Set
    ? [...input.blockedDomains]
    : Array.isArray(input.blockedDomains) ? input.blockedDomains : [];
  return blocked.some(rule => domainMatches(url.host, rule)) ? 'blocked' : 'neutral';
}

function extractUrls(content) {
  const matches = String(content || '').match(/https?:\/\/[^\s<>()]+/gi) || [];
  const urls = [];
  for (const match of matches) {
    const normalized = normalizeUrlToken(match);
    if (normalized) urls.push(normalized);
  }
  return urls;
}

function attachmentFamily(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('application/')) return 'application';
  return 'other';
}

function distinct(values) {
  return [...new Set(values)];
}

function sortByAge(observations) {
  return observations.sort((left, right) => (
    left.timestampMs - right.timestampMs || left.sequence - right.sequence
  ));
}

function createTracker(options = {}) {
  const hmacKey = Buffer.isBuffer(options.hmacKey) && options.hmacKey.length
    ? Buffer.from(options.hmacKey)
    : crypto.randomBytes(32);
  const guilds = new Map();
  let sequence = 0;

  function sign(value) {
    return crypto.createHmac('sha256', hmacKey).update(value).digest('hex');
  }

  function guildFor(guildId) {
    const key = String(guildId || '');
    let guild = guilds.get(key);
    if (!guild) {
      guild = { observations: [] };
      guilds.set(key, guild);
    }
    return guild;
  }

  function removeExpired(guild, now) {
    const cutoff = now - HISTORY_MS;
    guild.observations = guild.observations.filter(observation => observation.timestampMs >= cutoff);
  }

  function enforceLimits(guild, memberId) {
    const memberObservations = sortByAge(guild.observations.filter(item => item.memberId === memberId));
    const excessMemberObservations = memberObservations.slice(0, Math.max(0, memberObservations.length - MAX_MEMBER_OBSERVATIONS));
    if (excessMemberObservations.length) {
      const expired = new Set(excessMemberObservations);
      guild.observations = guild.observations.filter(item => !expired.has(item));
    }

    sortByAge(guild.observations);
    if (guild.observations.length > MAX_GUILD_OBSERVATIONS) {
      guild.observations.splice(0, guild.observations.length - MAX_GUILD_OBSERVATIONS);
    }
  }

  function observationsInWindow(guild, memberId, now, windowMs, predicate = () => true) {
    const cutoff = now - windowMs;
    return guild.observations.filter(item => (
      item.memberId === memberId
      && item.timestampMs >= cutoff
      && item.timestampMs <= now
      && predicate(item)
    ));
  }

  function resultFor(record, matched = false, trigger = null, evidence = [], signature = null) {
    const messageIds = evidence.map(item => item.messageId).filter(Boolean);
    return {
      matched,
      trigger,
      memberId: record.memberId,
      guildId: record.guildId,
      messageIds,
      messageCount: evidence.length,
      channelCount: new Set(evidence.map(item => item.channelId)).size,
      signature,
    };
  }

  function hasEmitted(evidence, trigger) {
    return evidence.some(item => [...item.emitted].some(value => value.startsWith(`${trigger}:`)));
  }

  function hasEmittedSignature(evidence, trigger, signature) {
    return evidence.some(item => item.emitted.has(`${trigger}:${signature}`));
  }

  function markEmitted(record, trigger, signature) {
    record.emitted.add(`${trigger}:${signature}`);
  }

  function selectDistinctChannelEvidence(observations) {
    const byChannel = new Map();
    for (const observation of sortByAge([...observations])) {
      if (!byChannel.has(observation.channelId)) byChannel.set(observation.channelId, observation);
    }
    return [...byChannel.values()];
  }

  function observe(input = {}) {
    const timestampMs = Number.isFinite(input.timestampMs) ? input.timestampMs : Date.now();
    const guildId = String(input.guildId || '');
    const memberId = String(input.memberId || '');
    const channelId = String(input.channelId || '');
    const messageId = String(input.messageId || '');
    const content = normalizeText(input.content);
    const urls = extractUrls(content);
    const attachments = Array.isArray(input.attachments) ? input.attachments : [];
    const attachmentFamilies = distinct(attachments.map(attachment => attachmentFamily(attachment?.contentType)));
    const decisions = urls.map(url => ({ ...url, decision: unsafeDomainDecision(url, input) }));
    const contentSignature = content ? sign(`content:${content}`) : null;
    const urlSignatures = distinct(decisions.map(url => sign(`url:${url.canonical}`)));
    const domainSignatures = distinct(decisions
      .filter(url => url.decision !== 'allowed')
      .map(url => sign(`domain:${url.host}`)));
    const attachmentSignatures = attachmentFamilies.map(family => sign(`attachment:${family}`));
    const signatures = distinct([
      contentSignature,
      ...urlSignatures,
      ...domainSignatures,
      ...attachmentSignatures,
    ].filter(Boolean));
    const primarySignature = contentSignature || urlSignatures[0] || attachmentSignatures[0] || null;
    const record = {
      guildId,
      memberId,
      channelId,
      messageId,
      timestampMs,
      sequence: sequence += 1,
      hasAttachment: attachments.length > 0,
      hasLink: urls.length > 0,
      signatures,
      repeatSignatures: distinct([contentSignature, ...urlSignatures, ...attachmentSignatures].filter(Boolean)),
      burstSignatures: distinct([contentSignature, ...domainSignatures, ...attachmentSignatures].filter(Boolean)),
      blockedSignatures: distinct(decisions
        .filter(url => url.decision === 'blocked')
        .map(url => sign(`domain:${url.host}`))),
      emitted: new Set(),
    };
    const guild = guildFor(guildId);

    removeExpired(guild, timestampMs);
    guild.observations.push(record);
    enforceLimits(guild, memberId);

    for (const signature of record.blockedSignatures) {
      const evidence = observationsInWindow(
        guild,
        memberId,
        timestampMs,
        HISTORY_MS,
        item => item.blockedSignatures.includes(signature),
      );
      if (!hasEmittedSignature(evidence, 'BLOCKED_DOMAIN', signature)) {
        markEmitted(record, 'BLOCKED_DOMAIN', signature);
        return resultFor(record, true, 'BLOCKED_DOMAIN', [record], signature);
      }
    }

    if (record.hasAttachment) {
      const attachmentsInWindow = observationsInWindow(
        guild,
        memberId,
        timestampMs,
        CROSS_CHANNEL_WINDOW_MS,
        item => item.hasAttachment,
      );
      const evidence = selectDistinctChannelEvidence(attachmentsInWindow);
      const signature = sign('attachment-flood');
      if (evidence.length >= 3 && !hasEmitted(attachmentsInWindow, 'CROSS_CHANNEL_ATTACHMENT_FLOOD', signature)) {
        markEmitted(record, 'CROSS_CHANNEL_ATTACHMENT_FLOOD', signature);
        return resultFor(record, true, 'CROSS_CHANNEL_ATTACHMENT_FLOOD', attachmentsInWindow, signature);
      }
    }

    for (const signature of record.repeatSignatures) {
      const observations = observationsInWindow(
        guild,
        memberId,
        timestampMs,
        CROSS_CHANNEL_WINDOW_MS,
        item => item.repeatSignatures.includes(signature),
      );
      const evidence = selectDistinctChannelEvidence(observations);
      if (evidence.length >= 3 && !hasEmitted(observations, 'CROSS_CHANNEL_REPEAT', signature)) {
        markEmitted(record, 'CROSS_CHANNEL_REPEAT', signature);
        return resultFor(record, true, 'CROSS_CHANNEL_REPEAT', observations, signature);
      }
    }

    if (record.hasLink || record.hasAttachment) {
      for (const signature of record.burstSignatures) {
        const evidence = observationsInWindow(
          guild,
          memberId,
          timestampMs,
          SINGLE_CHANNEL_WINDOW_MS,
          item => item.channelId === channelId
            && (item.hasLink || item.hasAttachment)
            && item.burstSignatures.includes(signature),
        );
        if (evidence.length >= 5 && !hasEmitted(evidence, 'SINGLE_CHANNEL_BURST', signature)) {
          markEmitted(record, 'SINGLE_CHANNEL_BURST', signature);
          return resultFor(record, true, 'SINGLE_CHANNEL_BURST', evidence, signature);
        }
      }
    }

    return resultFor(record, false, null, [], primarySignature);
  }

  function clearMember(guildId, memberId) {
    const key = String(guildId || '');
    const guild = guilds.get(key);
    if (!guild) return;
    guild.observations = guild.observations.filter(item => item.memberId !== String(memberId || ''));
    if (!guild.observations.length) guilds.delete(key);
  }

  function snapshot() {
    let members = 0;
    let observations = 0;
    for (const guild of guilds.values()) {
      observations += guild.observations.length;
      members += new Set(guild.observations.map(item => item.memberId)).size;
    }
    return { guilds: guilds.size, members, observations };
  }

  return { observe, clearMember, snapshot };
}

module.exports = {
  createTracker,
  HISTORY_MS,
  CROSS_CHANNEL_WINDOW_MS,
  SINGLE_CHANNEL_WINDOW_MS,
  MAX_MEMBER_OBSERVATIONS,
  MAX_GUILD_OBSERVATIONS,
  TRIGGER_PRIORITY,
};
