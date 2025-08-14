const config = require('../data/config.json');

async function log(type, trickOrOldNew, user, client) {
  if (!config.logging?.enabled) return;

  if (
    (type === 'add' && !config.logging.logAdd) ||
    (type === 'remove' && !config.logging.logRemove) ||
    (type === 'update' && !config.logging.logUpdate)
  ) {
    return;
  }

  const actionVerbs = {
    add: 'Added',
    update: 'Updated',
    remove: 'Removed',
  };

  const safeArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      return JSON.parse(val);
    } catch {
      return String(val)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
    }
  };

  if (type === 'update') {
    const { old, new: updated } = trickOrOldNew;

    const formatChange = (oldVal, newVal, formatter = v => v) => {
      const oldStr = (oldVal === null || oldVal === undefined || oldVal === '' ? 'None' : formatter(oldVal));
      const newStr = (newVal === null || newVal === undefined || newVal === '' ? 'None' : formatter(newVal));
      if (oldStr === newStr) return oldStr;
      return `${oldStr} --> ${newStr}`;
    };

    const arrayToString = arr => {
      const parsed = safeArray(arr);
      return parsed.length ? parsed.join(', ') : 'None';
    };

    let logMessage = '# Trick Updated\n' +
      `**Name**: ${formatChange(old.name, updated.name)}\n` +
      `**Acronym**: ${formatChange(old.acronym, updated.acronym)}\n` +
      `**Aliases**: ${formatChange(arrayToString(old.aliases), arrayToString(updated.aliases))}\n` +
      `**Creator(s)**: ${formatChange(arrayToString(old.creator), arrayToString(updated.creator))}\n` +
      `**Date**: ${formatChange(old.date || null, updated.date || null)}\n` +
      `**Type**: ${formatChange(old.type, updated.type)}\n` +
      `**Zone**: ${formatChange(old.zone, updated.zone)}\n`;

    if (old.video !== updated.video) {
      logMessage += `[**Old Video**](${old.video || 'None'})\n` +
                    `[**New Video**](${updated.video || 'None'})\n\n`;
    } else {
      logMessage += `[**Video**](${updated.video || 'None'})\n\n`;
    }

    logMessage += `-# ${actionVerbs[type]} by (${user.id})`;

    for (const [guildId, serverConfig] of Object.entries(config.servers)) {
      if (!serverConfig.loggingId) continue;
      try {
        const channel = await client.channels.fetch(serverConfig.loggingId);
        if (channel) await channel.send(logMessage);
      } catch (err) {
        console.error(`Failed to send log to channel ${serverConfig.loggingId} in guild ${guildId}:`, err);
      }
    }
    return;
  }
  
  const trick = trickOrOldNew;
  const aliasesStr = safeArray(trick.aliases).length ? safeArray(trick.aliases).join(', ') : null;
  const creatorStr = safeArray(trick.creator).length ? safeArray(trick.creator).join(', ') : 'Unknown';
  const dateStr = trick.date || null;

  let title = '';
  if (type === 'add') title = '# Trick Added';
  else if (type === 'remove') title = '# Trick Removed';

  let logMessage = `${title}\n` +
    `**Name**: ${trick.name}\n` +
    `**Acronym**: ${trick.acronym}\n` +
    (aliasesStr ? `**Aliases**: ${aliasesStr}\n` : '') +
    `**Creator(s)**: ${creatorStr}\n` +
    (dateStr ? `**Date**: ${dateStr}\n` : '') +
    `**Type**: ${trick.type}\n` +
    `**Zone**: ${trick.zone}\n` +
    `[**Video**](${trick.video || 'None'})\n\n` +
    `-# ${actionVerbs[type]} by (${user.id})`;

  for (const [guildId, serverConfig] of Object.entries(config.servers)) {
    if (!serverConfig.loggingId) continue;
    try {
      const channel = await client.channels.fetch(serverConfig.loggingId);
      if (channel) await channel.send(logMessage);
    } catch (err) {
      console.error(`Failed to send log to channel ${serverConfig.loggingId} in guild ${guildId}:`, err);
    }
  }
}

module.exports = { log };
