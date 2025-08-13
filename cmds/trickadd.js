const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const { getServerConfig } = require('../utils/config.js');
const { log } = require('../utils/logging.js');

function capitalise(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = regex.exec(dateStr);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return dateStr;
}

const config = require('../utils/config.js');
function buildAcronym(name) {
  const words = name.split(/\s+/);
  let acronym = '';
  for (const word of words) {
    const acro = config.getAcronym ? config.getAcronym(word) : null;
    acronym += acro ? acro : word[0].toUpperCase();
  }
  return acronym;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trickadd')
    .setDescription('Adds a trick to the database')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Name of the trick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('creator')
        .setDescription('Creators (comma separated)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('type')
        .setDescription(`Trick's type`)
        .setRequired(true)
        .addChoices(
          { name: 'Glitchless', value: 'Glitchless' },
          { name: 'Misc', value: 'Misc' }
        ))
    .addStringOption(option =>
      option.setName('zone')
        .setDescription(`Trick's zone`)
        .setRequired(true)
        .addChoices(
          { name: 'Mid Air', value: 'Mid Air' },
          { name: 'Ground', value: 'Ground' }
        ))
    .addStringOption(option =>
      option.setName('aliases')
        .setDescription('Nicknames (comma separated)'))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date (DD/MM/YYYY)'))
    .addStringOption(option =>
      option.setName('video_url')
        .setDescription('Video (URL)'))
    .addAttachmentOption(option =>
      option.setName('video')
        .setDescription('Video (attachment)')),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const serverConfig = getServerConfig(guildId);
    const verifierId = serverConfig.verifierId;
    if (!verifierId || !interaction.member.roles.cache.has(verifierId)) {
      return interaction.reply({ content: 'Only Trick Verifiers can add new tricks.', flags: 64 });
    }

    const nameRaw = interaction.options.getString('name');
    const name = capitalise(nameRaw.trim());

    const creatorRaw = interaction.options.getString('creator');
    const creators = creatorRaw.split(',').map(c => c.trim());

    const type = interaction.options.getString('type');
    const zone = interaction.options.getString('zone');

    const aliasesRaw = interaction.options.getString('aliases');
    const aliases = aliasesRaw ? aliasesRaw.split(',').map(a => a.trim()) : null;

    const dateInput = interaction.options.getString('date');
    const date = formatDate(dateInput);

    const videoUrlInput = interaction.options.getString('video_url');
    const videoAttachment = interaction.options.getAttachment('video');

    if (!videoUrlInput && !videoAttachment) {
      return interaction.reply({ content: 'You must provide either a video URL or a video attachment.', flags: 64, });
    }

    let videoLink = videoUrlInput || null;
    if (videoAttachment) {
      try {
        const storageChannel = await interaction.client.channels.fetch(serverConfig.storageId);
        if (!storageChannel) {
          return interaction.reply({ content: 'Storage channel not configured.', flags: 64 });
        }
        const uploadedMessage = await storageChannel.send({
          files: [{ attachment: videoAttachment.url, name: videoAttachment.name }],
        });
        videoLink = uploadedMessage.attachments.first().url;
      } catch (err) {
        console.error('Video error:', err);
        return interaction.reply({ content: 'Failed to upload video attachment.', flags: 64 });
      }
    }

    let acronym = buildAcronym(name);
    if (zone === 'Mid Air') acronym = 'MA' + acronym;

    try {
      const insert = db.prepare(`
        INSERT INTO tricks (name, acronym, aliases, creator, date, type, zone, video)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insert.run(
        name,
        acronym,
        aliases ? JSON.stringify(aliases) : null,
        JSON.stringify(creators),
        date,
        type,
        zone,
        videoLink
      );
    } catch (error) {
      console.error('DB insert error:', error);
      return interaction.reply({ content: 'Failed to add trick to the database.', flags: 64 });
    }

    const logTrick = {
      name,
      acronym,
      aliases,
      creator: creators,
      date,
      type,
      zone,
      video: videoLink,
    };

    await log('add', logTrick, interaction.user, interaction.client);

    return interaction.reply({ content: `Added trick **${name}**.`, flags: 64 });
  },
};
