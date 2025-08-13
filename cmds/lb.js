const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../utils/db');
const { getCooldown } = require('../utils/config.js');

const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Displays the top trick creators')
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Filter by type')
        .addChoices(
          { name: 'Glitchless', value: 'Glitchless' },
          { name: 'Misc', value: 'Misc' }
        )
    )
    .addStringOption(opt =>
      opt.setName('zone')
        .setDescription('Filter by zone')
        .addChoices(
          { name: 'Mid Air', value: 'mid air' },
          { name: 'Ground', value: 'ground' }
        )
    )
    .addBooleanOption(opt =>
      opt.setName('visible')
        .setDescription('Toggle visibility')
    ),

  async execute(interaction) {
    const type = interaction.options.getString('type');
    const zone = interaction.options.getString('zone');
    const visible = interaction.options.getBoolean('visible') ?? false;

    if (visible) {
      const cdSecs = (typeof getCooldown === 'function') ? getCooldown('lb', false) : null;
      if (cdSecs) {
        const userExpiry = cooldowns.get(interaction.user.id) || 0;
        const now = Date.now();
        if (userExpiry > now) {
          const remaining = Math.ceil((userExpiry - now) / 1000);
          return interaction.reply({
            content: `Please wait ${remaining}s before using this command again.`, flags: 64 });
        }
      }
    }

    let query = 'SELECT creator FROM tricks';
    const conditions = [];
    const params = [];
    if (type) {
      conditions.push('LOWER(type) = ?');
      params.push(type.toLowerCase());
    }
    if (zone) {
      conditions.push('LOWER(zone) = ?');
      params.push(zone.toLowerCase());
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

    let rows;
    try {
      rows = db.prepare(query).all(...params);
    } catch (err) {
      console.error('DB query error:', err);
      return interaction.reply({ content: 'Failed to retrieve leaderboard data.', flags: 64 });
    }

    if (!rows || rows.length === 0) {
      return interaction.reply({ content: 'No tricks found with the given filters.', flags: 64 });
    }

    const counts = {};
    for (const r of rows) {
      let creators = [];
      if (r.creator) {
        try {
          const parsed = JSON.parse(r.creator);
          if (Array.isArray(parsed)) creators = parsed;
          else creators = [String(parsed)];
        } catch {
          if (typeof r.creator === 'string' && r.creator.includes(',')) {
            creators = r.creator.split(',').map(s => s.trim()).filter(Boolean);
          } else if (r.creator) {
            creators = [String(r.creator).trim()];
          }
        }
      }
      for (const c of creators) {
        if (!c) continue;
        counts[c] = (counts[c] || 0) + 1;
      }
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      return interaction.reply({ content: 'No creators found with the given filters.', flags: 64 });
    }

    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    let currentPage = 1;

    const typeDisplay = type ? (type.charAt(0).toUpperCase() + type.slice(1)) : 'All Types';
    const zoneDisplay = zone ? (zone.charAt(0).toUpperCase() + zone.slice(1)) : 'All Zones';

    const pluralLabel = n => (n === 1 ? '1 trick' : `${n} tricks`);

    function formatPage(page, showPageCount = true) {
      const startIndex = (page - 1) * pageSize;
      const pageEntries = sorted.slice(startIndex, startIndex + pageSize);
      const pageCountSuffix = showPageCount ? ` | Page ${page}/${totalPages}` : '';

      if (page === 1) {
        let out = `# Leaderboard\n-# ${typeDisplay}, ${zoneDisplay}${pageCountSuffix}\n`;

        if (pageEntries[0]) {
          const [n1, c1] = pageEntries[0];
          out += `## :first_place:  1. ${n1}: ${pluralLabel(c1)}\n`;
          out += `_ _\n`;
        }

        if (pageEntries[1]) {
          const [n2, c2] = pageEntries[1];
          out += `:second_place:  2. ${n2}: **${pluralLabel(c2)}**\n`;
          out += `_ _\n`;
        }

        if (pageEntries[2]) {
          const [n3, c3] = pageEntries[2];
          out += `:third_place:  3. ${n3}: **${pluralLabel(c3)}**\n`;
          out += `_ _\n`;
        }

        for (let i = 3; i < pageEntries.length; i++) {
          const rank = startIndex + i + 1;
          const [nameX, countX] = pageEntries[i];
          out += `${rank}. ${nameX}: **${pluralLabel(countX)}**\n`;
        }

        out += `_ _`;
        return out;
      }

      let out = `# Leaderboard\n-# ${typeDisplay}, ${zoneDisplay}${pageCountSuffix}\n`;
      out += `_ _\n`;
      for (let i = 0; i < pageEntries.length; i++) {
        const rank = startIndex + i + 1;
        const [nameX, countX] = pageEntries[i];
        out += `${rank}. ${nameX}: **${pluralLabel(countX)}**\n`;
      }
      out += `_ _`;
      return out;
    }

    function button(page) {
      const prev = new ButtonBuilder()
        .setCustomId(`lb_prev`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page <= 1);
      const next = new ButtonBuilder()
        .setCustomId(`lb_next`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page >= totalPages);
      return new ActionRowBuilder().addComponents(prev, next);
    }

    try {
      if (!visible) {
        return interaction.reply({ content: formatPage(currentPage, false), flags: 64 });
      }

      const replyMsg = await interaction.reply({
        content: formatPage(currentPage, true),
        components: [button(currentPage)],
        fetchReply: true
      });

      const cdSecs = (typeof getCooldown === 'function') ? getCooldown('lb', false) : null;
      if (cdSecs) cooldowns.set(interaction.user.id, Date.now() + cdSecs * 1000);

      const collector = replyMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120_000,
        filter: i => i.user.id === interaction.user.id
      });

      collector.on('collect', async i => {
        if (i.customId === 'lb_prev') {
          if (currentPage > 1) currentPage--;
          await i.update({ content: formatPage(currentPage, true), components: [button(currentPage)] });
        } else if (i.customId === 'lb_next') {
          if (currentPage < totalPages) currentPage++;
          await i.update({ content: formatPage(currentPage, true), components: [button(currentPage)] });
        } else {
          await i.deferUpdate();
        }
      });

      collector.on('end', async () => {
        try { await replyMsg.edit({ components: [] }); } catch (_) { }
      });

    } catch (err) {
      console.error('LB error:', err);
      return interaction.reply({ content: 'Failed to send the leaderboard.', flags: 64 });
    }
  }
};
