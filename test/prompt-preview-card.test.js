const assert = require('node:assert/strict');
const test = require('node:test');

const { ChannelType } = require('discord.js');
const {
  MAX_ROWS,
  renderCommunityPreviewCard,
  targetRows,
} = require('../src/prompt-preview-card');

const GUILD = '223456789012345678';

function guild() {
  return {
    id: GUILD,
    channels: {
      cache: new Map([
        ['1', { id: '823456789012345678', name: 'announcements', type: ChannelType.GuildText, viewable: true }],
        ['2', { id: '823456789012345679', name: 'ruang-tunggu', type: ChannelType.GuildVoice, viewable: true }],
      ]),
    },
  };
}

test('targetRows stays fixed, bounded, and marks existing text and voice channels', () => {
  const rows = targetRows(['lobby'], guild());
  assert.ok(rows.length > 0);
  assert.ok(rows.length <= MAX_ROWS);
  assert.equal(rows.find(row => row.name === 'announcements').present, true);
  assert.equal(rows.find(row => row.name === 'ruang-tunggu').present, true);
  assert.ok(rows.every(row => row.section === 'LOBI MASUK'));
});

test('renderCommunityPreviewCard returns a PNG without prompt or guild identifiers', () => {
  const card = renderCommunityPreviewCard({ blueprintKeys: ['gaming'], guild: guild() });
  assert.ok(Buffer.isBuffer(card));
  assert.deepEqual([...card.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(card.includes(Buffer.from(GUILD)), false);
  assert.equal(renderCommunityPreviewCard({ blueprintKeys: [], guild: guild() }), null);
});
