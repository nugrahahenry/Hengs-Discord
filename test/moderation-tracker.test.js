const test = require('node:test');
const assert = require('node:assert/strict');

const { createTracker } = require('../src/moderation/tracker');

const HMAC_KEY = Buffer.alloc(32, 7);

function msg(channelId, timestampMs, overrides = {}) {
  return {
    guildId: 'guild-1',
    memberId: 'member-1',
    channelId,
    messageId: `message-${channelId}-${timestampMs}`,
    content: 'Join https://promo.example/offer now',
    attachments: [],
    timestampMs,
    blockedDomains: new Set(),
    allowedDomains: new Set(),
    ...overrides,
  };
}

function tracker() {
  return createTracker({ hmacKey: HMAC_KEY });
}

test('same canonical payload in three channels within 60 seconds matches once', () => {
  const subject = tracker();

  assert.equal(subject.observe(msg('c1', 0)).matched, false);
  assert.equal(subject.observe(msg('c2', 10_000)).matched, false);
  const result = subject.observe(msg('c3', 20_000));

  assert.equal(result.matched, true);
  assert.equal(result.trigger, 'CROSS_CHANNEL_REPEAT');
  assert.equal(result.channelCount, 3);
  assert.equal(result.messageCount, 3);
  assert.deepEqual(result.messageIds, ['message-c1-0', 'message-c2-10000', 'message-c3-20000']);
  assert.match(result.signature, /^[a-f0-9]{64}$/);
  assert.equal(subject.observe(msg('c4', 30_000)).matched, false);
});

test('canonicalization removes Discord mentions, invisible characters, controls, and whitespace', () => {
  const first = tracker().observe(msg('c1', 0, {
    content: 'FREE\u200b\n <@123456789012345678>  OFFER',
  }));
  const second = tracker().observe(msg('c1', 0, {
    content: 'free offer',
  }));

  assert.equal(first.signature, second.signature);
});

test('the same HMAC key preserves signatures across tracker instances without exposing content', () => {
  const input = msg('c1', 0, { content: 'Fullwidth \uFF26\uFF32\uFF25\uFF25 deal' });
  const first = tracker().observe(input);
  const second = tracker().observe(input);

  assert.equal(first.signature, second.signature);
  assert.doesNotMatch(JSON.stringify(first), /Fullwidth|deal/);
});

test('configured blocked domain matches immediately and allowed domains override it', () => {
  const subject = tracker();
  const blocked = subject.observe(msg('c1', 0, {
    content: 'Visit HTTPS://Sub.Bad.Example/path',
    blockedDomains: new Set(['bad.example']),
  }));

  assert.equal(blocked.matched, true);
  assert.equal(blocked.trigger, 'BLOCKED_DOMAIN');
  assert.equal(blocked.messageCount, 1);
  assert.equal(blocked.channelCount, 1);
  assert.deepEqual(blocked.messageIds, ['message-c1-0']);
  assert.doesNotMatch(JSON.stringify(blocked), /bad\.example|path/i);

  const allowed = tracker().observe(msg('c1', 0, {
    content: 'Visit https://sub.bad.example/path',
    blockedDomains: new Set(['bad.example']),
    allowedDomains: new Set(['sub.bad.example']),
  }));
  assert.equal(allowed.matched, false);
});

test('credential-bearing URLs still match blocked hosts and cannot use the domain allowlist', () => {
  const result = tracker().observe(msg('c1', 0, {
    content: 'Visit https://user:pass@blocked.example/private',
    blockedDomains: new Set(['blocked.example']),
    allowedDomains: new Set(['blocked.example']),
  }));

  assert.equal(result.matched, true);
  assert.equal(result.trigger, 'BLOCKED_DOMAIN');
  assert.doesNotMatch(JSON.stringify(result), /user|pass|blocked\.example|private/i);
});

test('non-default-port URLs contribute link behavior and blocked-host detection', () => {
  const blocked = tracker().observe(msg('c1', 0, {
    content: 'Visit https://blocked.example:8443/private',
    blockedDomains: new Set(['blocked.example']),
  }));
  assert.equal(blocked.matched, true);
  assert.equal(blocked.trigger, 'BLOCKED_DOMAIN');

  const subject = tracker();
  for (let index = 0; index < 4; index += 1) {
    assert.equal(subject.observe(msg('c1', index * 5_000, {
      content: 'https://promo.example:8443/offer-' + index,
    })).matched, false);
  }
  const burst = subject.observe(msg('c1', 20_000, {
    content: 'https://promo.example:8443/offer-4',
  }));
  assert.equal(burst.matched, true);
  assert.equal(burst.trigger, 'SINGLE_CHANNEL_BURST');
});

test('blocked-domain detection scans a bounded long Discord message before signing', () => {
  const result = tracker().observe(msg('c1', 0, {
    content: `${'x'.repeat(4_000)} https://blocked.example/path`,
    blockedDomains: new Set(['blocked.example']),
  }));

  assert.equal(result.matched, true);
  assert.equal(result.trigger, 'BLOCKED_DOMAIN');
  assert.equal(result.messageCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /blocked\.example|path/i);
});

test('same blocked-domain signature matches once per history window', () => {
  const subject = tracker();
  const blockedDomains = new Set(['bad.example']);

  assert.equal(subject.observe(msg('c1', 0, {
    content: 'https://sub.bad.example/first',
    blockedDomains,
  })).matched, true);
  assert.equal(subject.observe(msg('c2', 1_000, {
    content: 'https://sub.bad.example/second',
    blockedDomains,
  })).matched, false);
  assert.equal(subject.observe(msg('c3', 2_000, {
    content: 'https://other.bad.example/first',
    blockedDomains,
  })).matched, true);
  assert.equal(subject.observe(msg('c4', 120_001, {
    content: 'https://sub.bad.example/third',
    blockedDomains,
  })).matched, true);
});

test('five same-domain link messages in one channel within 30 seconds match', () => {
  const subject = tracker();
  for (let index = 0; index < 4; index += 1) {
    assert.equal(subject.observe(msg('c1', index * 5_000, {
      content: `https://promo.example/offer-${index}`,
    })).matched, false);
  }

  const result = subject.observe(msg('c1', 20_000, {
    content: 'https://promo.example/offer-4',
  }));
  assert.equal(result.matched, true);
  assert.equal(result.trigger, 'SINGLE_CHANNEL_BURST');
  assert.equal(result.messageCount, 5);
  assert.equal(result.channelCount, 1);
});

test('five same attachment-family messages in one channel within 30 seconds match', () => {
  const subject = tracker();
  for (let index = 0; index < 4; index += 1) {
    assert.equal(subject.observe(msg('c1', index * 5_000, {
      content: `different caption ${index}`,
      attachments: [{ contentType: 'image/png', size: 1024 + index }],
    })).matched, false);
  }

  const result = subject.observe(msg('c1', 20_000, {
    content: 'another caption',
    attachments: [{ contentType: 'image/jpeg', size: 2048 }],
  }));
  assert.equal(result.matched, true);
  assert.equal(result.trigger, 'SINGLE_CHANNEL_BURST');
  assert.equal(result.messageCount, 5);
});

test('three attachment-bearing messages in three channels within 60 seconds match attachment flood', () => {
  const subject = tracker();
  assert.equal(subject.observe(msg('c1', 0, {
    content: 'different one',
    attachments: [{ contentType: 'image/png', size: 100 }],
  })).matched, false);
  assert.equal(subject.observe(msg('c2', 10_000, {
    content: 'different two',
    attachments: [{ contentType: 'application/pdf', size: 200 }],
  })).matched, false);

  const result = subject.observe(msg('c3', 20_000, {
    content: 'different three',
    attachments: [{ contentType: 'video/mp4', size: 300 }],
  }));
  assert.equal(result.matched, true);
  assert.equal(result.trigger, 'CROSS_CHANNEL_ATTACHMENT_FLOOD');
  assert.equal(result.messageCount, 3);
  assert.equal(result.channelCount, 3);
});

test('higher-priority triggers win when one observation qualifies for several rules', () => {
  const subject = tracker();
  subject.observe(msg('c1', 0, {
    content: 'https://neutral.example/one',
    attachments: [{ contentType: 'image/png', size: 100 }],
    blockedDomains: new Set(['bad.example']),
  }));
  subject.observe(msg('c2', 10_000, {
    content: 'https://neutral.example/two',
    attachments: [{ contentType: 'image/png', size: 100 }],
    blockedDomains: new Set(['bad.example']),
  }));
  const result = subject.observe(msg('c3', 20_000, {
    content: 'https://bad.example/offer',
    attachments: [{ contentType: 'image/png', size: 100 }],
    blockedDomains: new Set(['bad.example']),
  }));

  assert.equal(result.trigger, 'BLOCKED_DOMAIN');
});

test('expiry boundaries include the exact window endpoint and exclude the next millisecond', () => {
  const repeatAtBoundary = tracker();
  repeatAtBoundary.observe(msg('c1', 0));
  repeatAtBoundary.observe(msg('c2', 30_000));
  assert.equal(repeatAtBoundary.observe(msg('c3', 60_000)).matched, true);

  const repeatOutsideWindow = tracker();
  repeatOutsideWindow.observe(msg('c1', 0));
  repeatOutsideWindow.observe(msg('c2', 30_000));
  assert.equal(repeatOutsideWindow.observe(msg('c3', 60_001)).matched, false);

  const burstAtBoundary = tracker();
  for (let index = 0; index < 4; index += 1) {
    burstAtBoundary.observe(msg('c1', index * 7_500, {
      content: `https://promo.example/${index}`,
    }));
  }
  assert.equal(burstAtBoundary.observe(msg('c1', 30_000, {
    content: 'https://promo.example/last',
  })).matched, true);

  const burstOutsideWindow = tracker();
  for (let index = 0; index < 4; index += 1) {
    burstOutsideWindow.observe(msg('c1', index * 7_500, {
      content: `https://promo.example/${index}`,
    }));
  }
  assert.equal(burstOutsideWindow.observe(msg('c1', 30_001, {
    content: 'https://promo.example/last',
  })).matched, false);
});

test('ordinary traffic does not trigger the tracker', () => {
  const subject = tracker();

  assert.equal(subject.observe(msg('c1', 0, { content: 'one ordinary promotion' })).matched, false);
  assert.equal(subject.observe(msg('c1', 1_000, {
    content: 'one attachment',
    attachments: [{ contentType: 'image/png', size: 100 }],
  })).matched, false);

  for (let index = 0; index < 6; index += 1) {
    assert.equal(subject.observe(msg('c1', 2_000 + index, {
      content: `different ordinary message ${index}`,
    })).matched, false);
  }

  assert.equal(subject.observe(msg('c1', 20_000, {
    content: 'https://discord.com/channels/1/2/3',
  })).matched, false);
});

test('different members and messages outside their time window do not correlate', () => {
  const subject = tracker();
  subject.observe(msg('c1', 0));
  subject.observe(msg('c2', 10_000, { memberId: 'member-2' }));
  assert.equal(subject.observe(msg('c3', 20_000)).matched, false);

  subject.clearMember('guild-1', 'member-1');
  subject.observe(msg('c1', 0));
  subject.observe(msg('c2', 30_000));
  assert.equal(subject.observe(msg('c3', 60_001)).matched, false);
});

test('allowed domains do not supply a domain signature for a single-channel burst', () => {
  const subject = tracker();
  for (let index = 0; index < 5; index += 1) {
    assert.equal(subject.observe(msg('c1', index * 5_000, {
      content: `https://discord.com/channels/1/2/${index}`,
    })).matched, false);
  }
});

test('member observations are capped at 100 and evict the oldest first', () => {
  const subject = tracker();
  subject.observe(msg('old-channel', 0, { content: 'same payload' }));
  for (let index = 1; index <= 100; index += 1) {
    subject.observe(msg(`c-${index}`, index, { content: `unique ${index}` }));
  }

  const snapshot = subject.snapshot();
  assert.deepEqual(snapshot, { guilds: 1, members: 1, observations: 100 });
  assert.equal(subject.observe(msg('new-channel-1', 102, { content: 'same payload' })).matched, false);
  assert.equal(subject.observe(msg('new-channel-2', 103, { content: 'same payload' })).matched, false);
});

test('guild observations are capped at 2000 and evict the oldest first', () => {
  const subject = tracker();
  subject.observe(msg('old-channel', 0, { content: 'same payload' }));
  for (let index = 1; index <= 1_999; index += 1) {
    subject.observe(msg(`other-${index}`, index, {
      memberId: `member-${index}`,
      content: `unique ${index}`,
    }));
  }

  assert.deepEqual(subject.snapshot(), { guilds: 1, members: 1999, observations: 2000 });
  assert.equal(subject.observe(msg('new-channel-1', 2_000, { content: 'same payload' })).matched, false);
  assert.equal(subject.observe(msg('new-channel-2', 2_001, { content: 'same payload' })).matched, false);
  assert.deepEqual(subject.snapshot(), { guilds: 1, members: 1999, observations: 2000 });
});

test('observe results exclude raw content, URLs, domains, and attachment metadata', () => {
  const subject = tracker();
  const sentinel = 'PRIVATE-SENTINEL-CONTENT';
  const result = subject.observe(msg('c1', 0, {
    content: `${sentinel} https://private.example/path`,
    attachments: [{ contentType: 'application/x-private', size: 987654 }],
    blockedDomains: new Set(['private.example']),
  }));

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /PRIVATE-SENTINEL-CONTENT|private\.example|application\/x-private|987654/);
});
