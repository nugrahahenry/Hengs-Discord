const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  buildOnboardingFields, buildWelcomeEmbed, findOnboardingChannel, findMemberRole, assignMemberRole,
} = require('../src/utils/member-onboarding');
const { formatDuration, generateCard, CARD } = require('../src/utils/welcome-card');

function cache(items) {
  const map = new Map(items.map((item) => [item.id, item]));
  map.find = (predicate) => [...map.values()].find(predicate);
  return map;
}

test('member role fallback requires an exact normalized Member name', () => {
  const wrong = { id: 'role-1', name: 'OG Member' };
  const right = { id: 'role-2', name: 'Member' };
  const guild = { roles: { cache: cache([wrong, right]) } };

  assert.equal(findMemberRole(guild, null), right);
  assert.equal(findMemberRole(guild, 'role-1'), wrong);
});

test('auto-role works independently and rejects invalid hierarchy', async () => {
  const role = { id: 'member-role', name: 'Member' };
  const added = [];
  const logger = { log() {}, warn() {}, error() {} };
  const member = {
    user: { username: 'new-member' },
    guild: {
      roles: { cache: cache([role]) },
      members: { me: { roles: { highest: { comparePositionTo: () => 1 } } } },
    },
    roles: {
      cache: new Map(),
      add: async (value) => added.push(value.id),
    },
  };

  const accepted = await assignMemberRole(member, null, logger);
  assert.equal(accepted.ok, true);
  assert.deepEqual(added, ['member-role']);

  member.guild.members.me.roles.highest.comparePositionTo = () => 0;
  const rejected = await assignMemberRole(member, null, logger);
  assert.equal(rejected.reason, 'role_hierarchy');
  assert.deepEqual(added, ['member-role']);
});

test('onboarding fields give new members a short ordered path', () => {
  const fields = buildOnboardingFields({
    rulesChannel: '<#823456789012345678>',
    rolesChannel: '<#823456789012345679>',
    announceChannel: '<#823456789012345680>',
    introChannel: '<#823456789012345681>',
  });
  assert.equal(fields.length, 2);
  assert.match(fields[0].value, /1\. .*Baca aturan/);
  assert.match(fields[0].value, /4\. .*Pantau update/);
  assert.match(fields[1].value, /Mention Hengs/);
  assert.doesNotMatch(JSON.stringify(buildOnboardingFields()), /[\u2013\u2014]/);
});

test('home welcome has one greeting, one guide and one help block', () => {
  const channels = {
    rulesChannel: '<#823456789012345678>',
    rolesChannel: '<#823456789012345679>',
    announceChannel: '<#823456789012345680>',
    introChannel: '<#823456789012345681>',
  };
  const member = { displayName: 'Vemz', guild: { name: 'Hengs', memberCount: 55 } };
  const embed = buildWelcomeEmbed(member, { channels, now: new Date('2026-10-17T03:00:00Z') }).toJSON();
  assert.equal(embed.title, '👋 Selamat datang, Vemz!');
  const text = [embed.title, embed.description, ...embed.fields.flatMap(f => [f.name, f.value])].join('\n');
  assert.equal((text.match(/Selamat datang/gi) || []).length, 1);
  assert.equal((text.match(/Baca aturan/g) || []).length, 1);
  assert.equal((text.match(/Ambil role/g) || []).length, 1);
  assert.equal((text.match(/Butuh bantuan/g) || []).length, 1);
  for (const reference of Object.values(channels)) assert.equal(text.split(reference).length - 1, 1);
  assert.equal(embed.fields[0].value.split('\n').length, 4);
  assert.ok(text.length < 750);
  assert.equal(embed.timestamp, '2026-10-17T03:00:00.000Z');
  assert.doesNotMatch(text, /[\u2013\u2014]/);
});

test('custom welcome copy is preserved with the same single onboarding guide', () => {
  const member = { displayName: 'New member', guild: { name: 'Hengs', memberCount: 1 } };
  const copy = 'Halo geng, cari teman mabar dan kenalan dulu yuk!';
  const embed = buildWelcomeEmbed(member, { customWelcomeCopy: copy }).toJSON();
  assert.equal(embed.description, copy);
  assert.equal(embed.fields.length, 2);
  assert.match(embed.fields[0].value, /#rules/);
  assert.match(embed.fields[0].value, /#get-roles/);
  assert.match(embed.fields[0].value, /#intro-dulu-ngab/);
  assert.match(embed.fields[0].value, /#announcements/);
  assert.doesNotMatch(JSON.stringify(embed), /undefined|null/);
});

test('welcome presentation escapes names and rejects invalid channel references', () => {
  const member = { displayName: '*Guest*', guild: { name: '[Community](https://example.com)', memberCount: 1 } };
  const embed = buildWelcomeEmbed(member, { channels: {
    rulesChannel: '@everyone', rolesChannel: '<@&823456789012345679>',
  } }).toJSON();
  assert.match(embed.title, /\\\*Guest\\\*/);
  assert.ok(embed.description.includes('\\[Community]'));
  assert.doesNotMatch(embed.fields[0].value, /@everyone|<@&/);
  assert.match(embed.fields[0].value, /#rules/);
});

test('onboarding channel resolution supports Indonesian names and explicit configuration', () => {
  const text = (id, name) => ({ id, name, isTextBased: () => true });
  const rules = text('823456789012345678', '📜・aturan-server');
  const override = text('823456789012345679', 'read-me');
  const guild = { channels: { cache: cache([
    { id: '823456789012345677', name: 'rules', isTextBased: () => false },
    rules, override,
    text('823456789012345680', '🎭・ambil-role'),
    text('823456789012345681', '👋・kenalan'),
    text('823456789012345682', '📢・pengumuman'),
  ]) } };
  assert.equal(findOnboardingChannel(guild, null, 'rules'), `<#${rules.id}>`);
  assert.equal(findOnboardingChannel(guild, override.id, 'rules'), `<#${override.id}>`);
  assert.equal(findOnboardingChannel(guild, '823456789012345677', 'rules'), `<#${rules.id}>`);
  assert.equal(findOnboardingChannel(guild, 'missing', 'roles'), '<#823456789012345680>');
  assert.equal(findOnboardingChannel(guild, null, 'intro'), '<#823456789012345681>');
  assert.equal(findOnboardingChannel(guild, null, 'announce'), '<#823456789012345682>');
  assert.equal(findOnboardingChannel({ channels: { cache: cache([]) } }, null, 'rules'), null);
  assert.equal(findOnboardingChannel(guild, null, 'unknown'), null);
});

test('welcome and leave cards render valid PNG buffers offline', async () => {
  const now = new Date('2026-07-31T08:00:00Z');
  const member = {
    id: '570152798126342144',
    displayName: 'Henry',
    joinedAt: new Date('2026-07-30T08:00:00Z'),
    guild: { memberCount: 42 },
    user: {
      id: '570152798126342144',
      username: 'henry',
      createdAt: new Date('2020-01-01T00:00:00Z'),
      displayAvatarURL: () => null,
    },
  };

  for (const type of ['welcome', 'leave']) {
    const output = await generateCard(member, type, { now, serverName: 'Hengs' });
    assert.ok(Buffer.isBuffer(output));
    assert.deepEqual([...output.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(output.readUInt32BE(16), CARD.width);
    assert.equal(output.readUInt32BE(20), CARD.height);
  }

  const defaultCard = await generateCard(member, 'welcome', { now, serverName: 'Hengs' });
  const customCard = await generateCard(member, 'welcome', {
    now,
    serverName: 'Hengs',
    welcomeMessage: 'Halo komunitas, langsung mulai dari rules dan kenalan ya!',
    onboardingLabel: 'MULAI DI SINI',
  });
  assert.notDeepEqual(customCard, defaultCard);
});

test('production welcome background is an optimized card-sized PNG', async () => {
  const { loadImage } = require('@napi-rs/canvas');
  const backgroundPath = require('node:path').join(
    __dirname,
    '..',
    'assets',
    'welcome',
    'aurora-gateway-v2.png',
  );
  const stat = require('node:fs').statSync(backgroundPath);
  const image = await loadImage(backgroundPath);
  assert.equal(image.width, CARD.width);
  assert.equal(image.height, CARD.height);
  assert.ok(stat.size < 512 * 1024);
});

test('production welcome and leave artwork has bounded dimensions and transparent mascots', async () => {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const assetRoot = path.join(__dirname, '..', 'assets');
  const backgrounds = [
    path.join(assetRoot, 'welcome', 'welcome-gateway-v3.png'),
    path.join(assetRoot, 'welcome', 'leave-gateway-v3.png'),
  ];
  for (const backgroundPath of backgrounds) {
    const image = await loadImage(backgroundPath);
    const stat = require('node:fs').statSync(backgroundPath);
    assert.equal(image.width, CARD.width);
    assert.equal(image.height, CARD.height);
    assert.ok(stat.size < 512 * 1024);
  }

  const mascots = [
    path.join(assetRoot, 'brand', 'hengs-welcome-mascot-v2.png'),
    path.join(assetRoot, 'brand', 'hengs-leave-mascot-v2.png'),
  ];
  for (const mascotPath of mascots) {
    const image = await loadImage(mascotPath);
    const stat = require('node:fs').statSync(mascotPath);
    assert.equal(image.width, 264);
    assert.equal(image.height, 388);
    assert.ok(stat.size < 200 * 1024);
    const ctx = createCanvas(image.width, image.height).getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    let transparent = 0;
    let visible = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] === 0) transparent += 1;
      if (pixels[index] > 128) visible += 1;
    }
    assert.ok(transparent > image.width * image.height * 0.1, 'mascot keeps transparent space');
    assert.ok(visible > image.width * image.height * 0.1, 'mascot is not an empty image');
  }
});

test('welcome and leave select their bundled artwork, honor overrides and recover from missing paths', async (t) => {
  const keys = [
    'HENGS_WELCOME_BACKGROUND_PATH', 'HENGS_LEAVE_BACKGROUND_PATH',
    'HENGS_WELCOME_MASCOT_PATH', 'HENGS_LEAVE_MASCOT_PATH',
  ];
  const saved = new Map(keys.map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const key of keys) delete process.env[key];
  const now = new Date('2026-10-24T08:00:00Z');
  const member = {
    id: 'preview-member',
    displayName: 'Vemz',
    joinedAt: new Date('2026-10-15T10:00:00Z'),
    guild: { memberCount: 55 },
    user: {
      id: 'preview-user',
      username: 'vemz3119',
      createdAt: new Date('2020-01-01T00:00:00Z'),
      displayAvatarURL: () => null,
    },
  };
  const assetRoot = path.join(__dirname, '..', 'assets');
  const baseOptions = { now, serverName: 'Hengs', memberNumber: 55 };
  for (const type of ['welcome', 'leave']) {
    const otherType = type === 'welcome' ? 'leave' : 'welcome';
    const backgroundPath = path.join(assetRoot, 'welcome', `${type}-gateway-v3.png`);
    const mascotPath = path.join(assetRoot, 'brand', `hengs-${type}-mascot-v2.png`);
    const alternateBackground = path.join(assetRoot, 'welcome', `${otherType}-gateway-v3.png`);
    const alternateMascot = path.join(assetRoot, 'brand', `hengs-${otherType}-mascot-v2.png`);
    const bundled = await generateCard(member, type, baseOptions);
    assert.ok(Buffer.isBuffer(bundled));
    assert.deepEqual(await generateCard(member, type, {
      ...baseOptions, backgroundPath, mascotPath,
    }), bundled, `${type} uses its own bundled artwork by default`);
    const override = await generateCard(member, type, {
      ...baseOptions, backgroundPath: alternateBackground, mascotPath: alternateMascot,
    });
    assert.notDeepEqual(override, bundled, `${type} overrides affect actual pixels`);
    assert.deepEqual(await generateCard(member, type, {
      ...baseOptions,
      [`${type}BackgroundPath`]: alternateBackground,
      [`${type}MascotPath`]: alternateMascot,
    }), override, `${type} accepts type-specific options`);
    assert.deepEqual(await generateCard(member, type, {
      ...baseOptions, backgroundPath, mascotPath,
      [`${type}BackgroundPath`]: alternateBackground,
      [`${type}MascotPath`]: alternateMascot,
    }), bundled, 'generic explicit paths take precedence over type-specific paths');
    assert.deepEqual(await generateCard(member, type, {
      ...baseOptions,
      backgroundPath: path.join(assetRoot, 'missing-preview-background.png'),
      mascotPath: path.join(assetRoot, 'missing-preview-mascot.png'),
    }), bundled, 'missing overrides fall back to bundled images');
    assert.notDeepEqual(await generateCard(member, type, {
      ...baseOptions, galaxyOverlay: false,
    }), bundled, 'galaxy overlay can be turned off independently');
  }
});

test('member tenure keeps minute and hour precision instead of showing zero days', () => {
  const joined = new Date('2026-08-23T11:33:00.000Z');
  assert.equal(formatDuration(joined, new Date('2026-08-23T11:41:00.000Z')), '8m');
  assert.equal(formatDuration(joined, new Date('2026-08-23T13:38:00.000Z')), '2h 5m');
  assert.equal(formatDuration(joined, new Date('2026-08-24T13:33:00.000Z')), '1d 2h');
  assert.equal(formatDuration(null, new Date('2026-08-24T13:33:00.000Z')), 'Unknown');
});

test('welcome runtime copy contains no em dash or en dash', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'src', 'index.js'),
    'utf8',
  );
  const welcomeStart = source.indexOf('client.on(Events.GuildMemberAdd');
  const welcomeEnd = source.indexOf('client.on(Events.GuildMemberUpdate');
  const welcomeSurface = source.slice(welcomeStart, welcomeEnd);
  assert.doesNotMatch(welcomeSurface, /[\u2013\u2014]/);
});
