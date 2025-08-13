const addTrickMenu = require('../menus/addtrick.js');
const db = require('../utils/db.js');
const { log } = require('../utils/logging.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isModalSubmit()) {
      if (typeof interaction.customId === 'string' && interaction.customId.startsWith('addTrickModal:')) {
        const modalId = interaction.customId;
        const videoData = addTrickMenu.videoDataCache.get(modalId);
        if (!videoData) {
          return interaction.reply({ content: 'Session expired or no video data found.', flags: 64 });
        }
        try {
          const rawName = (interaction.fields.getTextInputValue('nameInput') || '').trim();
          const creatorRaw = (interaction.fields.getTextInputValue('creatorInput') || '').trim();
          const aliasesRaw = (interaction.fields.getTextInputValue('aliasesInput') || '').trim();
          const typeRaw = (interaction.fields.getTextInputValue('typeInput') || '').trim();
          const zoneRaw = (interaction.fields.getTextInputValue('zoneInput') || '').trim();

          const name = addTrickMenu.capitalise(rawName);
          const type = addTrickMenu.formatType(typeRaw);
          const zone = addTrickMenu.formatZone(zoneRaw);

          if (!type) return interaction.reply({ content: 'Please enter Glitchless/Misc or g/m.', flags: 64 });
          if (!zone) return interaction.reply({ content: 'Please enter Mid Air/Ground or ma/g.', flags: 64 });

          const creators = creatorRaw.split(',').map(s => s.trim()).filter(Boolean);
          if (creators.length === 0) return interaction.reply({ content: 'Please enter atleast one creator.', flags: 64 });

          const aliases = aliasesRaw ? aliasesRaw.split(',').map(s => s.trim()).filter(Boolean) : null;
          let acronym = addTrickMenu.buildAcronym(name);
          if (zone && zone.toLowerCase() === 'mid air') {
            acronym = 'MA' + acronym;
          }

          const d = videoData.messageDate;
          const formattedDate = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
          const videoUrl = videoData.videoUrl;

          const insert = db.prepare(`INSERT INTO tricks (name, acronym, aliases, creator, date, type, zone, video) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
          insert.run(
            name,
            acronym,
            aliases ? JSON.stringify(aliases) : null,
            JSON.stringify(creators),
            formattedDate,
            type,
            zone,
            videoUrl
          );

          addTrickMenu.videoDataCache.delete(modalId);

          const logTrick = {
            name,
            acronym,
            aliases,
            creator: creators,
            date: formattedDate,
            type,
            zone,
            video: videoUrl,
          };

          await log('add', logTrick, interaction.user, client);

          return interaction.reply({ content: `Added trick **${name}**.`, flags: 64 });
        } catch (err) {
          console.error('Modal submission error:', err);
          if (interaction.replied || interaction.deferred) {
            return interaction.followUp({ content: 'An error occurred while processing your request.', flags: 64 });
          } else {
            return interaction.reply({ content: 'An error occurred while processing your request.', flags: 64 });
          }
        }
      }
    }

    if (!interaction.isCommand() && !interaction.isContextMenuCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`No command handler found for ${interaction.commandName}`);
      return;
    }
    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`Executing ${interaction.commandName} error:`, error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'Error executing this command.', flags: 64 });
      } else {
        await interaction.reply({ content: 'Error executing this command.', flags: 64 });
      }
    }
  }
};