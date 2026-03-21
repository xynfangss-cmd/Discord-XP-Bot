const { EmbedBuilder, PermissionsBitField } = require('discord.js');

/** Comma-separated Discord user IDs in .env: ADMIN_IDS=id1,id2 */
function getBotAdminIds() {
    const raw = process.env.ADMIN_IDS || '';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function isAdminUser(interaction) {
    const member = interaction.member;
    if (member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
        return true;
    }
    const ids = getBotAdminIds();
    return ids.length > 0 && ids.includes(interaction.user.id);
}

function denyAdmin() {
    return {
        content:
            '❌ **Permission Denied!** You need **Administrator** in this server, or your user ID must be listed in `ADMIN_IDS` in the bot `.env`.',
        ephemeral: true
    };
}

// Admin Command Handlers
async function handleAdmin(interaction, db) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
        case 'givegems':
            await handleAdminGiveGems(interaction, db);
            break;
        case 'giveall':
            await handleAdminGiveAll(interaction, db);
            break;
        case 'setbalance':
            await handleAdminSetBalance(interaction, db);
            break;
        case 'resetuser':
            await handleAdminResetUser(interaction, db);
            break;
    }
}

async function handleAdminGiveGems(interaction, db) {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply({ ephemeral: true });
    
    if (!isAdminUser(interaction)) {
        return await interaction.editReply(denyAdmin());
    }
    
    try {
        let userData = await db.getUser(targetUser.id, interaction.guild.id);
        if (!userData) {
            await db.createUser(targetUser.id, interaction.guild.id);
            userData = await db.getUser(targetUser.id, interaction.guild.id);
        }
        await db.updateUser(targetUser.id, interaction.guild.id, {
            gems: userData.gems + amount
        });
        
        const embed = new EmbedBuilder()
            .setTitle('💰 **Gems Given Successfully**')
            .setColor('#00FF00')
            .setDescription(`Successfully gave **${amount.toLocaleString()}** gems to ${targetUser.toString()}`)
            .addFields(
                { name: '👤 **User**', value: targetUser.toString(), inline: true },
                { name: '💰 **Amount Given**', value: `**${amount.toLocaleString()}** gems`, inline: true },
                { name: '💎 **New Balance**', value: `**${(userData.gems + amount).toLocaleString()}** gems`, inline: true }
            )
            .setFooter({ text: `💎 Admin action by ${interaction.user.username}` })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        console.log(`Admin ${interaction.user.username} gave ${amount} gems to ${targetUser.username}`);
        
    } catch (error) {
        console.error('Error giving gems:', error);
        await interaction.editReply({
            content: '❌ **Error giving gems!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleAdminGiveAll(interaction, db) {
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply({ ephemeral: true });
    
    if (!isAdminUser(interaction)) {
        return await interaction.editReply(denyAdmin());
    }
    
    try {
        const members = await interaction.guild.members.fetch();
        let totalGiven = 0;
        let usersUpdated = 0;
        
        for (const member of members) {
            if (!member.user.bot) {
                let userData = await db.getUser(member.id, interaction.guild.id);
                if (!userData) {
                    await db.createUser(member.id, interaction.guild.id);
                    userData = await db.getUser(member.id, interaction.guild.id);
                }
                await db.updateUser(member.id, interaction.guild.id, {
                    gems: userData.gems + amount
                });
                totalGiven += amount;
                usersUpdated++;
            }
        }
        
        const embed = new EmbedBuilder()
            .setTitle('💰 **Mass Gems Distribution Complete**')
            .setColor('#00FF00')
            .setDescription(`Successfully gave gems to all server members!`)
            .addFields(
                { name: '👥 **Users Updated**', value: `**${usersUpdated.toLocaleString()}** users`, inline: true },
                { name: '💰 **Amount Per User**', value: `**${amount.toLocaleString()}** gems`, inline: true },
                { name: '💎 **Total Distributed**', value: `**${totalGiven.toLocaleString()}** gems`, inline: true }
            )
            .setFooter({ text: `💎 Admin action by ${interaction.user.username}` })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        console.log(`Admin ${interaction.user.username} gave ${amount} gems to ${usersUpdated} users (total: ${totalGiven})`);
        
    } catch (error) {
        console.error('Error giving gems to all:', error);
        await interaction.editReply({
            content: '❌ **Error distributing gems!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleAdminSetBalance(interaction, db) {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply({ ephemeral: true });
    
    if (!isAdminUser(interaction)) {
        return await interaction.editReply(denyAdmin());
    }
    
    try {
        let userData = await db.getUser(targetUser.id, interaction.guild.id);
        if (!userData) {
            await db.createUser(targetUser.id, interaction.guild.id);
            userData = await db.getUser(targetUser.id, interaction.guild.id);
        }
        await db.updateUser(targetUser.id, interaction.guild.id, {
            gems: amount
        });
        
        const embed = new EmbedBuilder()
            .setTitle('⚖️ **Balance Set Successfully**')
            .setColor('#00FF00')
            .setDescription(`Successfully set balance for ${targetUser.toString()}`)
            .addFields(
                { name: '👤 **User**', value: targetUser.toString(), inline: true },
                { name: '💰 **Old Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                { name: '💎 **New Balance**', value: `**${amount.toLocaleString()}** gems`, inline: true }
            )
            .addFields(
                { name: '📊 **Change**', value: `${amount >= userData.gems ? '+' : ''}${(amount - userData.gems).toLocaleString()} gems`, inline: false }
            )
            .setFooter({ text: `💎 Admin action by ${interaction.user.username}` })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        console.log(`Admin ${interaction.user.username} set balance of ${targetUser.username} to ${amount} gems`);
        
    } catch (error) {
        console.error('Error setting balance:', error);
        await interaction.editReply({
            content: '❌ **Error setting balance!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleAdminResetUser(interaction, db) {
    const targetUser = interaction.options.getUser('user');
    
    await interaction.deferReply({ ephemeral: true });
    
    if (!isAdminUser(interaction)) {
        return await interaction.editReply(denyAdmin());
    }
    
    try {
        let userData = await db.getUser(targetUser.id, interaction.guild.id);
        if (!userData) {
            await db.createUser(targetUser.id, interaction.guild.id);
            userData = await db.getUser(targetUser.id, interaction.guild.id);
        }
        
        await db.resetUser(targetUser.id, interaction.guild.id);
        
        const embed = new EmbedBuilder()
            .setTitle('🔄 **User Data Reset Successfully**')
            .setColor('#FFA500')
            .setDescription(`Successfully reset all data for ${targetUser.toString()}`)
            .addFields(
                { name: '👤 **User**', value: targetUser.toString(), inline: true },
                { name: '💰 **Previous Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                { name: '🔄 **Data Reset**', value: 'All user data has been reset to default values', inline: false }
            )
            .setFooter({ text: `💎 Admin action by ${interaction.user.username}` })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        console.log(`Admin ${interaction.user.username} reset data for ${targetUser.username}`);
        
    } catch (error) {
        console.error('Error resetting user data:', error);
        await interaction.editReply({
            content: '❌ **Error resetting user data!** Please try again later.',
            ephemeral: true
        });
    }
}

module.exports = {
    handleAdmin,
    handleAdminGiveGems,
    handleAdminGiveAll,
    handleAdminSetBalance,
    handleAdminResetUser
};
