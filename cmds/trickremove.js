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
                .setDescription('Name, acronym, or alias of the trick (comma separated)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const serverConfig = getServerConfig(guildId);
        const verifierId = serverConfig.verifierId;

        if (!interaction.member.roles.cache.has(verifierId)) {
            return interaction.reply({ content: 'Only Trick Verifiers can remove tricks.', flags: 64 });
        }

        const inputNames = interaction.options.getString('name')
            .split(',')
            .map(n => n.trim().toLowerCase())
            .filter(n => n.length > 0);

        if (inputNames.length === 0) {
            return interaction.reply({ content: 'Please provide atleast one valid trick name.', flags: 64 });
        }

        const allTricks = db.prepare('SELECT * FROM tricks').all();
        const format = str => str.toLowerCase();

        const removedTricks = [];

        for (const inputName of inputNames) {
            const trick = allTricks.find(trick => {
                if (format(trick.name) === inputName) return true;
                if (trick.acronym && format(trick.acronym) === inputName) return true;
                if (trick.aliases) {
                    try {
                        const aliases = JSON.parse(trick.aliases);
                        if (aliases.some(a => format(a) === inputName)) return true;
                    } catch {
                        const aliases = trick.aliases.split(',').map(a => a.trim().toLowerCase());
                        if (aliases.includes(inputName)) return true;
                    }
                }
                return false;
            });

            if (!trick) {
                continue;
            }

            db.prepare('DELETE FROM tricks WHERE id = ?').run(trick.id);

            let parsedAliases = null;
            if (trick.aliases) {
                try {
                    parsedAliases = JSON.parse(trick.aliases);
                } catch {
                    parsedAliases = trick.aliases.split(',').map(a => a.trim());
                }
            }
            const logTrick = { ...trick, aliases: parsedAliases };
            await log('remove', logTrick, interaction.user, interaction.client);

            removedTricks.push(trick.name);
        }

        if (removedTricks.length === 0) {
            return interaction.reply({ content: 'No tricks removed.', flags: 64 });
        }

        const reply = removedTricks.length === 1
            ? `Removed trick **${removedTricks[0]}**.`
            : `Removed tricks **${removedTricks.join(', ')}**.`;

        return interaction.reply({ content: reply, flags: 64 });
    }
};
