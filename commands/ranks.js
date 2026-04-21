const { EmbedBuilder, PermissionsBitField, MessageFlags } = require('discord.js');

const ALLOWED_USER_ID = '1475533428647792701';
const RANK_ROLE_PREFIX = 'Rank:';

async function ensureBotCanManageRoles(interaction) {
    const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
    const hasPerm = botMember.permissions.has(PermissionsBitField.Flags.ManageRoles);
    return { botMember, hasPerm };
}

async function getOrCreateRankRole(interaction, roleName, reason) {
    let role = interaction.guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
        role = await interaction.guild.roles.create({ name: roleName, reason });
    }
    return role;
}

function formatHierarchyHelp(botMember, role) {
    const botTop = botMember.roles.highest;
    return [
        '❌ I can’t assign that role due to Discord role hierarchy.',
        '',
        `- My top role: **${botTop.name}** (position **${botTop.position}**)`,
        `- Target role: **${role.name}** (position **${role.position}**)`,
        '',
        'Fix: move my bot role **above** the rank roles in **Server Settings → Roles**.'
    ].join('\n');
}

async function assignRankRoleToMember(interaction, member, desiredRank, reason) {
    const roleName = `${RANK_ROLE_PREFIX} ${desiredRank}`;

    const { botMember, hasPerm } = await ensureBotCanManageRoles(interaction);
    if (!hasPerm) {
        return { ok: false, message: '❌ I need the **Manage Roles** permission to do that.' };
    }

    const role = await getOrCreateRankRole(interaction, roleName, reason);

    // If we just created it (or it’s low), try to move it just under the bot’s top role.
    // This makes it assignable in most servers without manual role reordering.
    try {
        const botTop = botMember.roles.highest;
        if (botTop && role.position >= botTop.position) {
            await role.setPosition(Math.max(1, botTop.position - 1));
        }
    } catch {
        // If we can't reposition (missing perms), we'll still check assignability below.
    }

    // Re-fetch role from cache to ensure position is current-ish
    const finalRole = interaction.guild.roles.cache.get(role.id) || role;

    // Discord.js provides `.editable` which accounts for hierarchy + perms
    if (!finalRole.editable) {
        return { ok: false, message: formatHierarchyHelp(botMember, finalRole) };
    }

    const rolesToRemove = member.roles.cache.filter(
        r => r.name.startsWith(`${RANK_ROLE_PREFIX} `) && r.id !== finalRole.id
    );

    try {
        if (rolesToRemove.size > 0) {
            await member.roles.remove([...rolesToRemove.keys()], 'Updating rank role');
        }
        if (!member.roles.cache.has(finalRole.id)) {
            await member.roles.add(finalRole, reason);
        }
    } catch (e) {
        const msg = typeof e?.message === 'string' ? e.message : 'Unknown error';
        return { ok: false, message: `❌ Failed to assign role. (${msg})` };
    }

    return { ok: true, roleName: finalRole.name };
}

// Rank Command Handlers
async function handleRank(interaction, db, rankSystem) {
    const sub = interaction.options.getSubcommand(false) || 'view';

    if (sub === 'set') {
        if (interaction.user.id !== ALLOWED_USER_ID) {
            await interaction.reply({
                content: '❌ You are not allowed to use this command.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (!interaction.inGuild()) {
            await interaction.reply({ content: '❌ This can only be used in a server.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const desiredRank = interaction.options.getString('rank', true);

        const me = await interaction.guild.members.fetch(interaction.user.id);
        const result = await assignRankRoleToMember(
            interaction,
            me,
            desiredRank,
            `Rank set by ${interaction.user.tag} via /rank set`
        );

        if (!result.ok) {
            await interaction.editReply(result.message);
            return;
        }

        await interaction.editReply(`✅ Set your rank to **${desiredRank}** (role: **${result.roleName}**).`);
        return;
    }

    // view
    const targetUser = interaction.options.getUser('user') || interaction.user;

    await interaction.deferReply();

    let userData = await db.getUser(targetUser.id, interaction.guild.id);
    if (!userData) {
        await db.createUser(targetUser.id, interaction.guild.id);
        userData = await db.getUser(targetUser.id, interaction.guild.id);
    }
    const rank = rankSystem.getUserRank(userData.gems);
    const xp = rankSystem.calculateXP(userData.gems);
    const nextRank = rankSystem.getNextRank(userData.gems);
    const nextReq = nextRank?.minCredits ?? null;
    const progress = nextReq ? Math.min(100, Math.max(0, ((userData.gems - rank.minCredits) / (nextReq - rank.minCredits)) * 100)).toFixed(1) : null;
    
    const embed = new EmbedBuilder()
        .setTitle(`⭐ **${targetUser.username}'s Rank & Stats**`)
        .setColor(rank.hexColor || '#00BFFF')
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(`${rank.color} **Current Rank:** ${rank.name}`)
        .addFields(
            { name: '💎 **Gems**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
            { name: '📈 **XP**', value: `**${xp.toLocaleString()}** XP`, inline: true },
            { name: '🏆 **Rank**', value: `**${rank.name}**`, inline: true }
        );

    // Also show server role rank if present
    try {
        const member = await interaction.guild.members.fetch(targetUser.id);
        const roleRank = member.roles.cache.find(r => r.name.startsWith(`${RANK_ROLE_PREFIX} `))?.name || null;
        embed.addFields({
            name: '🏷️ **Server Rank Role**',
            value: roleRank ? `**${roleRank.replace(`${RANK_ROLE_PREFIX} `, '')}**` : '*None set*',
            inline: true
        });
    } catch {
        // ignore fetch errors (user not in guild, etc.)
    }
    
    if (nextRank) {
        embed.addFields(
            { name: '🎯 **Next Rank**', value: `**${nextRank.name}** (${nextRank.minCredits.toLocaleString()} gems)`, inline: true },
            { name: '📊 **Progress**', value: `**${progress}%** (${(userData.gems).toLocaleString()}/${nextRank.minCredits.toLocaleString()})`, inline: true },
            { name: '💰 **Needed**', value: `**${(nextRank.minCredits - userData.gems).toLocaleString()}** gems`, inline: true }
        );
    } else {
        embed.addFields(
            { name: '👑 **Max Rank**', value: '**You\'ve reached the highest rank!**', inline: false }
        );
    }
    
    embed.addFields(
        { name: '📝 **Rank Description**', value: `Reach **${rank.minCredits.toLocaleString()}+** gems to be **${rank.name}**.`, inline: false }
    )
    .setFooter({ text: `💎 Use /ranks to see all available ranks` })
    .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleAddRank(interaction) {
    if (interaction.user.id !== ALLOWED_USER_ID) {
        await interaction.reply({ content: '❌ You are not allowed to use this command.', flags: MessageFlags.Ephemeral });
        return;
    }

    if (!interaction.inGuild()) {
        await interaction.reply({ content: '❌ This can only be used in a server.', flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetUser = interaction.options.getUser('user', true);
    const desiredRank = interaction.options.getString('rank', true);
    const member = await interaction.guild.members.fetch(targetUser.id);
    const result = await assignRankRoleToMember(
        interaction,
        member,
        desiredRank,
        `Rank assigned by ${interaction.user.tag} via /addrank`
    );

    if (!result.ok) {
        await interaction.editReply(result.message);
        return;
    }

    await interaction.editReply(`✅ Assigned **${desiredRank}** to **${targetUser.tag}** (role: **${result.roleName}**).`);
}

async function handleRanks(interaction, db, rankSystem) {
    await interaction.deferReply();
    
    const allRanks = rankSystem.getAllRanks();
    let userData = await db.getUser(interaction.user.id, interaction.guild.id);
    if (!userData) {
        await db.createUser(interaction.user.id, interaction.guild.id);
        userData = await db.getUser(interaction.user.id, interaction.guild.id);
    }
    const currentRank = rankSystem.getUserRank(userData.gems);
    
    const embed = new EmbedBuilder()
        .setTitle('🏆 **All Available Ranks**')
        .setColor('#00BFFF')
        .setDescription('Here are all the ranks you can achieve by earning gems!')
        .setThumbnail('https://i.imgur.com/9QaKxJt.png');
    
    const tiers = {
        'Bronze': allRanks.filter(r => r.level <= 3),
        'Silver': allRanks.filter(r => r.level > 3 && r.level <= 6),
        'Gold': allRanks.filter(r => r.level > 6 && r.level <= 9),
        'Platinum': allRanks.filter(r => r.level > 9 && r.level <= 12),
        'Diamond': allRanks.filter(r => r.level > 12 && r.level <= 15),
        'Master': allRanks.filter(r => r.level > 15)
    };
    
    for (const [tierName, tierRanks] of Object.entries(tiers)) {
        if (tierRanks.length > 0) {
            const rankList = tierRanks.map(rank => {
                const isCurrentRank = rank.name === currentRank.name;
                const isUnlocked = userData.gems >= rank.required;
                const status = isCurrentRank ? ' 👈 **Current**' : (isUnlocked ? ' ✅' : ' 🔒');
                return `${rank.color} **${rank.name}** - ${rank.required.toLocaleString()} gems${status}`;
            }).join('\n');
            
            embed.addFields(
                { name: `${tierName} Tier`, value: rankList, inline: false }
            );
        }
    }
    
    embed.addFields(
        { name: '📊 **Your Progress**', value: `${currentRank.color} **Current Rank:** ${currentRank.name} (${userData.gems.toLocaleString()} gems)`, inline: false }
    )
    .setFooter({ text: '💎 Earn gems with /work, /daily, and /gamble to rank up!' })
    .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleLeaderboard(interaction, db, rankSystem) {
    await interaction.deferReply();
    
    try {
        const topUsers = await db.getTopUsers(interaction.guild.id, 50);
        let userData = await db.getUser(interaction.user.id, interaction.guild.id);
        if (!userData) {
            await db.createUser(interaction.user.id, interaction.guild.id);
            userData = await db.getUser(interaction.user.id, interaction.guild.id);
        }
        
        const userPosition = topUsers.findIndex(u => u.user_id === interaction.user.id) + 1;
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 **Gem Leaderboard**')
            .setColor('#FFD700')
            .setDescription(`Top gem earners in **${interaction.guild.name}**!`)
            .setThumbnail('https://i.imgur.com/9QaKxJt.png');
        
        const top10 = topUsers.slice(0, 10);
        const leaderboardText = top10.map((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const member = interaction.guild.members.cache.get(user.user_id);
            const userName = member ? member.user.username : `User ${user.user_id}`;
            const rank = rankSystem.getUserRank(user.gems);
            return `${medal} **${userName}** - ${user.gems.toLocaleString()} gems ${rank.color}`;
        }).join('\n');
        
        embed.addFields(
            { name: '🏅 **Top 10**', value: leaderboardText, inline: false }
        );
        
        if (userPosition > 10) {
            embed.addFields(
                { name: '📍 **Your Position**', value: `**#${userPosition}** - ${userData.gems.toLocaleString()} gems`, inline: false }
            );
        }
        
        embed.addFields(
            { name: '📊 **Server Stats**', value: `**Total Users:** ${topUsers.length}\n**Total Gems:** ${topUsers.reduce((sum, user) => sum + user.gems, 0).toLocaleString()}`, inline: false }
        )
        .setFooter({ text: '💎 Leaderboard updates every hour' })
        .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        await interaction.editReply({
            content: '❌ **Error fetching leaderboard!** Please try again later.',
            flags: MessageFlags.Ephemeral
        });
    }
}

module.exports = {
    handleRank,
    handleAddRank,
    handleRanks,
    handleLeaderboard
};
