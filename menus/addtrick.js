const { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const config = require('../data/config.json');
const acronymMap = config.acronyms || {};

function buildAcronym(name) {
  const words = name.split(/\s+/).filter(Boolean);
  let acronym = '';
  for (const w of words) {
    const key = Object.keys(acronymMap).find(k => k.toLowerCase() === w.toLowerCase());
    if (key) acronym += acronymMap[key];
    else acronym += (w[0] || '').toUpperCase();
  }
  return acronym;
}

function formatType(input) {
  if (!input) return null;
  const lower = input.toLowerCase();
  if (lower === 'glitchless' || lower === 'g') return 'Glitchless';
  if (lower === 'misc' || lower === 'm') return 'Misc';
  return null;
}

function formatZone(input) {
  if (!input) return null;
  const lower = input.toLowerCase();
  if (lower === 'mid air' || lower === 'ma') return 'Mid Air';
  if (lower === 'ground' || lower === 'g') return 'Ground';
  return null;
}

function capitalise(str) {
  return str.replace(/\b\w/g, char => char.toUpperCase());
}

const videoDataCache = new Map();

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Add Trick')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const guildConfig = config.servers[interaction.guild.id];
    if (!guildConfig || !guildConfig.verifierId) {
      return interaction.reply({ content: 'Verifier role not configured.', flags: 64 });
    }

    if (!interaction.member.roles.cache.has(guildConfig.verifierId)) {
      return interaction.reply({ content: 'Only Trick Verifiers can add new tricks.', flags: 64 });
    }

    const message = interaction.targetMessage;

    let videoUrl = null;
    const videoAttachment = message.attachments.find(att => {
      const type = att.contentType || '';
      return type.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)$/i.test(att.name || '');
    });

    if (videoAttachment) {
      videoUrl = videoAttachment.url;
    } else {
      const urlMatch = message.content.match(/https?:\/\/\S+/);
      if (urlMatch) {
        videoUrl = urlMatch[0];
      }
    }

    if (!videoUrl) {
      return interaction.reply({ content: 'No video attachment or link found in the message.', flags: 64 });
    }

    const modalId = `addTrickModal:${interaction.user.id}:${Date.now()}`;

    videoDataCache.set(modalId, {
      videoUrl,
      messageDate: message.createdAt,
      messageId: message.id,
      userId: interaction.user.id,
    });

    setTimeout(() => videoDataCache.delete(modalId), 5 * 60 * 1000);

    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle('Add a New Trick');

    const nameInput = new TextInputBuilder()
      .setCustomId('nameInput')
      .setLabel('Name')
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setRequired(true)
      .setPlaceholder('i.e. Paintball Wall');

    const creatorInput = new TextInputBuilder()
      .setCustomId('creatorInput')
      .setLabel('Creators')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('i.e. funder, tea');

    const aliasesInput = new TextInputBuilder()
      .setCustomId('aliasesInput')
      .setLabel('Aliases (optional)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('i.e. DoomFly');

    const typeInput = new TextInputBuilder()
      .setCustomId('typeInput')
      .setLabel('Type (g/m)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const zoneInput = new TextInputBuilder()
      .setCustomId('zoneInput')
      .setLabel('Zone (ma/g)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(creatorInput),
      new ActionRowBuilder().addComponents(aliasesInput),
      new ActionRowBuilder().addComponents(typeInput),
      new ActionRowBuilder().addComponents(zoneInput),
    );

    await interaction.showModal(modal);
  },

  videoDataCache,
  buildAcronym,
  formatType,
  formatZone,
  capitalise,
};
