'use strict';

// Chat mode phase 2: a chat request to send a meme or news, or to log or undo a scrim, gets one public line with a
// "Lanjut" button that only the requester can press. The click runs the existing slash flow on that button
// interaction with the chat values as its options, so every check, the private preview and the final confirm stay
// the slash command's own.
const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const PREFIX = 'hengs-chat:';
const TTL = 10 * 60_000;
const MAX = 200;
const IMAGE = /^image\/(?:png|jpeg|webp)$/;
const LABEL = { meme: 'kiriman meme-mu', news: 'kiriman berita-mu', scrim_catat: 'catatan scrim-mu',
  scrim_hapus: 'hapus game terakhir yang kamu catat' };

const firstImage = message => [...(message?.attachments?.values?.() || [])]
  .find(file => IMAGE.test(String(file?.contentType || ''))) || null;

// The message's first PNG/JPG/WebP is a meme; otherwise its first HTTPS link is news.
function readKirim(message) {
  const image = firstImage(message);
  if (image) return { kind: 'meme', attachment: image };
  const link = /https:\/\/[^\s<>()]+/.exec(String(message?.content || ''))?.[0]?.replace(/[.,!?]+$/, '');
  return link ? { kind: 'news', link } : null;
}

// The button interaction, with options answering like the slash command's would.
function withOptions(i, { subcommand = null, strings = {}, attachments = {} } = {}) {
  const options = {
    getSubcommand: () => subcommand,
    getString(name, required = false) {
      const value = strings[name] ?? null;
      if (required && value === null) throw new Error('SCRIM_FIELDS_INVALID');
      return value;
    },
    getAttachment: name => attachments[name] ?? null,
  };
  return new Proxy(i, { get(target, prop) {
    if (prop === 'options') return options;
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

function createChatActions({ sharing, scrim, guildAccess, now = Date.now } = {}) {
  const tickets = new Map();
  const sweep = () => { for (const [id, ticket] of tickets) if (now() >= ticket.expires) tickets.delete(id); };
  return {
    offer(msg, action) {
      sweep();
      if (tickets.size >= MAX) tickets.delete(tickets.keys().next().value);
      const id = crypto.randomBytes(12).toString('hex');
      tickets.set(id, { ...action, guildId: msg.guildId, channelId: msg.channelId, requesterId: msg.author.id, expires: now() + TTL });
      return {
        content: `Siap, aku siapin ${LABEL[action.kind]}. Pencet **Lanjut** buat lihat preview dan konfirmasi (cuma kamu yang bisa, berlaku 10 menit).`,
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${PREFIX}${id}`).setLabel('Lanjut')
          .setStyle(ButtonStyle.Primary)).toJSON()],
        allowedMentions: { parse: [] },
      };
    },
    async handleButton(i) {
      if (!i.isButton?.() || !String(i.customId || '').startsWith(PREFIX)) return false;
      sweep();
      const id = String(i.customId).slice(PREFIX.length);
      const ticket = tickets.get(id);
      const privately = content => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      if (!ticket || ticket.guildId !== i.guildId || ticket.channelId !== i.channelId) {
        await privately('Tombolnya udah hangus. Ulangi permintaanmu ke Hengs ya.');
        return true;
      }
      if (ticket.requesterId !== i.user?.id) {
        await privately('Tombol ini bukan buat kamu. Mention Hengs sendiri kalau mau kirim atau catat sesuatu.');
        return true;
      }
      tickets.delete(id);
      const deps = { guildAccess };
      if (ticket.kind === 'meme' || ticket.kind === 'news') {
        const proxy = withOptions(i, ticket.kind === 'meme' ? { subcommand: 'meme', attachments: { gambar: ticket.attachment } }
          : { subcommand: 'berita', strings: { link: ticket.link } });
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        await i.editReply(sharing ? await sharing.submit(proxy) : { content: 'Fitur kirim belum aktif di versi ini.' });
      } else if (ticket.kind === 'scrim_catat') {
        await scrim.preview(withOptions(i, { strings: { lawan: ticket.lawan, hasil: ticket.hasil, catatan: ticket.catatan || null },
          attachments: { ss: ticket.attachment || null } }), deps);
      } else if (ticket.kind === 'scrim_hapus') {
        await scrim.remove(i, deps);
      }
      return true;
    },
  };
}

module.exports = { PREFIX, TTL, createChatActions, firstImage, readKirim, withOptions };
