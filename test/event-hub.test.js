const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection } = require('discord.js');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-event-hub-test-'));
process.env.EVENT_DATA_DIR = testDataDir;
process.env.OWNER_ID = '570152798126342144';
process.env.BOT_SETTINGS_CHANNEL_ID = 'settings-channel';
process.env.ANNOUNCE_CHANNEL_ID = 'announce-channel';
process.env.DISCORD_GUILD_ID = 'guild-1';

const store = require('../src/events/store');
const hub = require('../src/events/hub');
const eventCommand = require('../src/commands/event');

let messageSequence = 0;

function createChannel(id, name) {
  const messages = new Collection();
  const channel = {
    id,
    name,
    sent: messages,
    isTextBased: () => true,
    messages: {
      fetch: async (target) => {
        if (typeof target === 'object') return messages;
        return messages.get(target) || null;
      },
    },
    send: async (payload) => {
      messageSequence += 1;
      const message = {
        id: `message-${messageSequence}`,
        channel,
        embeds: (payload.embeds || []).map((embed) => embed.toJSON()),
        components: payload.components || [],
        edits: [],
        async edit(next) {
          this.embeds = (next.embeds || []).map((embed) => embed.toJSON());
          this.components = next.components || [];
          this.edits.push(next);
          return this;
        },
        async delete() {
          messages.delete(this.id);
        },
      };
      messages.set(message.id, message);
      return message;
    },
  };
  return channel;
}

function createGuild() {
  const settings = createChannel('settings-channel', 'bot-settings');
  const announcements = createChannel('announce-channel', 'announcements');
  const channels = new Collection([
    [settings.id, settings],
    [announcements.id, announcements],
  ]);
  return {
    id: 'guild-1',
    channels: {
      cache: channels,
      fetch: async (id) => channels.get(id) || null,
    },
    settings,
    announcements,
  };
}

function buttonInteraction(guild, customId, userId) {
  return {
    customId,
    guild,
    user: { id: userId },
    replied: false,
    deferred: false,
    isButton: () => true,
    inGuild: () => true,
    replies: [],
    updates: [],
    followUps: [],
    async reply(payload) { this.replied = true; this.replies.push(payload); },
    async deferReply() { this.deferred = true; },
    async editReply(payload) { this.replies.push(payload); },
    async update(payload) { this.replied = true; this.updates.push(payload); },
    async followUp(payload) { this.followUps.push(payload); },
  };
}

function futureIso(offsetMs = 2 * 24 * 60 * 60 * 1000) {
  return new Date(Date.now() + offsetMs).toISOString();
}

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('event command exposes bounded draft/status schema and runtime editor guard', () => {
  const schema = eventCommand.data.toJSON();
  assert.deepEqual(schema.options.map((option) => option.name), ['draft', 'status']);
  const draft = schema.options.find((option) => option.name === 'draft');
  assert.deepEqual(draft.options.filter((option) => option.required).map((option) => option.name), [
    'judul', 'deskripsi', 'waktu',
  ]);
  assert.equal(eventCommand.assertEventAccess({ user: { id: process.env.OWNER_ID } }), null);
  assert.match(eventCommand.assertEventAccess({ user: { id: 'unauthorized' }, member: { roles: [] } }), /Hanya owner/);
});

test('draft approval is owner-only, publishes once, supports RSVP, and cancels safely', async () => {
  const guild = createGuild();
  const created = await hub.createDraftPanel(guild, {
    title: 'Community Night',
    description: 'Main dan ngobrol bareng.',
    startAt: futureIso(),
    location: 'General Voice',
    capacity: 2,
    createdBy: 'editor-1',
    externalId: 'discord:event-hub-acceptance',
  });
  assert.equal(created.created, true);
  assert.ok(await guild.settings.messages.fetch(created.event.panel.messageId));

  const blocked = buttonInteraction(guild, `event:publish:${created.event.id}`, 'unauthorized');
  await hub.handleButton(blocked);
  assert.match(blocked.replies[0].content, /Hanya owner/);
  assert.equal(store.getEvent(created.event.id).status, 'draft');

  const publish = buttonInteraction(guild, `event:publish:${created.event.id}`, process.env.OWNER_ID);
  await hub.handleButton(publish);
  const published = store.getEvent(created.event.id);
  assert.equal(published.status, 'published');
  assert.ok(published.publication.messageId);
  assert.equal(guild.announcements.sent.size, 1);

  const duplicate = buttonInteraction(guild, `event:publish:${created.event.id}`, process.env.OWNER_ID);
  await hub.handleButton(duplicate);
  assert.equal(guild.announcements.sent.size, 1);
  assert.match(duplicate.replies[0].content, /sudah diproses/);

  for (const userId of ['user-1', 'user-2']) {
    const rsvp = buttonInteraction(guild, `event:rsvp_yes:${created.event.id}`, userId);
    await hub.handleButton(rsvp);
    assert.match(rsvp.replies.at(-1).content, /Hadir/);
  }
  const full = buttonInteraction(guild, `event:rsvp_yes:${created.event.id}`, 'user-3');
  await hub.handleButton(full);
  assert.match(full.replies.at(-1).content, /penuh/);

  const maybe = buttonInteraction(guild, `event:rsvp_maybe:${created.event.id}`, 'user-1');
  await hub.handleButton(maybe);
  assert.deepEqual(store.getEvent(created.event.id).rsvp, { yes: ['user-2'], maybe: ['user-1'] });

  const cancel = buttonInteraction(guild, `event:cancel:${created.event.id}`, process.env.OWNER_ID);
  await hub.handleButton(cancel);
  assert.equal(store.getEvent(created.event.id).status, 'cancelled');
  assert.equal(store.getEvent(created.event.id).messageSyncPending, false);
  const publicMessage = await guild.announcements.messages.fetch(published.publication.messageId);
  assert.equal(publicMessage.components.length, 0);
});

test('worker sends one recoverable reminder and closes event at start', async () => {
  const guild = createGuild();
  const client = { guilds: { cache: new Collection([[guild.id, guild]]) } };
  const event = store.createEvent({
    title: 'Reminder Test',
    description: 'Uji reminder satu jam.',
    startAt: futureIso(30 * 60 * 1000),
    createdBy: 'owner',
    externalId: 'discord:reminder-test',
  }).event;
  const panel = await guild.settings.send({ embeds: [hub.eventEmbed(event)], components: [] });
  store.setPanel(event.id, { channelId: guild.settings.id, messageId: panel.id });
  store.claimPublish(event.id, 'owner');
  const publicMessage = await guild.announcements.send({
    embeds: [hub.eventEmbed({ ...event, status: 'published' }, { publicView: true })],
    components: [],
  });
  store.finalizePublish(event.id, 'owner', {
    channelId: guild.announcements.id,
    messageId: publicMessage.id,
  });

  await hub.processWorker(client);
  const afterReminder = store.getEvent(event.id);
  assert.equal(afterReminder.reminders.hour.status, 'sent');
  assert.equal(guild.announcements.sent.size, 2);
  await hub.processWorker(client);
  assert.equal(guild.announcements.sent.size, 2);

  await hub.processWorker(client, Date.parse(event.startAt) + 1);
  assert.equal(store.getEvent(event.id).status, 'closed');
  assert.equal(publicMessage.components.length, 0);
});

test('startup recovery finalizes a sent event instead of publishing it twice', async () => {
  const guild = createGuild();
  const client = { guilds: { cache: new Collection([[guild.id, guild]]) } };
  const event = store.createEvent({
    title: 'Crash Recovery',
    description: 'Sudah terkirim sebelum state final.',
    startAt: futureIso(),
    createdBy: 'owner',
    externalId: 'discord:crash-recovery',
  }).event;
  store.claimPublish(event.id, 'owner');
  const sent = await guild.announcements.send({
    embeds: [hub.eventEmbed({ ...event, status: 'publishing' }, { publicView: true })],
    components: [],
  });

  await hub.recoverPublishingEvents(client);
  const recovered = store.getEvent(event.id);
  assert.equal(recovered.status, 'published');
  assert.equal(recovered.publication.messageId, sent.id);
  assert.equal(guild.announcements.sent.size, 1);
});

test('Canox event inbox is all-or-nothing and creates one private idempotent draft', async () => {
  const startAt = futureIso();
  const valid = {
    id: 'canox-event-001',
    title: 'AI Community Meetup',
    description: 'Diskusi komunitas tentang AI terapan.',
    start_at: startAt,
    location: 'General Voice',
    capacity: 20,
    source_url: 'https://example.com/events/ai-meetup',
  };
  assert.deepEqual(hub.normalizeCanoxEventEntries({ events: [valid] })[0], {
    id: valid.id,
    title: valid.title,
    description: valid.description,
    startAt,
    location: valid.location,
    capacity: 20,
    sourceUrl: valid.source_url,
  });
  assert.deepEqual(hub.normalizeCanoxEventEntries({ events: [
    valid,
    { ...valid, id: 'canox-event-002', start_at: 'invalid' },
  ] }), []);
  assert.deepEqual(hub.normalizeCanoxEventEntries({ events: [
    { ...valid, start_at: '2099-01-01T19:00:00' },
  ] }), []);

  const guild = createGuild();
  const client = {
    guilds: {
      fetch: async (id) => (id === guild.id ? guild : null),
      cache: new Collection([[guild.id, guild]]),
    },
  };
  const inbox = path.join(testDataDir, 'canox-event-inbox.json');
  fs.writeFileSync(inbox, JSON.stringify({ events: [valid] }), 'utf8');
  await hub.consumeCanoxEventInbox(client);

  const stored = store.listEvents().find((event) => event.externalId === `canox-event:${valid.id}`);
  assert.equal(stored.status, 'draft');
  assert.equal(stored.source, 'canox');
  assert.equal(stored.sourceUrl, valid.source_url);
  assert.equal(guild.settings.sent.size, 1);
  assert.equal(guild.announcements.sent.size, 0);
  assert.equal(fs.existsSync(inbox), false);

  fs.writeFileSync(inbox, JSON.stringify({ events: [valid] }), 'utf8');
  await hub.consumeCanoxEventInbox(client);
  assert.equal(guild.settings.sent.size, 1);
  assert.equal(guild.announcements.sent.size, 0);
});

test('stale Canox event processing file is recovered without overwriting an inbox', () => {
  const stale = path.join(testDataDir, 'canox-event-inbox.processing-123-456.json');
  const inbox = path.join(testDataDir, 'canox-event-inbox.json');
  fs.rmSync(inbox, { force: true });
  fs.writeFileSync(stale, JSON.stringify({ events: [] }), 'utf8');

  assert.equal(hub.recoverStaleCanoxEventInbox(), 1);
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(inbox), true);
  fs.rmSync(inbox, { force: true });
});
