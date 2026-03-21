const { EmbedBuilder } = require('discord.js');

// Fun Command Handlers
async function handleChest(interaction, db) {
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    const chestCost = 100;
    
    if (userData.gems < chestCost) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Insufficient Gems')
            .setColor('#FF0000')
            .setDescription('You do not have enough gems to open a mystery chest!')
            .addFields(
                { name: '💰 **Your Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                { name: '💸 **Cost**', value: `**${chestCost.toLocaleString()}** gems`, inline: true },
                { name: '💎 **Needed**', value: `**${(chestCost - userData.gems).toLocaleString()}** gems`, inline: true }
            )
            .setFooter({ text: 'Earn more gems with /work and /daily!' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    await db.updateUser(interaction.user.id, interaction.guild.id, {
        gems: userData.gems - chestCost
    });
    
    const rewards = [
        { min: 50, max: 200, weight: 40, name: 'Small Prize' },
        { min: 200, max: 500, weight: 30, name: 'Medium Prize' },
        { min: 500, max: 1000, weight: 20, name: 'Large Prize' },
        { min: 1000, max: 2500, weight: 8, name: 'Super Prize' },
        { min: 2500, max: 5000, weight: 2, name: 'Mega Prize' }
    ];
    
    const totalWeight = rewards.reduce((sum, reward) => sum + reward.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedReward = rewards[0];
    
    for (const reward of rewards) {
        random -= reward.weight;
        if (random <= 0) {
            selectedReward = reward;
            break;
        }
    }
    
    const rewardAmount = Math.floor(Math.random() * (selectedReward.max - selectedReward.min + 1)) + selectedReward.min;
    
    await db.updateUser(interaction.user.id, interaction.guild.id, {
        gems: userData.gems - chestCost + rewardAmount
    });
    
    const netProfit = rewardAmount - chestCost;
    const profitEmoji = netProfit >= 0 ? '📈' : '📉';
    
    const embed = new EmbedBuilder()
        .setTitle('🎁 **Mystery Chest Opened!**')
        .setColor('#FFD700')
        .setDescription(`You opened a mystery chest and found a **${selectedReward.name}**!`)
        .addFields(
            { name: '💰 **Reward Amount**', value: `**${rewardAmount.toLocaleString()}** gems`, inline: true },
            { name: '💸 **Chest Cost**', value: `**${chestCost.toLocaleString()}** gems`, inline: true },
            { name: `${profitEmoji} **Net Profit**`, value: `**${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()}** gems`, inline: true }
        )
        .addFields(
            { name: '💎 **New Balance**', value: `**${(userData.gems - chestCost + rewardAmount).toLocaleString()}** gems`, inline: false }
        )
        .setThumbnail('https://i.imgur.com/9QaKxJt.png')
        .setFooter({ text: '💎 Try your luck again with /chest!' })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleSlots(interaction, db) {
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    
    if (userData.gems < amount) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Insufficient Gems')
            .setColor('#FF0000')
            .setDescription('You do not have enough gems to play the slot machine!')
            .addFields(
                { name: '💰 **Your Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                { name: '💸 **Bet Amount**', value: `**${amount.toLocaleString()}** gems`, inline: true }
            )
            .setFooter({ text: 'Earn more gems with /work and /daily!' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣'];
    const weights = [30, 25, 20, 15, 8, 2];
    
    const reels = [];
    for (let i = 0; i < 3; i++) {
        const random = Math.random() * 100;
        let cumulative = 0;
        for (let j = 0; j < symbols.length; j++) {
            cumulative += weights[j];
            if (random <= cumulative) {
                reels.push(symbols[j]);
                break;
            }
        }
    }
    
    let winAmount = 0;
    let winType = '';
    
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
        switch (reels[0]) {
            case '7️⃣':
                winAmount = amount * 10;
                winType = 'JACKPOT! Triple 7s!';
                break;
            case '💎':
                winAmount = amount * 5;
                winType = 'Triple Diamonds!';
                break;
            case '🍇':
                winAmount = amount * 3;
                winType = 'Triple Grapes!';
                break;
            case '🍊':
                winAmount = amount * 2.5;
                winType = 'Triple Oranges!';
                break;
            case '🍋':
                winAmount = amount * 2;
                winType = 'Triple Lemons!';
                break;
            case '🍒':
                winAmount = amount * 1.5;
                winType = 'Triple Cherries!';
                break;
        }
    } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
        winAmount = amount * 0.5;
        winType = 'Two of a Kind!';
    } else if (reels.includes('💎')) {
        winAmount = amount * 0.25;
        winType = 'Diamond Bonus!';
    }
    
    const netChange = winAmount - amount;
    await db.updateUser(interaction.user.id, interaction.guild.id, {
        gems: userData.gems + netChange
    });
    
    const embed = new EmbedBuilder()
        .setTitle('🎰 **Slot Machine**')
        .setColor(winAmount > 0 ? '#00FF00' : '#FF0000')
        .setDescription(`${reels.join(' | ')}`)
        .addFields(
            { name: '💰 **Bet Amount**', value: `**${amount.toLocaleString()}** gems`, inline: true },
            { name: winAmount > 0 ? '🎁 **Won Amount**' : '💸 **Lost Amount**', value: `**${Math.abs(netChange).toLocaleString()}** gems`, inline: true },
            { name: '💎 **New Balance**', value: `**${(userData.gems + netChange).toLocaleString()}** gems`, inline: true }
        );
    
    if (winAmount > 0) {
        embed.addFields(
            { name: '🎉 **Win Type**', value: `**${winType}**`, inline: false }
        );
    }
    
    embed.setFooter({ text: '💎 Try your luck again with /slots!' })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleCoinflip(interaction, db) {
    const choice = interaction.options.getString('choice');
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    
    if (userData.gems < amount) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Insufficient Gems')
            .setColor('#FF0000')
            .setDescription('You do not have enough gems to play coinflip!')
            .addFields(
                { name: '💰 **Your Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                { name: '💸 **Bet Amount**', value: `**${amount.toLocaleString()}** gems`, inline: true }
            )
            .setFooter({ text: 'Earn more gems with /work and /daily!' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = result === choice;
    const winAmount = won ? amount * 2 : 0;
    const netChange = winAmount - amount;
    
    await db.updateUser(interaction.user.id, interaction.guild.id, {
        gems: userData.gems + netChange
    });
    
    const embed = new EmbedBuilder()
        .setTitle('🪙 **Coin Flip**')
        .setColor(won ? '#00FF00' : '#FF0000')
        .setDescription(`The coin landed on **${result.toUpperCase()}**!`)
        .addFields(
            { name: '🎯 **Your Choice**', value: `**${choice.toUpperCase()}**`, inline: true },
            { name: '🪙 **Result**', value: `**${result.toUpperCase()}**`, inline: true },
            { name: won ? '🎉 **You Won!**' : '😞 **You Lost!**', value: won ? '**2x** multiplier' : '**Lost bet**', inline: true }
        )
        .addFields(
            { name: '💰 **Bet Amount**', value: `**${amount.toLocaleString()}** gems`, inline: true },
            { name: won ? '🎁 **Won Amount**' : '💸 **Lost Amount**', value: `**${Math.abs(netChange).toLocaleString()}** gems`, inline: true },
            { name: '💎 **New Balance**', value: `**${(userData.gems + netChange).toLocaleString()}** gems`, inline: true }
        )
        .setFooter({ text: '💎 50/50 chance - Double or nothing!' })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

module.exports = {
    handleChest,
    handleSlots,
    handleCoinflip
};
