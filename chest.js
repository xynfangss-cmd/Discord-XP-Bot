const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class ChestSystem {
    constructor(database, rankSystem) {
        this.db = database;
        this.rankSystem = rankSystem;
        this.chestCost = 750;
        this.rewards = [
            { type: 'gems', min: 1000, max: 5000, weight: 35, name: 'Gem Boost', rarity: 'Common', color: '#808080' },
            { type: 'gems', min: 5000, max: 15000, weight: 25, name: 'Gem Fortune', rarity: 'Uncommon', color: '#00FF00' },
            { type: 'gems', min: 15000, max: 30000, weight: 15, name: 'Gem Treasure', rarity: 'Rare', color: '#0080FF' },
            { type: 'gems', min: 30000, max: 50000, weight: 10, name: 'Gem Jackpot', rarity: 'Epic', color: '#8000FF' },
            { type: 'gems', min: 50000, max: 100000, weight: 5, name: 'Gem Mega Jackpot', rarity: 'Legendary', color: '#FF8000' },
            { type: 'gems', min: 100000, max: 250000, weight: 1, name: 'Gem Ultra Jackpot', rarity: 'Mythic', color: '#FF0080' },
            { type: 'xp_bonus', amount: 200, weight: 5, name: 'XP Boost', rarity: 'Common', color: '#808080' },
            { type: 'xp_bonus', amount: 500, weight: 3, name: 'XP Super Boost', rarity: 'Uncommon', color: '#00FF00' },
            { type: 'xp_bonus', amount: 1000, weight: 1, name: 'XP Mega Boost', rarity: 'Rare', color: '#0080FF' }
        ];
    }

    calculateTotalWeight() {
        return this.rewards.reduce((total, reward) => total + reward.weight, 0);
    }

    selectReward() {
        const totalWeight = this.calculateTotalWeight();
        let random = Math.random() * totalWeight;
        
        for (const reward of this.rewards) {
            random -= reward.weight;
            if (random <= 0) {
                return reward;
            }
        }
        return this.rewards[0];
    }

    generateRewardAmount(reward) {
        if (reward.type === 'gems') {
            return Math.floor(Math.random() * (reward.max - reward.min + 1)) + reward.min;
        }
        return reward.amount;
    }

    getRarityEmoji(rarity) {
        const emojis = {
            'Common': '⚪',
            'Uncommon': '🟢',
            'Rare': '🔵',
            'Epic': '🟣',
            'Legendary': '🟠',
            'Mythic': '🔴'
        };
        return emojis[rarity] || '⚪';
    }

    createOpeningAnimation() {
        const animations = [
            '🎁 Opening the mysterious chest...',
            '✨ Magic sparkles fly around...',
            '🔓 The ancient lock clicks open...',
            '💎 Golden light shines through...',
            '🌟 Cosmic energy surrounds the chest...',
            '🎉 The treasure reveals itself!'
        ];
        return animations[Math.floor(Math.random() * animations.length)];
    }

    async openChest(userId, guildId) {
        const userData = await this.db.getUser(userId, guildId);
        if (!userData) {
            return { success: false, message: 'User not found!' };
        }

        const currentXP = this.rankSystem.calculateXP(userData.gems);
        if (currentXP < this.chestCost) {
            const needed = this.chestCost - currentXP;
            return { 
                success: false, 
                message: `You need ${needed} more XP to open a chest! Current XP: ${currentXP}` 
            };
        }

        const reward = this.selectReward();
        const rewardAmount = this.generateRewardAmount(reward);

        if (reward.type === 'gems') {
            await this.db.updateUser(userId, guildId, {
                gems: userData.gems + rewardAmount
            });
        } else if (reward.type === 'xp_bonus') {
            // XP bonus is handled differently - it's a one-time bonus
            await this.db.addChestReward(userId, reward.type, rewardAmount);
        }

        await this.db.addChestReward(userId, reward.type, rewardAmount);

        return {
            success: true,
            reward: reward,
            amount: rewardAmount,
            newGems: reward.type === 'gems' ? userData.gems + rewardAmount : userData.gems
        };
    }

    createChestEmbed(user, userData) {
        const currentXP = this.rankSystem.calculateXP(userData.gems);
        const canOpen = currentXP >= this.chestCost;
        const rank = this.rankSystem.getUserRank(userData.gems);
        const cooldownData = this.getChestCooldown(userData);

        const embed = new EmbedBuilder()
            .setTitle('🎁 **Mystery Chest**')
            .setColor(canOpen ? '#00FF00' : '#FF0000')
            .setThumbnail('https://i.imgur.com/9QaKxJt.png')
            .setDescription('🌟 **Open a mysterious chest to win amazing rewards!**\n\nEach chest contains rare treasures and valuable gems!')
            .addFields(
                { name: '💰 **Cost**', value: `**${this.chestCost}** XP`, inline: true },
                { name: '⭐ **Your XP**', value: `**${currentXP.toLocaleString()}** XP`, inline: true },
                { name: '🎯 **Status**', value: canOpen ? '✅ **Ready to open!**' : '❌ **Not enough XP**', inline: true }
            )
            .addFields(
                { 
                    name: '🎲 **Possible Rewards**', 
                    value: 
                        `${this.getRarityEmoji('Common')} **Common** (40% chance)\n` +
                        `${this.getRarityEmoji('Uncommon')} **Uncommon** (28% chance)\n` +
                        `${this.getRarityEmoji('Rare')} **Rare** (16% chance)\n` +
                        `${this.getRarityEmoji('Epic')} **Epic** (10% chance)\n` +
                        `${this.getRarityEmoji('Legendary')} **Legendary** (5% chance)\n` +
                        `${this.getRarityEmoji('Mythic')} **Mythic** (1% chance)`, 
                    inline: false 
                },
                {
                    name: '💎 **Reward Ranges**',
                    value: '• **Common:** 1K-5K gems, 200 XP\n' +
                           '• **Uncommon:** 5K-15K gems, 500 XP\n' +
                           '• **Rare:** 15K-30K gems, 1K XP\n' +
                           '• **Epic:** 30K-50K gems\n' +
                           '• **Legendary:** 50K-100K gems\n' +
                           '• **Mythic:** 100K-250K gems',
                    inline: false
                }
            )
            .setFooter({ text: `${rank.color} ${rank.name} • ${new Date().toLocaleDateString()}` })
            .setTimestamp();

        return embed;
    }

    createChestResultEmbed(user, result, newUserData) {
        const rank = this.rankSystem.getUserRank(newUserData.gems);
        const rarityEmoji = this.getRarityEmoji(result.reward.rarity);
        const animation = this.createOpeningAnimation();
        
        let rewardText = '';
        let rewardColor = result.reward.color || '#FFD700';
        
        if (result.reward.type === 'gems') {
            rewardText = `💎 **${result.amount.toLocaleString()} Gems**`;
        } else if (result.reward.type === 'xp_bonus') {
            rewardText = `⭐ **${result.amount} XP Bonus**`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🎉 **Chest Opened!**')
            .setColor(rewardColor)
            .setThumbnail(user.displayAvatarURL({ size: 256 }))
            .setDescription(`${animation}\n\n🎊 **Congratulations ${user.username}!** You won an amazing reward!`)
            .addFields(
                { name: `${rarityEmoji} **${result.reward.rarity} Reward**`, value: `${result.reward.name}`, inline: true },
                { name: '🎁 **Prize**', value: rewardText, inline: true },
                { name: '💰 **New Balance**', value: `**${newUserData.gems.toLocaleString()}** gems`, inline: true }
            )
            .addFields(
                { name: '⭐ **New XP**', value: `**${this.rankSystem.calculateXP(newUserData.gems).toLocaleString()}** XP`, inline: true },
                { name: '📈 **Profit**', value: result.reward.type === 'gems' ? `+${result.amount.toLocaleString()} gems` : `+${result.amount} XP`, inline: true },
                { name: '🏆 **Rank Progress**', value: `${rank.color} **${rank.name}**`, inline: true }
            )
            .setFooter({ text: `${rank.color} ${rank.name} • Rarity: ${result.reward.rarity} • ${new Date().toLocaleDateString()}` })
            .setTimestamp();

        return embed;
    }

    createChestButtons() {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('open_chest')
                    .setLabel('🎁 Open Chest (750 XP)')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎁')
            );

        return row;
    }

    getChestCooldown(userData) {
        // Implement cooldown logic if needed
        return { canOpen: true, timeLeft: 0 };
    }
}

module.exports = ChestSystem;
