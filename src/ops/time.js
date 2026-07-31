const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const MIN_SCHEDULE_AHEAD_MS = 60 * 1000;
const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validateParts(year, month, day, hour, minute) {
  return Number.isInteger(year)
    && year >= 2020
    && year <= 9999
    && Number.isInteger(month)
    && month >= 1
    && month <= 12
    && Number.isInteger(day)
    && day >= 1
    && day <= daysInMonth(year, month)
    && Number.isInteger(hour)
    && hour >= 0
    && hour <= 23
    && Number.isInteger(minute)
    && minute >= 0
    && minute <= 59;
}

function wibPartsToUtcMs(year, month, day, hour, minute) {
  if (!validateParts(year, month, day, hour, minute)) return NaN;
  return Date.UTC(year, month - 1, day, hour, minute) - WIB_OFFSET_MS;
}

function formatWib(isoOrMs) {
  const date = new Date(isoOrMs);
  if (!Number.isFinite(date.getTime())) return 'Waktu tidak valid';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

function parseScheduleInput(input, nowMs = Date.now()) {
  const normalized = String(input || '').trim();
  let candidateMs;
  let rolledToTomorrow = false;

  const full = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (full) {
    candidateMs = wibPartsToUtcMs(...full.slice(1).map(Number));
  } else {
    const timeOnly = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeOnly) {
      throw new Error('Format waktu harus `HH:mm` atau `YYYY-MM-DD HH:mm` dalam WIB.');
    }
    const nowWib = new Date(nowMs + WIB_OFFSET_MS);
    const year = nowWib.getUTCFullYear();
    const month = nowWib.getUTCMonth() + 1;
    const day = nowWib.getUTCDate();
    candidateMs = wibPartsToUtcMs(
      year,
      month,
      day,
      Number(timeOnly[1]),
      Number(timeOnly[2]),
    );
    if (Number.isFinite(candidateMs) && candidateMs <= nowMs) {
      candidateMs += 24 * 60 * 60 * 1000;
      rolledToTomorrow = true;
    }
  }

  if (!Number.isFinite(candidateMs)) {
    throw new Error('Tanggal atau jam WIB tidak valid.');
  }
  if (candidateMs < nowMs + MIN_SCHEDULE_AHEAD_MS) {
    throw new Error('Jadwal harus minimal 1 menit dari sekarang.');
  }
  if (candidateMs > nowMs + MAX_SCHEDULE_AHEAD_MS) {
    throw new Error('Jadwal maksimal 1 tahun dari sekarang.');
  }

  return {
    scheduledAt: new Date(candidateMs).toISOString(),
    label: formatWib(candidateMs),
    rolledToTomorrow,
  };
}

module.exports = {
  formatWib,
  parseScheduleInput,
  wibPartsToUtcMs,
};
