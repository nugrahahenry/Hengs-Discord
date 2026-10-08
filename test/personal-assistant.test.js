const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createPersonalAssistant,
  isRawNoteRequest,
  normalizeClock,
  parsePersonalPrompt,
  toScheduleInput,
} = require('../src/personal-assistant');

const GUILD = '223456789012345678';
const USER = '323456789012345678';

function fakeStore() {
  const notes = [];
  const reminders = [];
  return {
    notes,
    reminders,
    scopeKey: (guildId, userId) => `${guildId}:${userId}`,
    addNote({ text }) {
      const item = { id: `note-${String(notes.length + 1).padStart(4, '0')}`, text, createdAt: new Date().toISOString() };
      notes.unshift(item);
      return { ok: true, item };
    },
    listNotes: () => notes.slice(),
    removeNote: () => ({ ok: true }),
    addReminder({ text, dueAt }) {
      const item = { id: `reminder-${String(reminders.length + 1).padStart(4, '0')}`, text, dueAt };
      reminders.push(item);
      return { ok: true, item };
    },
    listReminders: () => reminders.slice(),
    removeReminder: () => ({ ok: true }),
    recoverStaleSending: () => false,
    claimDue: () => null,
    completeReminder: () => true,
    releaseReminder: () => true,
  };
}

function scope() {
  return { guildId: GUILD, userId: USER };
}

test('personal parser keeps note and reminder intents deterministic', () => {
  assert.deepEqual(parsePersonalPrompt('catat beli kabel'), { kind: 'note_add', text: 'beli kabel' });
  assert.deepEqual(parsePersonalPrompt('catat'), { kind: 'note_add_missing_text' });
  assert.deepEqual(parsePersonalPrompt('ingatkan aku bayar listrik'), {
    kind: 'reminder_add_missing_time', text: 'bayar listrik',
  });
  assert.deepEqual(parsePersonalPrompt('ingatkan aku besok jam 7 pagi cek tugas'), {
    kind: 'reminder_add', timeText: 'besok 07:00', text: 'cek tugas',
  });
  assert.deepEqual(parsePersonalPrompt('lihat catatan'), { kind: 'note_list' });
  assert.deepEqual(parsePersonalPrompt('hapus pengingat reminder-0001'), { kind: 'reminder_delete', id: 'reminder-0001' });
  assert.equal(parsePersonalPrompt('buat pengingat event mabar jam 20:00'), null);
  assert.equal(normalizeClock('jam 9 malam'), '21:00');
  assert.match(toScheduleInput('besok 07:00'), /^\d{4}-\d{2}-\d{2} 07:00$/);
  assert.equal(isRawNoteRequest('jangan catat kayak gitu, khusus kali ini catat apa yang aku ketik'), true);
});

test('personal assistant confirms notes and asks for missing reminder time', async () => {
  const store = fakeStore();
  const assistant = createPersonalAssistant({ store });

  const preview = await assistant.handle('catat bayar listrik besok', scope());
  assert.match(preview.reply, /oke catat/i);
  assert.equal(store.notes.length, 0);

  const saved = await assistant.handle('oke aku catat seperti itu', scope());
  assert.match(saved.reply, /note-0001/);
  assert.equal(store.notes[0].text, 'bayar listrik besok');

  const reminderPrompt = await assistant.handle('ingatkan aku bayar listrik', scope());
  assert.match(reminderPrompt.reply, /bayar listrik/);
  assert.equal(store.reminders.length, 0);
  const reminder = await assistant.handle('besok jam 7 pagi', scope());
  assert.match(reminder.reply, /bayar listrik/);
  assert.equal(store.reminders.length, 1);
});

test('discussions, quoted commands and negations never become personal write actions', () => {
  for (const text of ['kalau hapus catatan note-0001 gimana?', 'jangan hapus pengingat reminder-0001',
    'teman bilang catat beli kabel', '"ingatkan aku jam 9 malam makan"',
    'bisa jelaskan cara catat?', 'aku belum mau simpan catatan']) {
    assert.equal(parsePersonalPrompt(text), null, text);
  }
  assert.equal(parsePersonalPrompt('catat jangan lupa beli kabel').kind, 'note_add');
  assert.equal(parsePersonalPrompt('hapus catatan note-0001 kalau aku selesai'), null);
  assert.deepEqual(parsePersonalPrompt('gw mau catat beli kabel'), { kind: 'note_add', text: 'beli kabel' });
  assert.deepEqual(parsePersonalPrompt('tolong ingetin aku jam 9 malam bayar listrik'), {
    kind: 'reminder_add', timeText: '21:00', text: 'bayar listrik',
  });
});

test('pending continuations cannot cross users, survive a topic change, expiry or reset', async t => {
  let time = Date.now();
  t.mock.method(Date, 'now', () => time);
  const store = fakeStore();
  const assistant = createPersonalAssistant({ store });
  await assistant.handle('ingatkan aku bayar listrik', scope());
  assert.equal(assistant.canContinue('jam 9 malam', { guildId: GUILD, userId: '423456789012345678' }), false);
  assert.equal(assistant.canContinue('kenapa database lambat?', scope()), false);
  assert.equal(assistant.canContinue('jam 9 malam', scope()), false);
  await assistant.handle('ingatkan aku bayar listrik', scope());
  time += 5 * 60 * 1000 + 1;
  assert.equal(assistant.canContinue('jam 9 malam', scope()), false);
  await assistant.handle('catat beli kabel', scope());
  assistant.clear(scope());
  assert.equal(assistant.canContinue('oke catat', scope()), false);
  assert.equal(store.notes.length, 0);
  assert.equal(store.reminders.length, 0);
});

test('personal assistant supports cancel, replacement, and one-note raw capture', async () => {
  const store = fakeStore();
  const assistant = createPersonalAssistant({ store });

  await assistant.handle('catat ringkasan lama', scope());
  const replaced = await assistant.handle('ganti: ringkasan baru', scope());
  assert.match(replaced.reply, /ringkasan baru/);
  await assistant.handle('jangan catat kayak gitu, khusus kali ini catat apa yang aku ketik', scope());
  assert.equal(store.notes[0].text, 'ringkasan baru');

  await assistant.handle('catat jangan disimpan', scope());
  const canceled = await assistant.handle('batal', scope());
  assert.match(canceled.reply, /dibatalkan/);
  assert.equal(store.notes.length, 1);
});
