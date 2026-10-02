const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('personal memory store writes notes and reminders atomically per private scope', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-discord-personal-'));
  const source = `
    const store = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'personal-memory-store.js'))});
    const scope = { guildId: '223456789012345678', userId: '323456789012345678' };
    const note = store.addNote({ ...scope, text: 'catatan privat', nowMs: 1700000000000 });
    const reminder = store.addReminder({ ...scope, text: 'cek tugas', dueAt: '2099-01-01T02:00:00.000Z', nowMs: 1700000000000 });
    process.stdout.write(JSON.stringify({ note, reminder, notes: store.listNotes(scope), reminders: store.listReminders(scope) }));
  `;
  try {
    const result = spawnSync(process.execPath, ['-e', source], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PERSONAL_DATA_DIR: dir },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.note.ok, true);
    assert.equal(payload.note.item.id, 'note-0001');
    assert.equal(payload.reminder.ok, true);
    assert.equal(payload.reminder.item.id, 'reminder-0001');
    assert.equal(payload.notes[0].scopeKey, '223456789012345678:323456789012345678');
    assert.equal(payload.reminders[0].text, 'cek tugas');
    assert.equal(fs.readdirSync(dir).filter(name => name.endsWith('.tmp')).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
