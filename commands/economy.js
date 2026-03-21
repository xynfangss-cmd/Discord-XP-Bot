const { EmbedBuilder } = require('discord.js');

// Economy Command Handlers
async function handleBalance(interaction, db, bankSystem, rankSystem) {
    await interaction.deferReply();

    let userData = await db.getUser(interaction.user.id, interaction.guild.id);
    if (!userData) {
        await db.createUser(interaction.user.id, interaction.guild.id);
        userData = await db.getUser(interaction.user.id, interaction.guild.id);
    }
    const accountInfo = await bankSystem.getBalance(interaction.user.id, interaction.guild.id);
    const rank = rankSystem.getUserRank(userData.gems);
    
    const embed = new EmbedBuilder()
        .setTitle('💎 Your Balance & Rank')
        .setColor('#00BFFF')
        .setThumbnail(interaction.user.displayAvatarURL())
        .setDescription(`💳 **Here is your current financial status:**`)
        .addFields(
            { name: '💎 **Bank Balance**', value: `**${accountInfo.balance.toLocaleString()}** gems`, inline: true },
            { name: '💰 **Wallet Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
            { name: '💎 **Total Worth**', value: `**${(accountInfo.balance + userData.gems).toLocaleString()}** gems`, inline: true }
        )
        .addFields(
            { name: '⭐ **Current Rank**', value: `${rank.color} **${rank.name}**`, inline: true },
            { name: '📈 **XP**', value: `**${rankSystem.calculateXP(userData.gems).toLocaleString()}** XP`, inline: true },
            { name: '💸 **Total Withdrawn**', value: `**${accountInfo.totalWithdrawn.toLocaleString()}** gems`, inline: true }
        )
        .addFields(
            { name: '📊 **Account Summary**', value: `• **Total Deposited:** ${accountInfo.totalDeposited.toLocaleString()} gems\n• **Interest Earned:** ${accountInfo.totalInterestEarned.toLocaleString()} gems\n• **Next Interest:** ${accountInfo.lastInterestDate === new Date().toDateString() ? '~~Already collected today~~' : '**Available today!**'}`, inline: false }
        )
        .setFooter({ text: '💎 Use /bank to manage your account' })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleBank(interaction, bankSystem) {
    await interaction.deferReply();
    
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    const accountInfo = await bankSystem.getBalance(userId, guildId);
    const embed = bankSystem.createBankEmbed(interaction.user, accountInfo);
    const buttons = bankSystem.createBankButtons(accountInfo);
    
    const reply = await interaction.editReply({ 
        embeds: [embed], 
        components: buttons
    });
    
    // Start auto-update interval (every 10 seconds)
    const interval = setInterval(async () => {
        try {
            const updatedAccountInfo = await bankSystem.getBalance(userId, guildId);
            const updatedEmbed = bankSystem.createBankEmbed(interaction.user, updatedAccountInfo);
            const updatedButtons = bankSystem.createBankButtons(updatedAccountInfo);
            
            await reply.edit({
                embeds: [updatedEmbed],
                components: updatedButtons
            });
        } catch (error) {
            clearInterval(interval);
        }
    }, 10000);
    
    // Store the interval so we can clear it later
    if (global.bankUpdateIntervals) {
        global.bankUpdateIntervals.set(userId, interval);
    }
}

async function handleQuickDeposit(interaction, db, bankSystem) {
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply();
    
    const result = await bankSystem.deposit(interaction.user.id, interaction.guild.id, amount);
    
    const embed = new EmbedBuilder()
        .setTitle(result.success ? '✅ Deposit Successful' : '❌ Deposit Failed')
        .setColor(result.success ? '#00FF00' : '#FF0000')
        .setDescription(result.message)
        .setTimestamp();
    
    if (result.success) {
        const updatedAccount = await bankSystem.getBalance(interaction.user.id, interaction.guild.id);
        const updatedUserData = await db.getUser(interaction.user.id, interaction.guild.id);
        
        embed.addFields(
            { name: '💎 **New Wallet Balance**', value: `**${updatedUserData.gems.toLocaleString()}** gems`, inline: true },
            { name: '🏦 **New Bank Balance**', value: `**${updatedAccount.balance.toLocaleString()}** gems`, inline: true }
        );
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleQuickWithdraw(interaction, db, bankSystem) {
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply();
    
    const result = await bankSystem.withdraw(interaction.user.id, interaction.guild.id, amount);
    
    const embed = new EmbedBuilder()
        .setTitle(result.success ? '✅ Withdrawal Successful' : '❌ Withdrawal Failed')
        .setColor(result.success ? '#00FF00' : '#FF0000')
        .setDescription(result.message)
        .setTimestamp();
    
    if (result.success) {
        const updatedAccount = await bankSystem.getBalance(interaction.user.id, interaction.guild.id);
        const updatedUserData = await db.getUser(interaction.user.id, interaction.guild.id);
        
        embed.addFields(
            { name: '💎 **New Wallet Balance**', value: `**${updatedUserData.gems.toLocaleString()}** gems`, inline: true },
            { name: '🏦 **New Bank Balance**', value: `**${updatedAccount.balance.toLocaleString()}** gems`, inline: true }
        );
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleDaily(interaction, db) {
    await interaction.deferReply();

    let userData = await db.getUser(interaction.user.id, interaction.guild.id);
    if (!userData) {
        await db.createUser(interaction.user.id, interaction.guild.id);
        userData = await db.getUser(interaction.user.id, interaction.guild.id);
    }
    const now = new Date();
    const lastDaily = userData.last_daily ? new Date(userData.last_daily) : null;
    
    if (lastDaily && (now - lastDaily) < 24 * 60 * 60 * 1000) {
        const timeUntil = 24 * 60 * 60 * 1000 - (now - lastDaily);
        const hours = Math.floor(timeUntil / (60 * 60 * 1000));
        const minutes = Math.floor((timeUntil % (60 * 60 * 1000)) / (60 * 1000));
        
        const embed = new EmbedBuilder()
            .setTitle('⏰ Daily Reward Not Available')
            .setColor('#FFA500')
            .setDescription('You have already claimed your daily reward!')
            .addFields(
                { name: '⏱️ **Time Until Next Daily**', value: `**${hours}h ${minutes}m**`, inline: false }
            )
            .setFooter({ text: 'Come back tomorrow for your next daily reward!' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const baseReward = 1000;
    const bonusReward = Math.floor(Math.random() * 2000);
    const totalReward = baseReward + bonusReward;
    
    await db.updateUser(interaction.user.id, interaction.guild.id, {
        gems: userData.gems + totalReward,
        last_daily: now.toISOString()
    });
    
    const embed = new EmbedBuilder()
        .setTitle('🎁 Daily Reward Claimed!')
        .setColor('#00FF00')
        .setDescription('You have successfully claimed your daily reward!')
        .addFields(
            { name: '💰 **Base Reward**', value: `**${baseReward.toLocaleString()}** gems`, inline: true },
            { name: '🎲 **Bonus Reward**', value: `**${bonusReward.toLocaleString()}** gems`, inline: true },
            { name: '💎 **Total Reward**', value: `**${totalReward.toLocaleString()}** gems`, inline: true }
        )
        .addFields(
            { name: '💎 **New Balance**', value: `**${(userData.gems + totalReward).toLocaleString()}** gems`, inline: false }
        )
        .setFooter({ text: 'Come back tomorrow for your next daily reward!' })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleWork(interaction, db) {
    await interaction.deferReply();

    let userData = await db.getUser(interaction.user.id, interaction.guild.id);
    if (!userData) {
        await db.createUser(interaction.user.id, interaction.guild.id);
        userData = await db.getUser(interaction.user.id, interaction.guild.id);
    }
    const now = new Date();
    const lastWork = userData.last_work ? new Date(userData.last_work) : null;
    
    if (lastWork && (now - lastWork) < 60 * 60 * 1000) {
        const timeUntil = 60 * 60 * 1000 - (now - lastWork);
        const minutes = Math.floor(timeUntil / (60 * 1000));
        
        const embed = new EmbedBuilder()
            .setTitle('⏰ Work Not Available')
            .setColor('#FFA500')
            .setDescription('You need to rest before working again!')
            .addFields(
                { name: '⏱️ **Time Until Next Work**', value: `**${minutes} minutes**`, inline: false }
            )
            .setFooter({ text: 'Take a break and come back later!' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const reward = Math.floor(Math.random() * 1500) + 500;
    
    await db.updateUser(interaction.user.id, interaction.guild.id, {
        gems: userData.gems + reward,
        last_work: now.toISOString()
    });
    
    const workMessages = [
        'You worked hard and earned gems!',
        'Great job! You earned some gems.',
        'Your work paid off! Here are your gems.',
        'Excellent work! You earned gems today.',
        'You did a fantastic job and earned gems!'
    ];
    
    const embed = new EmbedBuilder()
        .setTitle('💼 Work Complete!')
        .setColor('#00FF00')
        .setDescription(workMessages[Math.floor(Math.random() * workMessages.length)])
        .addFields(
            { name: '💰 **Earned**', value: `**${reward.toLocaleString()}** gems`, inline: true },
            { name: '💎 **New Balance**', value: `**${(userData.gems + reward).toLocaleString()}** gems`, inline: true }
        )
        .setFooter({ text: 'You can work again in 1 hour' })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleGamble(interaction, db) {
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply();

    let userData = await db.getUser(interaction.user.id, interaction.guild.id);
    if (!userData) {
        await db.createUser(interaction.user.id, interaction.guild.id);
        userData = await db.getUser(interaction.user.id, interaction.guild.id);
    }
    
    if (userData.gems < amount) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Insufficient Gems')
            .setColor('#FF0000')
            .setDescription('You do not have enough gems to gamble!')
            .addFields(
                { name: '💰 **Your Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                { name: '💸 **Attempted Bet**', value: `**${amount.toLocaleString()}** gems`, inline: true }
            )
            .setFooter({ text: 'Earn more gems with /work and /daily!' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const won = Math.random() < 0.5;
    const winAmount = won ? amount * 2 : 0;
    const netChange = won ? amount : -amount;
    
    await db.updateUser(interaction.user.id, interaction.guild.id, {
        gems: userData.gems + netChange
    });
    
    const embed = new EmbedBuilder()
        .setTitle(won ? '🎉 You Won!' : '😞 You Lost')
        .setColor(won ? '#00FF00' : '#FF0000')
        .setDescription(won ? 'Congratulations! You doubled your bet!' : 'Better luck next time!')
        .addFields(
            { name: '💰 **Bet Amount**', value: `**${amount.toLocaleString()}** gems`, inline: true },
            { name: won ? '🎁 **Won Amount**' : '💸 **Lost Amount**', value: `**${Math.abs(netChange).toLocaleString()}** gems`, inline: true },
            { name: '💎 **New Balance**', value: `**${(userData.gems + netChange).toLocaleString()}** gems`, inline: true }
        )
        .setFooter({ text: 'Gamble responsibly!' })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

module.exports = {
    handleBalance,
    handleBank,
    handleQuickDeposit,
    handleQuickWithdraw,
    handleDaily,
    handleWork,
    handleGamble
};
