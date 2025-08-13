const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const { getServerConfig } = require('../utils/config.js');
const { log } = require('../utils/logging.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trickremove')
        .setDescription('Removes a trick from the database')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name, acronym, or alias of the trick')
                .setRequired(true)
        ),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const serverConfig = getServerConfig(guildId);
        const verifierId = serverConfig.verifierId;

        if (!interaction.member.roles.cache.has(verifierId)) {
            return interaction.reply({ content: 'Only Trick Verifiers can remove tricks.', flags: 64 });
        }

        const inputName = interaction.options.getString('name').toLowerCase();

        const allTricks = db.prepare('SELECT * FROM tricks').all();

        const normalize = str => str.toLowerCase();

        const trick = allTricks.find(trick => {
            if (normalize(trick.name) === inputName) return true;
            if (trick.acronym && normalize(trick.acronym) === inputName) return true;
            if (trick.aliases) {
                try {
                    const aliases = JSON.parse(trick.aliases);
                    if (aliases.some(a => normalize(a) === inputName)) return true;
                } catch {
                    const aliases = trick.aliases.split(',').map(a => a.trim().toLowerCase());
                    if (aliases.includes(inputName)) return true;
                }
            }
            return false;
        });

        if (!trick) {
            return interaction.reply({ content: `Trick **${inputName}** not found.`, flags: 64 });
        }

        const deleteStmt = db.prepare('DELETE FROM tricks WHERE id = ?');
        deleteStmt.run(trick.id);

        let parsedAliases = null;
        if (trick.aliases) {
            try {
                parsedAliases = JSON.parse(trick.aliases);
            } catch {
                parsedAliases = trick.aliases.split(',').map(a => a.trim());
            }
        }
        const logTrick = {
            ...trick,
            aliases: parsedAliases,
        };

        await log('remove', logTrick, interaction.user, interaction.client);

        return interaction.reply({ content: `Removed trick **${trick.name}**.`, flags: 64 });
    }
};