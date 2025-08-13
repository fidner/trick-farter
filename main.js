require('dotenv').config({ path: './data/.env' });
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'cmds');
const commandFiles = fs.existsSync(commandsPath) ? fs.readdirSync(commandsPath).filter(file => file.endsWith('.js')) : [];

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.warn(`${file} is missing 'data' or 'execute'`);
    }
}

const menusPath = path.join(__dirname, 'menus');
const menuFiles = fs.existsSync(menusPath) ? fs.readdirSync(menusPath).filter(file => file.endsWith('.js')) : [];

for (const file of menuFiles) {
    const menu = require(path.join(menusPath, file));
    if ('data' in menu && 'execute' in menu) {
        client.commands.set(menu.data.name, menu);
    } else {
        console.warn(`${file} is missing 'data' or 'execute'`);
    }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.existsSync(eventsPath) ? fs.readdirSync(eventsPath).filter(file => file.endsWith('.js')) : [];

for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

client.login(process.env.TOKEN);
