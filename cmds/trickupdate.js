const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const { getServerConfig } = require('../utils/config.js');
const { log } = require('../utils/logging.js');
const config = require('../data/config.json');

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trickupdate')
    .setDescription('Updates a trick in the database')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Name, alias, or acronym of the trick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('newname')
        .setDescription('New trick name'))
    .addStringOption(option =>
      option.setName('aliases')
        .setDescription('New aliases (comma separated)'))
    .addStringOption(option =>
      option.setName('creator')
        .setDescription('New creators (comma separated)'))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('New date (DD/MM/YYYY)'))
    .addStringOption(option =>
      option.setName('type')
        .setDescription(`Trick's new type`)
        .addChoices(
          { name: 'Glitchless', value: 'Glitchless' },
          { name: 'Misc', value: 'Misc' }
        ))
    .addStringOption(option =>
      option.setName('zone')
        .setDescription(`Trick's new zone`)
        .addChoices(
          { name: 'Mid Air', value: 'Mid Air' },
          { name: 'Ground', value: 'Ground' }
        ))
    .addStringOption(option =>
      option.setName('video_url')
        .setDescription('New video (URl))'))
    .addAttachmentOption(option =>
      option.setName('video')
        .setDescription('New video (attachment)')),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const serverConfig = getServerConfig(guildId);
    const verifierId = serverConfig.verifierId;
    if (!verifierId || !interaction.member.roles.cache.has(verifierId)) {
      return interaction.reply({ content: 'Only Trick Verifiers can update tricks.', flags: 64 });
    }

    const nameInput = interaction.options.getString('name').toLowerCase();

    const getTrick = db.prepare(`
      SELECT * FROM tricks 
      WHERE LOWER(name) = ? 
         OR LOWER(acronym) = ? 
         OR EXISTS (
           SELECT 1 FROM json_each(aliases) 
           WHERE LOWER(value) = ?
         )
      LIMIT 1
    `);
    const existing = getTrick.get(nameInput, nameInput, nameInput);

    if (!existing) {
      return interaction.reply({ content: `Trick **${nameInput}** not found.`, flags: 64 });
    }

    const oldTrick = {
      name: existing.name,
      acronym: existing.acronym,
      aliases: existing.aliases ? JSON.parse(existing.aliases) : null,
      creator: existing.creator ? JSON.parse(existing.creator) : null,
      date: existing.date,
      type: existing.type,
      zone: existing.zone,
      video: existing.video,
    };

    const rawNewName = interaction.options.getString('newname');
    const newName = rawNewName ? capitalise(rawNewName.trim()) : existing.name;
    const aliasesRaw = interaction.options.getString('aliases');
    const newAliases = aliasesRaw
      ? aliasesRaw.split(',').map(s => s.trim()).filter(Boolean)
      : oldTrick.aliases;
    const creatorRaw = interaction.options.getString('creator');
    const newCreators = creatorRaw
      ? creatorRaw.split(',').map(s => s.trim()).filter(Boolean)
      : oldTrick.creator;
    const dateRaw = interaction.options.getString('date');
    const newDate = dateRaw ? formatDate(dateRaw) : oldTrick.date;
    const newType = interaction.options.getString('type') ?? oldTrick.type;
    const newZone = interaction.options.getString('zone') ?? oldTrick.zone;

    let newVideoUrl = oldTrick.video;
    const videoAttachment = interaction.options.getAttachment('video');
    const videoUrlInput = interaction.options.getString('video_url');
    if (videoAttachment) {
      try {
        const storageChannel = await interaction.client.channels.fetch(serverConfig.storageId);
        if (!storageChannel) {
          return interaction.reply({ content: 'Storage channel not found.', flags: 64 });
        }
        const uploadedMessage = await storageChannel.send({
          files: [{ attachment: videoAttachment.url, name: videoAttachment.name }],
        });
        newVideoUrl = uploadedMessage.attachments.first().url;
      } catch (err) {
        console.error('Video upload error:', err);
        return interaction.reply({ content: 'Failed to upload video attachment.', flags: 64 });
      }
    } else if (videoUrlInput) {
      newVideoUrl = videoUrlInput;
    }

    let newAcronym = buildAcronym(newName);
    if (newZone === 'Mid Air') {
      newAcronym = 'MA' + newAcronym;
    }

    const updatedTrick = {
      name: newName,
      acronym: newAcronym,
      aliases: newAliases,
      creator: newCreators,
      date: newDate,
      type: newType,
      zone: newZone,
      video: newVideoUrl,
    };

    const updateStmt = db.prepare(`
      UPDATE tricks
      SET name = ?, acronym = ?, aliases = ?, creator = ?, date = ?, type = ?, zone = ?, video = ?
      WHERE id = ?
    `);

    try {
      updateStmt.run(
        newName,
        newAcronym,
        newAliases ? JSON.stringify(newAliases) : null,
        JSON.stringify(newCreators),
        newDate,
        newType,
        newZone,
        newVideoUrl,
        existing.id
      );
    } catch (err) {
      console.error('DB update error:', err);
      return interaction.reply({ content: 'Failed to update trick.', flags: 64 });
    }

    await log('update', { old: oldTrick, new: updatedTrick }, interaction.user, interaction.client);

    return interaction.reply({ content: `Updated trick **${newName}**.`, flags: 64 });
  },
};