const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../data/config.json');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`${client.user.tag} online`);

        const commands = [];

        const cmdsPath = path.join(__dirname, '..', 'cmds');
        const cmdFiles = fs.readdirSync(cmdsPath).filter(f => f.endsWith('.js'));
        for (const file of cmdFiles) {
            const cmd = require(path.join(cmdsPath, file));
            if (cmd.data) commands.push(cmd.data.toJSON());
        }

        const menusPath = path.join(__dirname, '..', 'menus');
        const menuFiles = fs.readdirSync(menusPath).filter(f => f.endsWith('.js'));
        for (const file of menuFiles) {
            const menu = require(path.join(menusPath, file));
            if (menu.data) commands.push(menu.data.toJSON());
        }

        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

        try {
            for (const guildId of Object.keys(config.servers)) {
                
                await rest.put(
                    Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                    { body: [] }
                );
                
                await rest.put(
                    Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                    { body: commands }
                );

                console.log(`Registered ${commands.length} commands in guild ${guildId}`);
            }
        } catch (error) {
            console.error('Command registration error:', error);
        }
    }
};