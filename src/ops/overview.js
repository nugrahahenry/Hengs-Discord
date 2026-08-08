const CONNECTION_STATES = new Set([
  'STARTING',
  'CONNECTED',
  'RECONNECTING',
  'DISCONNECTED',
  'DEGRADED',
  'INVALIDATED',
  'STOPPING',
  'STOPPED',
  'FAILED',
]);

const MODE_LABELS = {
  off: 'Nonaktif',
  study: 'Belajar',
  scrim: 'Scrim',
};

function count(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeVersion(value) {
  const normalized = String(value || '').trim();
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)
    ? normalized.slice(0, 32)
    : 'unknown';
}

function safeIssueCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{0,49}$/.test(normalized) ? normalized : null;
}

function safeRead(code, reader, fallback, unavailable) {
  try {
    return reader();
  } catch {
    unavailable.push(code);
    return fallback;
  }
}

function collectCommunityOverview({
  runtimeHealth,
  opsHub,
  eventHub,
  translation,
  focusState,
  version,
}) {
  const unavailable = [];
  const health = safeRead(
    'RUNTIME_UNAVAILABLE',
    () => runtimeHealth.snapshot(),
    {},
    unavailable,
  );
  const ops = safeRead(
    'OPS_UNAVAILABLE',
    () => opsHub.getStatus(),
    {},
    unavailable,
  );
  const events = safeRead(
    'EVENTS_UNAVAILABLE',
    () => eventHub.getStatus(),
    {},
    unavailable,
  );
  const queue = safeRead(
    'TRANSLATION_UNAVAILABLE',
    () => translation.getQueueStatus(),
    {},
    unavailable,
  );
  const focus = safeRead(
    'FOCUS_UNAVAILABLE',
    () => ({
      mode: focusState.getMode(),
      durationMinutes: focusState.getDuration(),
    }),
    {},
    unavailable,
  );

  const connection = CONNECTION_STATES.has(health?.connection?.status)
    ? health.connection.status
    : 'UNKNOWN';
  const mode = Object.hasOwn(MODE_LABELS, focus.mode) ? focus.mode : 'off';
  const duration = Number.isSafeInteger(focus.durationMinutes) && focus.durationMinutes >= 0
    ? focus.durationMinutes
    : null;

  return {
    runtime: {
      connection,
      online: connection === 'CONNECTED',
      version: safeVersion(health.version || version),
      uptimeSeconds: count(health.uptimeSeconds),
      lastIssue: safeIssueCode(health.lastIssue?.code),
    },
    ops: {
      pending: count(ops.pending),
      revising: count(ops.revising),
      scheduled: count(ops.scheduled),
      publishing: count(ops.publishing),
    },
    events: {
      draft: count(events.draft),
      publishing: count(events.publishing),
      published: count(events.published),
    },
    translation: {
      configured: queue.configured === true,
      running: queue.running === true,
      queued: count(queue.queued),
      depth: count(queue.depth),
      maxJobs: Math.max(1, count(queue.maxJobs)),
    },
    focus: {
      mode,
      label: MODE_LABELS[mode],
      durationMinutes: duration,
    },
    unavailable,
  };
}

function formatDuration(totalSeconds) {
  const seconds = count(totalSeconds);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}h ${hours}j`;
  if (hours > 0) return `${hours}j ${minutes}m`;
  return `${minutes}m`;
}

function formatCommunityOverview(data) {
  const healthy = data.runtime.online && data.unavailable.length === 0;
  const degraded = !data.runtime.online || data.unavailable.length > 0;
  const focusDuration = data.focus.durationMinutes === null
    ? ''
    : ` selama ${data.focus.durationMinutes} menit`;
  const translationState = data.translation.configured
    ? `Aktif ${data.translation.running ? '1' : '0'} | Menunggu ${data.translation.queued} | Kapasitas ${data.translation.depth}/${data.translation.maxJobs}`
    : 'Belum dikonfigurasi';
  const issue = data.runtime.lastIssue ? ` | Issue terakhir: ${data.runtime.lastIssue}` : '';
  const unavailable = data.unavailable.length
    ? `Data tidak tersedia: ${data.unavailable.join(', ')}`
    : 'Semua sumber status terbaca.';

  return {
    color: healthy ? 0x57F287 : degraded ? 0xFEE75C : 0x5865F2,
    title: 'Hengs Community Operations',
    description: healthy
      ? 'Sistem inti Hengs terbaca normal.'
      : 'Sebagian status membutuhkan perhatian. Tidak ada tindakan otomatis yang dijalankan.',
    fields: [
      {
        name: 'Runtime',
        value: `${data.runtime.connection} | v${data.runtime.version} | Uptime ${formatDuration(data.runtime.uptimeSeconds)}${issue}`,
        inline: false,
      },
      {
        name: 'Ops Hub',
        value: `Review ${data.ops.pending} | Revisi ${data.ops.revising} | Terjadwal ${data.ops.scheduled} | Publish ${data.ops.publishing}`,
        inline: false,
      },
      {
        name: 'Event Hub',
        value: `Draft ${data.events.draft} | Publish ${data.events.publishing} | Aktif ${data.events.published}`,
        inline: false,
      },
      {
        name: 'Penerjemah',
        value: translationState,
        inline: false,
      },
      {
        name: 'Mode Fokus',
        value: `${data.focus.label}${focusDuration}`,
        inline: false,
      },
    ],
    footer: unavailable,
  };
}

module.exports = {
  collectCommunityOverview,
  formatCommunityOverview,
  formatDuration,
};
