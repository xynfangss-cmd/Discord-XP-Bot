const { EmbedBuilder } = require('discord.js');

class RankSystem {
    constructor() {
        this.ranks = [
            { name: 'Member', minCredits: 0, color: '⚪', hexColor: '#808080' },
            { name: 'Copper', minCredits: 45000, color: '🟤', hexColor: '#B87333' },
            { name: 'Gold', minCredits: 125000, color: '🟡', hexColor: '#FFD700' },
            { name: 'Emerald', minCredits: 425000, color: '🟢', hexColor: '#50C878' },
            { name: 'Diamond', minCredits: 850000, color: '🔵', hexColor: '#B9F2FF' },
            { name: 'Ruby', minCredits: 1650000, color: '🔴', hexColor: '#E0115F' },
            { name: 'Titanium', minCredits: 5000000, color: '⚫', hexColor: '#43464B' }
        ];
    }

    getUserRank(gems) {
        for (let i = this.ranks.length - 1; i >= 0; i--) {
            if (gems >= this.ranks[i].minCredits) {
                return this.ranks[i];
            }
        }
        return this.ranks[0];
    }

    getNextRank(gems) {
        for (const rank of this.ranks) {
            if (gems < rank.minCredits) {
                return rank;
            }
        }
        return null;
    }

    calculateXP(gems) {
        return Math.floor(gems / 10000) * 100;
    }

    createRankEmbed(user, userData) {
        const currentRank = this.getUserRank(userData.gems);
        const nextRank = this.getNextRank(userData.gems);
        const xp = this.calculateXP(userData.gems);
        const gemsToNextRank = nextRank ? nextRank.minCredits - userData.gems : 0;
        const totalRanks = this.ranks.length;
        const currentRankIndex = this.ranks.findIndex(rank => rank.name === currentRank.name);
        const rankProgress = ((currentRankIndex + 1) / totalRanks * 100).toFixed(1);
        
        // Calculate additional stats
        const avgGemsPerMessage = userData.total_messages > 0 ? Math.floor(userData.gems / userData.total_messages) : 0;
        const accountAge = userData.created_at ? Math.floor((Date.now() - userData.created_at) / (1000 * 60 * 60 * 24)) : 0;
        const dailyAverage = accountAge > 0 ? Math.floor(userData.gems / accountAge) : 0;
        
        // Get entry multiplier for giveaways
        const entryMultiplier = this.getEntryMultiplier(userData.gems);

        const embed = new EmbedBuilder()
            .setTitle(`${currentRank.color} **${user.username}'s Profile**`)
            .setColor(currentRank.hexColor)
            .setThumbnail(user.displayAvatarURL({ size: 256, dynamic: true }))
            .setDescription(`👤 **${user.username}**'s Complete Profile`)
            .addFields(
                { 
                    name: '💎 **Wealth Overview**', 
                    value: `💰 **Current Gems:** **${userData.gems.toLocaleString()}**\n⭐ **Total XP:** **${xp.toLocaleString()}** XP\n🏦 **Bank Balance:** **${(userData.bank_balance || 0).toLocaleString()}** gems`, 
                    inline: true 
                },
                { 
                    name: '📊 **Activity Stats**', 
                    value: `� **Messages:** **${userData.total_messages.toLocaleString()}**\n📈 **Daily Avg:** **${dailyAverage}** gems/day\n💬 **Avg/Message:** **${avgGemsPerMessage}** gems`, 
                    inline: true 
                },
                { 
                    name: '🏆 **Rank Progress**', 
                    value: `${currentRank.color} **${currentRank.name}** (${currentRankIndex + 1}/${totalRanks})\n📊 **Progress:** ${rankProgress}%\n🔥 **Entry Multiplier:** **${entryMultiplier}x**`, 
                    inline: true 
                }
            )
            .addFields(
                { 
                    name: '🎯 **Next Rank Progress**', 
                    value: nextRank ? 
                        `${this.createProgressBar(userData.gems, currentRank.minCredits, nextRank.minCredits)}\n💎 **${gemsToNextRank.toLocaleString()}** gems to **${nextRank.name}**` :
                        '🏆 **Maximum Rank Achieved!**\n⭐ **You\'re at the top!**',
                    inline: false 
                }
            )
            .addFields(
                { 
                    name: '📅 **Account Information**', 
                    value: `🕐 **Created:** ${accountAge} days ago\n⏰ **Last Active:** ${userData.last_message_time ? `<t:${Math.floor(userData.last_message_time / 1000)}:R>` : 'Never'}\n🎮 **Giveaway Power:** **${entryMultiplier}x entries**`, 
                    inline: false 
                }
            )
            .setImage('https://i.imgur.com/9QaKxJt.png')
            .setFooter({ text: `💎 Gem Economy Bot • Profile System • ${new Date().toLocaleDateString()}` })
            .setTimestamp();

        // Add achievement badges
        const badges = this.getUserBadges(userData);
        if (badges.length > 0) {
            embed.addFields({
                name: '🏅 **Achievement Badges**',
                value: badges.join(' '),
                inline: false
            });
        }

        return embed;
    }

    getEntryMultiplier(gems) {
        if (gems >= 1000000) return 10;
        if (gems >= 500000) return 7;
        if (gems >= 250000) return 5;
        if (gems >= 100000) return 3;
        if (gems >= 50000) return 2;
        return 1;
    }

    getUserBadges(userData) {
        const badges = [];
        
        if (userData.gems >= 1000000) badges.push('💎');
        if (userData.gems >= 500000) badges.push('🏆');
        if (userData.gems >= 100000) badges.push('⭐');
        if (userData.total_messages >= 1000) badges.push('📨');
        if (userData.total_messages >= 5000) badges.push('📊');
        if (userData.bank_balance >= 100000) badges.push('🏦');
        
        return badges;
    }

    createProgressBar(current, start, end) {
        const total = end - start;
        const progress = current - start;
        const percentage = Math.min(100, Math.max(0, (progress / total) * 100));
        
        const filledBars = Math.round(percentage / 10);
        const emptyBars = 10 - filledBars;
        
        return `[${'█'.repeat(filledBars)}${'░'.repeat(emptyBars)}] ${percentage.toFixed(1)}%`;
    }

    createAllRanksEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('⭐ **RANKS**')
            .setColor('#FFD700')
            .setDescription('🏆 **Complete ranking system for the gem economy**')
            .setThumbnail('https://i.imgur.com/9QaKxJt.png')
            .addFields(
                { name: '⚪ **Member**', value: '📊 **0+ Gems**\n🎯 **Starting rank**\n💎 **Beginner level**', inline: true },
                { name: '🟤 **Copper**', value: '📊 **45,000+ Gems**\n🎯 **First milestone**\n💎 **Dedicated member**', inline: true },
                { name: '🟡 **Gold**', value: '📊 **125,000+ Gems**\n🎯 **Experienced user**\n💎 **Valuable contributor**', inline: true },
                { name: '🟢 **Emerald**', value: '📊 **425,000+ Gems**\n🎯 **Advanced player**\n💎 **Elite status**', inline: true },
                { name: '🔵 **Diamond**', value: '📊 **850,000+ Gems**\n🎯 **Master rank**\n💎 **Prestigious level**', inline: true },
                { name: '🔴 **Ruby**', value: '📊 **1,650,000+ Gems**\n🎯 **Expert tier**\n💎 **Rare achievement**', inline: true },
                { name: '⚫ **Titanium**', value: '📊 **5,000,000+ Gems**\n🎯 **Legendary status**\n💎 **Ultimate rank**', inline: true }
            )
            .addFields(
                { name: '📈 **How to Progress**', value: '💬 **Chat actively** - Earn 5-25 gems per message\n🎁 **Open chests** - Win bonus gems and XP\n🏦 **Use the bank** - Earn 5% daily interest\n🎉 **Participate** - Join giveaways and events', inline: false },
                { name: '💡 **Tips**', value: '⭐ **More messages = more gems**\n💎 **Save gems in bank for interest**\n🎁 **Daily chests for bonuses**\n🏆 **Climb the leaderboard!**', inline: false }
            )
            .setFooter({ text: '💎 Gem Economy Bot • Use /rank to check your current status' })
            .setTimestamp();

        return embed;
    }

    createLeaderboardEmbed(users, guild, page = 1, pageSize = 10) {
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedUsers = users.slice(startIndex, endIndex);
        const totalPages = Math.ceil(users.length / pageSize);

        const embed = new EmbedBuilder()
            .setTitle('🏆 **Gem Leaderboard**')
            .setColor('#FFD700')
            .setDescription(`🌟 **Top gem earners in ${guild.name}** - Page ${page}/${totalPages}`)
            .setThumbnail(guild.iconURL())
            .setFooter({ text: `💎 Gem Economy Bot • Total Users: ${users.length} • ${new Date().toLocaleDateString()}` })
            .setTimestamp();

        if (paginatedUsers.length === 0) {
            embed.setDescription('🔍 **No users found on this page!**');
            return embed;
        }

        const leaderboardText = paginatedUsers.map((user, index) => {
            const rank = this.getUserRank(user.gems);
            const member = guild.members.cache.get(user.user_id);
            const username = member ? member.user.username : `User ${user.user_id}`;
            const globalIndex = startIndex + index + 1;
            const medal = globalIndex === 1 ? '🥇' : globalIndex === 2 ? '🥈' : globalIndex === 3 ? '🥉' : `**${globalIndex}.**`;
            
            return `${medal} ${rank.color} **${username}**\n💎 **${user.gems.toLocaleString()}** gems • 📨 **${user.total_messages || 0}** messages`;
        }).join('\n\n');

        embed.addFields(
            { name: '📊 **Current Rankings**', value: leaderboardText, inline: false }
        );

        // Add statistics
        const totalGems = users.reduce((sum, user) => sum + user.gems, 0);
        const avgGems = Math.floor(totalGems / users.length);
        const topUser = users[0];

        embed.addFields(
            { name: '📈 **Server Statistics**', value: `💎 **Total Gems:** ${totalGems.toLocaleString()}\n💰 **Average:** ${avgGems.toLocaleString()}\n👑 **Top User:** ${topUser ? guild.members.cache.get(topUser.user_id)?.user.username || 'Unknown' : 'None'}`, inline: true },
            { name: '🏅 **Rank Distribution**', value: this.getRankDistribution(users), inline: true }
        );

        return embed;
    }

    getRankDistribution(users) {
        const distribution = {};
        this.ranks.forEach(rank => {
            distribution[rank.name] = 0;
        });

        users.forEach(user => {
            const rank = this.getUserRank(user.gems);
            distribution[rank.name]++;
        });

        return this.ranks.slice(0, 3).map(rank => 
            `${rank.color} **${rank.name}:** ${distribution[rank.name]}`
        ).join('\n');
    }

    createLeaderboardButtons(page, totalPages) {
        const row = new ActionRowBuilder();
        
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`leaderboard_prev_${page}`)
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(`leaderboard_page_${page}`)
                .setLabel(`Page ${page}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`leaderboard_next_${page}`)
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages)
        );

        return row;
    }
}

module.exports = RankSystem;
