const REPORT_CATEGORIES = Object.freeze([
  { name: 'Pelecehan / serangan pribadi', value: 'harassment' },
  { name: 'Spam / scam', value: 'spam_scam' },
  { name: 'Konten tidak pantas', value: 'inappropriate' },
  { name: 'Pelanggaran aturan', value: 'rule_violation' },
  { name: 'Masalah teknis server', value: 'technical' },
  { name: 'Lainnya', value: 'other' },
]);

const CATEGORY_VALUES = new Set(REPORT_CATEGORIES.map(item => item.value));
const DISCORD_ID = /^\d{15,22}$/;
const DISCORD_MESSAGE_HOSTS = new Set([
  'discord.com',
  'www.discord.com',
  'canary.discord.com',
  'ptb.discord.com',
]);

class ReportValidationError extends Error {
  constructor(code, userMessage) {
    super(userMessage);
    this.name = 'ReportValidationError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

function positiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function requireDiscordId(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!DISCORD_ID.test(normalized)) {
    throw new ReportValidationError('INVALID_ID', `${fieldName} Discord tidak valid.`);
  }
  return normalized;
}

function normalizeDiscordMessageLink(rawUrl, guildId) {
  if (rawUrl === null || rawUrl === undefined || String(rawUrl).trim() === '') return null;
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    throw new ReportValidationError('INVALID_MESSAGE_LINK', 'Link pesan Discord tidak valid.');
  }
  const host = url.hostname.toLowerCase();
  const match = url.pathname.match(/^\/channels\/(\d{15,22})\/(\d{15,22})\/(\d{15,22})\/?$/);
  if (
    url.protocol !== 'https:'
    || !DISCORD_MESSAGE_HOSTS.has(host)
    || url.username
    || url.password
    || url.search
    || url.hash
    || !match
  ) {
    throw new ReportValidationError('INVALID_MESSAGE_LINK', 'Link pesan Discord tidak valid.');
  }
  const expectedGuildId = requireDiscordId(guildId, 'Server');
  if (match[1] !== expectedGuildId) {
    throw new ReportValidationError(
      'MESSAGE_LINK_WRONG_GUILD',
      'Link pesan harus berasal dari server ini.',
    );
  }
  return `https://discord.com/channels/${match[1]}/${match[2]}/${match[3]}`;
}

function normalizeReportInput(input, context = {}) {
  const category = String(input?.category || '').trim();
  if (!CATEGORY_VALUES.has(category)) {
    throw new ReportValidationError('INVALID_CATEGORY', 'Kategori laporan tidak valid.');
  }
  const details = String(input?.details || '').trim();
  if (details.length < 20 || details.length > 1500) {
    throw new ReportValidationError(
      'INVALID_DETAILS',
      'Detail laporan harus berisi 20-1.500 karakter.',
    );
  }
  const guildId = requireDiscordId(context.guildId || input.guildId, 'Server');
  const reporterId = requireDiscordId(input.reporterId, 'Pelapor');
  const targetUserId = input.targetUserId
    ? requireDiscordId(input.targetUserId, 'Member tujuan')
    : null;
  const interactionId = requireDiscordId(input.interactionId, 'Interaction');
  return {
    category,
    details,
    reporterId,
    targetUserId,
    messageLink: normalizeDiscordMessageLink(input.messageLink, guildId),
    anonymous: input.anonymous === true,
    guildId,
    externalId: `discord:${interactionId}`,
  };
}

module.exports = {
  REPORT_CATEGORIES,
  ReportValidationError,
  normalizeDiscordMessageLink,
  normalizeReportInput,
  positiveInteger,
};
