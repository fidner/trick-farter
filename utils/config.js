const path = require('path');
const fs = require('fs');
const configPath = path.join(__dirname, '..', 'data', 'config.json');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function reloadConfig() {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function getServerConfig(guildId) {
    return config.servers[guildId] || null;
}

function getCooldown(commandName, isEphemeral = false) {
    const type = isEphemeral ? 'ephemeral' : 'nonEphemeral';
    return config.cooldowns[type][commandName] ?? null;
}

function getAcronym(trickName) {
    return config.acronyms[trickName] || null;
}

function isLoggingEnabled(logType) {
    if (!config.logging.enabled) return false;
    return Boolean(config.logging[logType]);
}

module.exports = {
    reloadConfig,
    getServerConfig,
    getCooldown,
    getAcronym,
    isLoggingEnabled
};
