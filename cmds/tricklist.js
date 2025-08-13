const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, } = require('discord.js');
const db = require('../utils/db');
const config = require('../data/config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tricklist')
    .setDescription('Displays lists of tricks')
    .addStringOption(opt =>
      opt.setName('creator')
        .setDescription('Filter by creator'))
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Filter by type')
        .addChoices(
          { name: 'Glitchless', value: 'Glitchless' },
          { name: 'Misc', value: 'Misc' }
        ))
    .addStringOption(opt =>
      opt.setName('zone')
        .setDescription('Filter by zone')
        .addChoices(
          { name: 'Mid Air', value: 'Mid Air' },
          { name: 'Ground', value: 'Ground' }
        ))
    .addBooleanOption(opt =>
      opt.setName('visible')
        .setDescription('Toggle visibility'))
    .addBooleanOption(opt =>
      opt.setName('file')
        .setDescription('UNDER CONSTRUCTION')),

  cooldowns: new Map(),

  _parseArrayField(raw) {
    if (!raw && raw !== '') return [];
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw !== 'string') return [String(raw)];
    raw = raw.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
      return [String(parsed)];
    } catch {
      if (raw.includes(',')) {
        return raw.split(',').map(s => s.trim()).filter(Boolean);
      }
      return [raw];
    }
  },

  _formatDate(d) {
    if (!d || d.toString().trim() === '') return 'No date';
    return d;
  },

  _buildHeader({ creatorDisplay, creatorFilter, zoneFilter, typeFilter }) {
    if (!creatorFilter && !zoneFilter && !typeFilter) {
      return 'All Tricks';
    }

    const parts = [];

    if (creatorFilter) {
      const c = creatorDisplay || creatorFilter;
      parts.push(`${c}'s`);
    }
    if (zoneFilter) parts.push(zoneFilter);
    if (typeFilter) parts.push(typeFilter);

    return `${parts.join(' ')} Tricks`.trim();
  },

  _formatBody(trick, showCreator = true) {
    const aliasesArr = module.exports._parseArrayField(trick.aliases);
    const creatorsArr = module.exports._parseArrayField(trick.creator);

    const parts = [];
    if (trick.acronym) parts.push(trick.acronym);

    if (aliasesArr.length > 0) {
      parts.push(aliasesArr.join(', '));
    }

    let creatorPart = '';
    if (showCreator) {
      if (creatorsArr.length > 0) creatorPart = creatorsArr.join(', ');
      else creatorPart = 'Unknown';
    }

    const datePart = module.exports._formatDate(trick.date);

    const trailingParts = [];
    if (parts.length > 0) trailingParts.push(parts.join(', '));
    if (showCreator) trailingParts.push(creatorPart);
    trailingParts.push(datePart);

    return `- ${trick.name}\n  - ${trailingParts.join(' **|** ')}`;
  },

  _groupTricks(rawRows) {
    const typesOrder = ['Glitchless', 'Misc'];
    const zonesOrder = ['Mid Air', 'Ground'];
    const groups = [];

    for (const t of typesOrder) {
      for (const z of zonesOrder) {
        groups.push({ type: t, zone: z, tricks: [] });
      }
    }

    for (const r of rawRows) {
      const t = r.type || 'Misc';
      const z = r.zone || 'Ground';
      const group = groups.find(g => g.type.toLowerCase() === t.toLowerCase() && g.zone.toLowerCase() === z.toLowerCase());
      if (group) group.tricks.push(r);
    }

    return groups;
  },

  _buildVisiblePages(groups, headerStr, totalTrickCount, creatorFilter) {
    const typeTotals = {};
    for (const g of groups) {
      typeTotals[g.type] = (typeTotals[g.type] || 0) + g.tricks.length;
    }

    const pages = [];

    const buildGroupBlock = (grp, tricksSlice, typeTotal, groupCount) => {
      const lines = [];
      lines.push(`__                                __`);
      lines.push(`## ${grp.type}`);
      lines.push(`-# ${typeTotal} ${typeTotal === 1 ? 'trick' : 'tricks'}`);
      lines.push(`__                                __`);
      lines.push(`**${grp.zone}**`);
      lines.push(`-# ${groupCount} ${groupCount === 1 ? 'trick' : 'tricks'}`);
      lines.push(`_ _`);

      const showCreatorForEach = !creatorFilter;
      for (const t of tricksSlice) {
        const creatorsArr = module.exports._parseArrayField(t.creator);
        const showCreator = creatorsArr.length > 1 ? true : showCreatorForEach;
        lines.push(module.exports._formatBody(t, showCreator));
      }
      return lines.join('\n');
    };

    let currentLines = [];
    let remaining = 10;

    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      const count = grp.tricks.length;
      if (count === 0) continue;

      const typeTotal = typeTotals[grp.type] || 0;

      if (count <= remaining) {
        currentLines.push({ grp, slice: grp.tricks, typeTotal, groupCount: count });
        remaining -= count;
        if (remaining === 0) {
          pages.push({ blocks: currentLines });
          currentLines = [];
          remaining = 10;
        }
        continue;
      }

      if (count > 10) {
        if (currentLines.length > 0) {
          pages.push({ blocks: currentLines });
          currentLines = [];
          remaining = 10;
        }

        let idx = 0;
        while (idx < count) {
          const slice = grp.tricks.slice(idx, idx + 10);
          pages.push({ blocks: [{ grp, slice, typeTotal, groupCount: grp.tricks.length }] });
          idx += 10;
        }
        currentLines = [];
        remaining = 10;
        continue;
      }

      if (count > remaining && currentLines.length > 0) {
        pages.push({ blocks: currentLines });
        currentLines = [];
        remaining = 10;
      }

      if (count <= remaining) {
        currentLines.push({ grp, slice: grp.tricks, typeTotal, groupCount: count });
        remaining -= count;
        if (remaining === 0) {
          pages.push({ blocks: currentLines });
          currentLines = [];
          remaining = 10;
        }
      }
    }

    if (currentLines.length > 0) pages.push({ blocks: currentLines });

    const rendered = pages.map((pageObj) => {
      const lines = [];
      for (let i = 0; i < pageObj.blocks.length; i++) {
        const { grp, slice, typeTotal, groupCount } = pageObj.blocks[i];
        const fullBlock = buildGroupBlock(grp, slice, typeTotal, groupCount);

        if (i > 0) {
          const prevGrp = pageObj.blocks[i - 1].grp;
          if (prevGrp.type === grp.type) {
            const parts = fullBlock.split('\n');
            if (parts.length >= 7) {
              const newParts = [];
              newParts.push(parts[0]);
              newParts.push(parts[3]);
              newParts.push(parts[4]);
              newParts.push(parts[5]);
              newParts.push(...parts.slice(6));
              lines.push(newParts.join('\n'));
              continue;
            }
          }
        }
        lines.push(fullBlock);
      }
      return lines.join('\n');
    });
    return rendered;
  },

  _buildEphemeralMessages(groups, headerStr, totalTrickCount, creatorFilter) {
    const MAX = 2000;
    const messages = [];
    const topHeader = `# ${headerStr}\n-# ${totalTrickCount} ${totalTrickCount === 1 ? 'trick' : 'tricks'}\n_ _`;

    const typeTotals = {};
    for (const g of groups) {
      typeTotals[g.type] = (typeTotals[g.type] || 0) + g.tricks.length;
    }

    const categories = [];
    for (const g of groups) {
      let cat = categories.find(c => c.type === g.type);
      if (!cat) {
        cat = { type: g.type, typeTotal: typeTotals[g.type] || 0, zones: [] };
        categories.push(cat);
      }
      const zoneTricks = g.tricks.map(t => {
        const creatorsArr = module.exports._parseArrayField(t.creator);
        const showCreator = creatorsArr.length > 1 ? true : !creatorFilter;
        return { raw: t, text: module.exports._formatBody(t, showCreator) };
      });
      cat.zones.push({ zone: g.zone, zoneCount: g.tricks.length, tricks: zoneTricks });
    }

    const fits = (currentStr, addStr) => {
      if (!addStr) return true;
      const extra = currentStr && currentStr.length > 0 ? 1 : 0;
      return (currentStr.length + extra + addStr.length) <= MAX;
    };
    const append = (currentStr, addStr) => {
      if (!addStr) return currentStr;
      return (currentStr && currentStr.length > 0) ? (currentStr + '\n' + addStr) : addStr;
    };

    let current = topHeader;

    for (const cat of categories) {
      const zonesWithTricks = cat.zones.filter(z => z.zoneCount > 0);
      if (zonesWithTricks.length === 0) continue;

      const categoryHeader = `__                                __\n## ${cat.type}\n-# ${cat.typeTotal} ${cat.typeTotal === 1 ? 'trick' : 'tricks'}`;

      if (!fits(current, categoryHeader)) {
        if (current && current.length > 0) {
          messages.push(current.trim());
          current = '';
        }
      }

      if (!fits(current, categoryHeader)) {
        messages.push(categoryHeader);
        current = '';
      } else {
        current = append(current, categoryHeader);
      }

      for (const zoneEntry of cat.zones) {
        if (zoneEntry.zoneCount === 0) continue;

        const zoneHeader = `__                                __\n**${zoneEntry.zone}**\n-# ${zoneEntry.zoneCount} ${zoneEntry.zoneCount === 1 ? 'trick' : 'tricks'}\n_ _`;

        if (!fits(current, zoneHeader)) {
          if (current && current.length > 0) {
            messages.push(current.trim());
            current = '';
          }
        }

        if (!fits(current, zoneHeader)) {
          messages.push(zoneHeader);
          current = '';
        } else {
          current = append(current, zoneHeader);
        }

        for (const t of zoneEntry.tricks) {
          const trickText = t.text;
          if (!fits(current, trickText)) {
            if (current && current.length > 0) {
              messages.push(current.trim());
              current = '';
            }
          }

          if (!fits(current, trickText)) {
            let pos = 0;
            const raw = trickText;
            while (pos < raw.length) {
              const chunk = raw.slice(pos, pos + MAX);
              messages.push(chunk.trim());
              pos += MAX;
            }
            current = '';
          } else {
            current = append(current, trickText);
          }
        }
      }
    }
    if (current && current.length > 0) messages.push(current.trim());
    return messages.map(m => m.trim());
  },

  async execute(interaction) {
    const creatorOpt = interaction.options.getString('creator') || null;
    const typeOpt = interaction.options.getString('type') || null;
    const zoneOpt = interaction.options.getString('zone') || null;
    const visible = interaction.options.getBoolean('visible') ?? false;
    const file = interaction.options.getBoolean('file') ?? true;

    if (file) {
      return interaction.reply({ content: 'File outputs are under construction, set file to false.', flags: 64 });
    }

    if (visible) {
      const key = `${interaction.user.id}`;
      const now = Date.now();
      const cdSecs = (config.cooldowns && config.cooldowns.nonEphemeral && config.cooldowns.nonEphemeral.tricklist) || 10;
      if (this.cooldowns.has(key)) {
        const expiry = this.cooldowns.get(key);
        if (now < expiry) {
          const remaining = Math.ceil((expiry - now) / 1000);
          return interaction.reply({ content: `Please wait ${remaining}s before using this command again.`, flags: 64 });
        }
      }
      this.cooldowns.set(key, now + cdSecs * 1000);
      setTimeout(() => this.cooldowns.delete(key), cdSecs * 1000);
    }

    let query = `SELECT * FROM tricks`;
    const where = [];
    const params = [];

    if (typeOpt) {
      where.push('LOWER(type) = ?');
      params.push(typeOpt.toLowerCase());
    }
    if (zoneOpt) {
      where.push('LOWER(zone) = ?');
      params.push(zoneOpt.toLowerCase());
    }
    if (creatorOpt) {
      where.push(`EXISTS (SELECT 1 FROM json_each(creator) WHERE LOWER(json_each.value) = ?)`);
      params.push(creatorOpt.toLowerCase());
    }

    if (where.length) query += ' WHERE ' + where.join(' AND ');

    query += `
ORDER BY
  CASE WHEN date IS NULL OR TRIM(date) = '' THEN 1 ELSE 0 END,
  CASE WHEN date IS NULL OR TRIM(date) = '' THEN NULL ELSE (substr(date,7,4) || '-' || substr(date,4,2) || '-' || substr(date,1,2)) END ASC
`;

    let rows;
    try {
      rows = db.prepare(query).all(...params);
    } catch (err) {
      console.error('DB error:', err);
      return interaction.reply({ content: 'Failed to retrieve tricks from the database.', flags: 64 });
    }

    if (!rows || rows.length === 0) {
      return interaction.reply({ content: 'No tricks found with the given filters.', flags: 64 });
    }

    const totalCount = rows.length;

    let creatorDisplay = null;
    if (creatorOpt) {
      for (const r of rows) {
        const creators = module.exports._parseArrayField(r.creator);
        for (const c of creators) {
          if (c && c.toLowerCase() === creatorOpt.toLowerCase()) {
            creatorDisplay = c;
            break;
          }
        }
        if (creatorDisplay) break;
      }
      if (!creatorDisplay) creatorDisplay = creatorOpt;
    }

    const groups = module.exports._groupTricks(rows);
    const headerStr = module.exports._buildHeader({ creatorDisplay, creatorFilter: creatorOpt, zoneFilter: zoneOpt, typeFilter: typeOpt });

    if (visible) {
      const rawPages = module.exports._buildVisiblePages(groups, headerStr, totalCount, creatorOpt);
      const totalPages = rawPages.length || 1;
      let currentPage = 1;

      const buildFinalPageText = (pageIndex) => {
        const body = rawPages[pageIndex - 1] || '';
        const pageCountSuffix = ` | Page ${pageIndex}/${totalPages}`;
        const top = `# ${headerStr}\n-# ${totalCount} ${totalCount === 1 ? 'trick' : 'tricks'}${pageCountSuffix}\n\n`;
        return top + body + `\n_ _`;
      };

      const makeNavRow = (page) => {
        const prev = new ButtonBuilder()
          .setCustomId(`tricklist_prev`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page <= 1);
        const next = new ButtonBuilder()
          .setCustomId(`tricklist_next`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= totalPages);
        return new ActionRowBuilder().addComponents(prev, next);
      };

      try {
        await interaction.reply({ content: buildFinalPageText(currentPage), components: [makeNavRow(currentPage)] });
        const replyMsg = await interaction.fetchReply();

        const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000, filter: i => i.user.id === interaction.user.id });

        collector.on('collect', async i => {
          if (i.customId === 'tricklist_prev') {
            if (currentPage > 1) currentPage--;
            await i.update({ content: buildFinalPageText(currentPage), components: [makeNavRow(currentPage)] });
          } else if (i.customId === 'tricklist_next') {
            if (currentPage < totalPages) currentPage++;
            await i.update({ content: buildFinalPageText(currentPage), components: [makeNavRow(currentPage)] });
          } else {
            await i.deferUpdate();
          }
        });

        collector.on('end', async () => {
          try { await replyMsg.edit({ components: [] }); } catch (_) { }
        });

      } catch (err) {
        console.error('TL error:', err);
        return interaction.reply({ content: 'Failed to send visible tricklist.', flags: 64 });
      }
      return;
    }

    const ephemeralMessages = module.exports._buildEphemeralMessages(groups, headerStr, totalCount, creatorOpt);

    try {
      for (let i = 0; i < ephemeralMessages.length; i++) {
        const content = ephemeralMessages[i];
        if (i === 0) {
          await interaction.reply({ content, flags: 64 });
        } else {
          await interaction.followUp({ content, flags: 64 });
        }
      }
    } catch (err) {
      console.error('TL error:', err);
      return interaction.reply({ content: 'Failed to send ephemeral tricklist.', flags: 64 });
    }
  }
};
