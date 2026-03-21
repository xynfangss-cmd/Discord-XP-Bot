const { EmbedBuilder } = require('discord.js');

// Utility Command Handlers
async function handleHelp(interaction) {
    const helpEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Bot Commands')
        .setDescription('Here is a list of all available commands:')
        .addFields(
            { name: 'Economy', value: '`/balance`, `/bank`, `/deposit`, `/withdraw`, `/daily`, `/work`, `/gamble`' },
            { name: 'Ranks', value: '`/rank`, `/ranks`, `/leaderboard`' },
            { name: 'Fun', value: '`/chest`, `/slots`, `/coinflip`' },
            { name: 'Giveaways', value: '`/giveaway create`, `/giveaway end`, `/giveaway reroll`' },
            { name: 'Tickets', value: '`/ticket create`, `/ticket close`, `/ticket panel`' },
            { name: 'Admin', value: '`/admin givegems`, `/admin giveall`, `/admin setbalance`, `/admin resetuser`' },
            { name: 'Utility', value: '`/help`, `/ping`, `/serverinfo`, `/userinfo`' }
        );
    await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
}

async function handlePing(interaction) {
    await interaction.reply(`🏓 Pong! Latency is ${Date.now() - interaction.createdTimestamp}ms.`);
}

async function handleServerInfo(interaction) {
    const serverInfoEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(interaction.guild.name)
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
            { name: 'Owner', value: `<@${interaction.guild.ownerId}>`, inline: true },
            { name: 'Members', value: `${interaction.guild.memberCount}`, inline: true },
            { name: 'Created At', value: interaction.guild.createdAt.toDateString(), inline: true }
        );
    await interaction.reply({ embeds: [serverInfoEmbed] });
}

async function handleUserInfo(interaction, db, rankSystem, bankSystem) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    const userData = await db.getUser(user.id, interaction.guild.id);
    const bankData = await bankSystem.getBalance(user.id, interaction.guild.id);
    const rank = rankSystem.getRank(userData.gems);

    const userInfoEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(user.username)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
            { name: 'Rank', value: rank.name, inline: true },
            { name: 'Gems', value: userData.gems.toLocaleString(), inline: true },
            { name: 'Bank', value: bankData.balance.toLocaleString(), inline: true },
            { name: 'Joined At', value: member.joinedAt.toDateString(), inline: true },
            { name: 'Account Created At', value: user.createdAt.toDateString(), inline: true }
        );
    await interaction.reply({ embeds: [userInfoEmbed] });
}

function parseAmount(content) {
    let amount;
    if (content.includes('k')) {
        amount = parseInt(parseFloat(content.replace('k', '')) * 1000);
    } else if (content.includes('m')) {
        amount = parseInt(parseFloat(content.replace('m', '')) * 1000000);
    } else if (content.includes('b')) {
        amount = parseInt(parseFloat(content.replace('b', '')) * 1000000000);
    } else {
        amount = parseInt(content);
    }
    return amount;
}

module.exports = { handleHelp, handlePing, handleServerInfo, handleUserInfo, parseAmount };
