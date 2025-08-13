const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const config = require('../data/config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trick')
    .setDescription('Display trick information')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Name, acronym, or alias of the trick')
        .setRequired(true))
    .addBooleanOption(opt =>
      opt.setName('visible')
        .setDescription('Toggle visibility')
    ),

  cooldowns: new Map(),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const serverConfig = config.servers[guildId];
    if (!serverConfig) {
      return interaction.reply({ content: 'This server is not configured.', flags: 64 });
    }

    const nameInput = interaction.options.getString('name').toLowerCase();
    const visible = interaction.options.getBoolean('visible') ?? false;
    const ephemeral = !visible;

    if (!ephemeral) {
      const userCooldowns = this.cooldowns;
      const key = `${interaction.user.id}`;
      const now = Date.now();
      const cd = (config.cooldowns.nonEphemeral?.trick || 5) * 1000;

      if (userCooldowns.has(key)) {
        const expiration = userCooldowns.get(key);
        if (now < expiration) {
          const remaining = Math.ceil((expiration - now) / 1000);
          return interaction.reply({ content: `Please wait ${remaining}s before using this command again.`, flags: 64 });
        }
      }
      userCooldowns.set(key, now + cd);
      setTimeout(() => userCooldowns.delete(key), cd);
    }

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
    const trick = getTrick.get(nameInput, nameInput, nameInput);

    if (!trick) {
      return interaction.reply({ content: `No trick found with name **${nameInput}**.`, flags: 64 });
    }

    const aliases = trick.aliases ? JSON.parse(trick.aliases) : null;
    const creators = trick.creator ? JSON.parse(trick.creator) : ['Unknown'];

    let response = `# ${trick.name}\n-# ${trick.type}, ${trick.zone}\n\n` +
      `**Acronym**: ${trick.acronym}\n`;

    if (aliases && aliases.length > 0) {
      response += `**Aliases**: ${aliases.join(', ')}\n`;
    }

    response += `**Creator(s)**: ${creators.join(', ')}\n`;

    if (trick.date) {
      response += `**Date:** ${trick.date}\n`;
    }

    response += `[**Video**](${trick.video})\n\n_ _`;

    return interaction.reply({ content: response, ephemeral });
  }
};
