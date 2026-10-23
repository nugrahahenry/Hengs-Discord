'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { createChatActions, PREFIX, readKirim } = require('../src/chat-actions');

const G = '223456789012345678', U = '323456789012345678', OTHER = '423456789012345678', C = '523456789012345678';
const IMAGE = { id: 'a', url: 'https://cdn.discordapp.com/attachments/1/2/meme.png', contentType: 'image/png', size: 1200, name: 'meme.png' };

function rig() {
  let time = 1_000_000;
  const calls = [];
  const sharing = { async submit(i) { calls.push(['submit', i.options.getSubcommand(), i.options.getString('link'),
    i.options.getString('caption'), i.options.getAttachment('gambar')]); return { content: 'PREVIEW' }; } };
  const scrim = {
    async preview(i, deps) { calls.push(['preview', i.options.getString('lawan', true), i.options.getString('hasil', true),
      i.options.getString('catatan'), i.options.getAttachment('ss'), Boolean(deps.guildAccess)]); },
    async remove(i, deps) { calls.push(['remove', Boolean(deps.guildAccess)]); },
  };
  const actions = createChatActions({ sharing, scrim, guildAccess: { classify: () => ({ kind: 'home' }) }, now: () => time });
  const msg = (extra = {}) => ({ guildId: G, channelId: C, author: { id: U }, attachments: new Map(), ...extra });
  const click = (customId, extra = {}) => ({ customId, guildId: G, channelId: C, user: { id: U }, isButton: () => true,
    replies: [], deferred: null, edits: [],
    async reply(p) { this.replies.push(p); }, async deferReply(p) { this.deferred = p; }, async editReply(p) { this.edits.push(p); },
    ...extra });
  const button = payload => payload.components[0].components[0].custom_id;
  return { actions, calls, msg, click, button, advance: ms => { time += ms; } };
}

test('a chat request becomes one public line with a Lanjut button; only the requester can use it, once', async () => {
  const r = rig();
  const offer = r.actions.offer(r.msg(), { kind: 'meme', attachment: IMAGE });
  assert.deepEqual(offer.allowedMentions, { parse: [] });
  assert.match(offer.content, /cuma kamu/); assert.equal(offer.components[0].components.length, 1);
  const id = r.button(offer); assert.ok(id.startsWith(PREFIX));
  const stranger = r.click(id, { user: { id: OTHER } });
  assert.equal(await r.actions.handleButton(stranger), true);
  assert.match(stranger.replies[0].content, /bukan buat kamu/); assert.equal(stranger.replies[0].flags, MessageFlags.Ephemeral);
  assert.deepEqual(r.calls, []);
  const owner = r.click(id);
  await r.actions.handleButton(owner);
  assert.equal(owner.deferred.flags, MessageFlags.Ephemeral);
  assert.deepEqual(r.calls, [['submit', 'meme', null, null, IMAGE]]);
  assert.deepEqual(owner.edits, [{ content: 'PREVIEW' }]);
  const again = r.click(id); await r.actions.handleButton(again);
  assert.match(again.replies[0].content, /hangus/); assert.equal(r.calls.length, 1);
});

test('news by chat passes the link; tickets expire after 10 minutes and stay in their channel', async () => {
  const r = rig();
  const id = r.button(r.actions.offer(r.msg(), { kind: 'news', link: 'https://example.com/a' }));
  const elsewhere = r.click(id, { channelId: '623456789012345678' }); await r.actions.handleButton(elsewhere);
  assert.match(elsewhere.replies[0].content, /hangus/);
  const late = r.button(r.actions.offer(r.msg(), { kind: 'news', link: 'https://example.com/b' }));
  r.advance(10 * 60_000 + 1);
  const expired = r.click(late); await r.actions.handleButton(expired);
  assert.match(expired.replies[0].content, /hangus/);
  assert.deepEqual(r.calls, []);
  const fresh = r.button(r.actions.offer(r.msg(), { kind: 'news', link: 'https://example.com/c' }));
  await r.actions.handleButton(r.click(fresh));
  assert.deepEqual(r.calls, [['submit', 'berita', 'https://example.com/c', null, null]]);
  assert.equal(await r.actions.handleButton({ customId: 'other:x', isButton: () => true }), false);
});

test('scrim catat and hapus run the /scrim hasil and /scrim hapus flows with the chat values', async () => {
  const r = rig();
  const catat = r.button(r.actions.offer(r.msg(), { kind: 'scrim_catat', lawan: 'RRQ Kaito', hasil: 'kalah-draft', catatan: 'telat rotasi', attachment: IMAGE }));
  await r.actions.handleButton(r.click(catat));
  const hapus = r.button(r.actions.offer(r.msg(), { kind: 'scrim_hapus' }));
  await r.actions.handleButton(r.click(hapus));
  assert.deepEqual(r.calls, [['preview', 'RRQ Kaito', 'kalah-draft', 'telat rotasi', IMAGE, true], ['remove', true]]);
});

test('kirim reads an image attachment as a meme, else the first HTTPS link as news, else nothing', () => {
  const files = new Map([['x', { ...IMAGE, contentType: 'application/pdf' }], ['a', IMAGE]]);
  assert.deepEqual(readKirim({ content: 'kirim meme ini', attachments: files }), { kind: 'meme', attachment: IMAGE });
  assert.deepEqual(readKirim({ content: 'kirim berita https://example.com/a?x=1 seru', attachments: new Map() }), { kind: 'news', link: 'https://example.com/a?x=1' });
  assert.equal(readKirim({ content: 'kirim http://insecure.example', attachments: new Map() }), null);
  assert.equal(readKirim({ content: 'mau kirim meme', attachments: new Map() }), null);
});
