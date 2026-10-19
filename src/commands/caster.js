'use strict';

// /caster: member nulis momen, Hengs balikin suara caster AI. Logikanya di src/caster/service.js.
const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  SlashCommandBuilder, escapeMarkdown,
} = require('discord.js');
const { PERSONAS, DEFAULT_PERSONA } = require('../caster/personas');
const { MESSAGES } = require('../caster/service');

const PREFIX = 'hengs-caster:';
const quiet = { allowedMentions: { parse: [] } };
// Tag suara (<sigh>, dll) cuma buat TTS; teks yang tampil cuma kata-katanya.
const shown = line => escapeMarkdown(line.replace(/<[^<>]*>/g, ' ').replace(/\s+/g, ' ').trim());
const ephemeral = content => ({ content, flags: MessageFlags.Ephemeral, ...quiet });
const closed = content => ({ content, components: [], attachments: [], ...quiet });
const audio = draft => new AttachmentBuilder(draft.wav, { name: `casterin-${draft.personaId}.wav` });

function buttons(id) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}send:${id}`).setLabel('Kirim ke channel').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${PREFIX}redo:${id}`).setLabel('Ulang').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}cancel:${id}`).setLabel('Batal').setStyle(ButtonStyle.Danger),
  )];
}

function preview(draft) {
  return {
    content: [`🎙️ **Preview Casterin · ${draft.label}**`, `> ${shown(draft.line)}`,
      '-# Cuma kamu yang lihat. Hangus 10 menit. Kirim = diposting di channel ini.'].join('\n'),
    files: [audio(draft)], attachments: [], components: buttons(draft.id), ...quiet,
  };
}

function publicPost(draft) {
  return {
    content: [`🎙️ **Casterin · ${draft.label}** · dipesan <@${draft.userId}>`, `> ${shown(draft.line)}`,
      '-# Suara AI, persona fiksi'].join('\n'),
    files: [audio(draft)], ...quiet,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('caster')
    .setDescription('Caster AI neriakin momen kamu')
    .addStringOption(option => option
      .setName('momen')
      .setDescription('Contoh: Henry savage pakai Ling')
      .setRequired(true)
      .setMaxLength(150))
    .addStringOption(option => option
      .setName('persona')
      .setDescription('Gaya caster (default Bang Jago Esport)')
      .setRequired(false)
      .addChoices(...Object.entries(PERSONAS).map(([value, persona]) => ({ name: persona.label, value })))),

  async execute(interaction, { caster }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await caster.generate({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      personaId: interaction.options.getString('persona') || DEFAULT_PERSONA,
      momen: interaction.options.getString('momen', true),
      origin: interaction,
    });
    await interaction.editReply(result.ok ? preview(result.draft) : closed(result.message));
  },

  async handleButton(interaction, { caster, guildAccess }) {
    const [, action, id] = String(interaction.customId || '').split(':');
    const userId = interaction.user?.id;
    if (guildAccess?.classify(interaction.guildId)?.kind !== 'home') {
      return interaction.reply(ephemeral(MESSAGES.CASTER_DRAFT_EXPIRED));
    }
    if (action === 'send') {
      const draft = caster.take(id, userId);
      if (!draft) return interaction.reply(ephemeral(MESSAGES.CASTER_DRAFT_EXPIRED));
      try {
        await interaction.reply(publicPost(draft));
      } catch {
        console.error('[caster] CASTER_SEND_FAILED');
        const notice = ephemeral(MESSAGES.CASTER_SEND_FAILED);
        await (interaction.replied || interaction.deferred ? interaction.followUp(notice) : interaction.reply(notice))
          .catch(() => {});
        return undefined;
      }
      if (draft.origin) await draft.origin.editReply(closed('Terkirim ✅')).catch(() => {});
      return undefined;
    }
    if (action === 'cancel') {
      const draft = caster.take(id, userId);
      return interaction.update(closed(draft ? 'Dibatalkan.' : MESSAGES.CASTER_DRAFT_EXPIRED));
    }
    if (action === 'redo') {
      const draft = caster.get(id, userId);
      if (!draft) return interaction.update(closed(MESSAGES.CASTER_DRAFT_EXPIRED));
      await interaction.deferUpdate();
      const result = await caster.generate({ guildId: draft.guildId, channelId: draft.channelId, userId,
        personaId: draft.personaId, momen: draft.momen, origin: interaction });
      return result.ok ? interaction.editReply(preview(result.draft)) : interaction.followUp(ephemeral(result.message));
    }
    return interaction.reply(ephemeral(MESSAGES.CASTER_DRAFT_EXPIRED));
  },
};
