const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class GiveawaySystem {
    constructor(database, client) {
        this.db = database;
        this.client = client;
        // Don't start giveaway checker in constructor - start it after bot is ready
    }

    startGiveawayChecker() {
        // Check every 30 seconds for ended giveaways and update active ones
        setInterval(async () => {
            await this.checkAndUpdateGiveaways();
        }, 30000);
    }

    async checkAndUpdateGiveaways() {
        try {
            // Get all active giveaways from all guilds
            const guilds = this.client.guilds.cache;
            
            for (const [guildId, guild] of guilds) {
                const activeGiveaways = await this.db.getActiveGiveaways(guildId);
                const now = Date.now();

                for (const giveaway of activeGiveaways) {
                    if (giveaway.end_time <= now) {
                        // End the giveaway
                        const winners = await this.endGiveaway(giveaway.id);
                        
                        // Announce winners
                        if (winners && winners.length > 0) {
                            const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
                            const endEmbed = new EmbedBuilder()
                                .setTitle('🎉 Giveaway Ended!')
                                .setColor('#FF0000')
                                .setDescription(`**Prize:** ${giveaway.prize}\n\n**🏆 Winners:** ${winnerMentions}`)
                                .setTimestamp();
                            
                            const channel = guild.channels.cache.get(giveaway.channel_id);
                            if (channel) {
                                await channel.send({ embeds: [endEmbed] });
                            }
                        } else {
                            const endEmbed = new EmbedBuilder()
                                .setTitle('🎉 Giveaway Ended!')
                                .setColor('#FF0000')
                                .setDescription(`**Prize:** ${giveaway.prize}\n\n**❌ No participants - No winner selected**`)
                                .setTimestamp();
                            
                            const channel = guild.channels.cache.get(giveaway.channel_id);
                            if (channel) {
                                await channel.send({ embeds: [endEmbed] });
                            }
                        }

                        // Update the original message
                        const channel = guild.channels.cache.get(giveaway.channel_id);
                        if (channel && giveaway.message_id) {
                            try {
                                const message = await channel.messages.fetch(giveaway.message_id);
                                const updatedEmbed = this.createGiveawayEmbed({...giveaway, status: 'ended'}, this.client);
                                updatedEmbed.setTitle('🎉 GIVEAWAY ENDED 🎉');
                                updatedEmbed.setColor('#FF0000');
                                
                                await message.edit({ 
                                    embeds: [updatedEmbed], 
                                    components: [] // Remove buttons
                                });
                            } catch (error) {
                                console.log('Could not update giveaway message:', error.message);
                            }
                        }
                    } else {
                        // Update active giveaway message with new time
                        const channel = guild.channels.cache.get(giveaway.channel_id);
                        
                        if (channel && giveaway.message_id) {
                            try {
                                const message = await channel.messages.fetch(giveaway.message_id);
                                const updatedEmbed = this.createGiveawayEmbed(giveaway, this.client);
                                
                                await message.edit({ embeds: [updatedEmbed] });
                            } catch (error) {
                                console.log('Could not update giveaway message:', error.message);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error checking giveaways:', error);
        }
    }

    async createGiveaway(guildId, channelId, prize, winners, endTime, entryCost, createdBy) {
        const result = await this.db.createGiveaway(
            guildId, 
            channelId, 
            prize, 
            winners, 
            endTime, 
            entryCost, 
            createdBy
        );
        
        return result.lastID;
    }

    createGiveawayEmbed(giveaway, client) {
        const guild = client.guilds.cache.get(giveaway.guild_id);
        const creator = guild.members.cache.get(giveaway.created_by);
        const participants = JSON.parse(giveaway.participants || '[]');
        
        // Count unique participants
        const uniqueParticipants = [...new Set(participants)];
        
        const timeLeft = giveaway.end_time - Date.now();
        const timeRemaining = this.formatTimeRemaining(giveaway.end_time);
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 GIVEAWAY 🎉')
            .setColor('#FFD700')
            .setDescription(`**Prize:** ${giveaway.prize}`)
            .addFields(
                { name: '🎯 Winners', value: `${giveaway.winners}`, inline: true },
                { name: '⏰ Time Left', value: timeRemaining, inline: true },
                { name: '💰 Entry Cost', value: giveaway.entry_cost > 0 ? `${giveaway.entry_cost} gems` : 'Free', inline: true },
                { name: '👥 Unique Participants', value: `${uniqueParticipants.length}`, inline: true },
                { name: '🎫 Total Entries', value: `${participants.length}`, inline: true },
                { name: '👤 Created by', value: creator ? creator.user.username : 'Unknown', inline: true }
            )
            .addFields(
                { 
                    name: '🔥 **Entry Multipliers**', 
                    value: '💎 **1M+ gems:** 10x entries\n💎 **500K+ gems:** 7x entries\n💎 **250K+ gems:** 5x entries\n💎 **100K+ gems:** 3x entries\n💎 **50K+ gems:** 2x entries\n💎 **Below 50K:** 1x entry', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Click the button below to enter! More gems = more entries!' })
            .setTimestamp();

        return embed;
    }

    formatTimeRemaining(endTime) {
        const now = Date.now();
        const diff = endTime - now;
        
        if (diff <= 0) {
            return 'Ended';
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        
        return parts.join(' ') || 'Less than 1m';
    }

    createGiveawayButtons(giveawayId) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway_join_${giveawayId}`)
                    .setLabel('Join Giveaway')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎉')
            );

        return row;
    }

    getEntryMultiplier(gems) {
        if (gems >= 1000000) return 10;        // 1M+ gems = 10x entries
        if (gems >= 500000) return 7;          // 500K+ gems = 7x entries
        if (gems >= 250000) return 5;          // 250K+ gems = 5x entries
        if (gems >= 100000) return 3;          // 100K+ gems = 3x entries
        if (gems >= 50000) return 2;           // 50K+ gems = 2x entries
        return 1;                              // Default 1x entry
    }

    async joinGiveaway(userId, giveawayId) {
        const giveaway = await this.db.getGiveaway(giveawayId);
        if (!giveaway || giveaway.status !== 'active') {
            return { success: false, message: 'This giveaway is not active!' };
        }

        const participants = JSON.parse(giveaway.participants || '[]');
        if (participants.includes(userId)) {
            return { success: false, message: 'You have already joined this giveaway!' };
        }

        // Get user data for entry multiplier calculation
        const userData = await this.db.getUser(userId, giveaway.guild_id);
        if (!userData) {
            return { success: false, message: 'You need to have a gem balance to join giveaways!' };
        }

        if (giveaway.entry_cost > 0) {
            if (userData.gems < giveaway.entry_cost) {
                return { 
                    success: false, 
                    message: `You need ${giveaway.entry_cost} gems to join this giveaway!` 
                };
            }

            // Deduct entry cost
            await this.db.updateUser(userId, giveaway.guild_id, {
                gems: userData.gems - giveaway.entry_cost
            });
        }

        // Calculate entry multiplier based on gem balance
        const entryMultiplier = this.getEntryMultiplier(userData.gems);
        
        // Add user entries (multiplied)
        for (let i = 0; i < entryMultiplier; i++) {
            participants.push(userId);
        }

        await this.db.updateGiveaway(giveawayId, {
            participants: JSON.stringify(participants)
        });

        const multiplierText = entryMultiplier > 1 ? ` (${entryMultiplier}x entries!)` : '';
        return { 
            success: true, 
            message: `Successfully joined the giveaway${multiplierText}!`,
            participants: participants.length,
            entries: entryMultiplier
        };
    }

    async endGiveaway(giveawayId) {
        const giveaway = await this.db.getGiveaway(giveawayId);
        if (!giveaway || giveaway.status !== 'active') {
            return;
        }

        const participants = JSON.parse(giveaway.participants || '[]');
        let winners = [];
        
        if (participants.length > 0) {
            const winnerCount = Math.min(giveaway.winners, participants.length);
            for (let i = 0; i < winnerCount; i++) {
                const randomIndex = Math.floor(Math.random() * participants.length);
                winners.push(participants[randomIndex]);
                participants.splice(randomIndex, 1);
            }
            
            // Auto-distribute gems to winners
            for (const winnerId of winners) {
                try {
                    const userData = await this.db.getUser(winnerId, giveaway.guild_id);
                    if (!userData) {
                        await this.db.createUser(winnerId, giveaway.guild_id);
                        userData = await this.db.getUser(winnerId, giveaway.guild_id);
                    }
                    
                    // Extract gem amount from prize if it's a gem prize, otherwise give a default amount
                    let gemAmount = 1000; // Default prize amount
                    const prizeMatch = giveaway.prize.match(/(\d+(?:,\d+)*)\s*(?:gems?|💎)/i);
                    if (prizeMatch) {
                        gemAmount = parseInt(prizeMatch[1].replace(/,/g, ''));
                    }
                    
                    // Give gems to winner with rank update
                    const newGems = userData.gems + gemAmount;
                    const { RankSystem } = require('./ranks');
                    const rankSystem = new RankSystem();
                    
                    await this.db.updateUser(winnerId, giveaway.guild_id, {
                        gems: newGems,
                        rank_tier: rankSystem.getUserRank(newGems).name
                    });
                    
                    console.log(`Auto-gave ${gemAmount} gems to winner ${winnerId} for giveaway ${giveawayId}`);
                    
                    // Try to DM the winner
                    try {
                        const guild = this.client.guilds.cache.get(giveaway.guild_id);
                        const member = guild.members.cache.get(winnerId);
                        if (member) {
                            const dmEmbed = new EmbedBuilder()
                                .setTitle('🎉 **Giveaway Winner!**')
                                .setColor('#00FF00')
                                .setDescription(`Congratulations! You won the giveaway for **${giveaway.prize}**!`)
                                .addFields(
                                    { name: '💎 **Prize Received**', value: `**${gemAmount.toLocaleString()}** gems`, inline: true },
                                    { name: '💰 **New Balance**', value: `**${newGems.toLocaleString()}** gems`, inline: true },
                                    { name: '🏆 **New Rank**', value: `**${rankSystem.getUserRank(newGems).name}**`, inline: true }
                                )
                                .setTimestamp();
                            
                            await member.user.send({ embeds: [dmEmbed] });
                        }
                    } catch (dmError) {
                        console.log('Could not DM giveaway winner:', dmError.message);
                    }
                } catch (error) {
                    console.error('Error giving gems to giveaway winner:', error);
                }
            }
        }

        await this.db.updateGiveaway(giveawayId, {
            status: 'ended',
            winner_ids: JSON.stringify(winners),
            participants: JSON.stringify(participants)
        });

        return winners;
    }

    createGiveawayEndEmbed(giveaway, winners, client) {
        const guild = client.guilds.cache.get(giveaway.guild_id);
        const creator = guild.members.cache.get(giveaway.created_by);
        
        const winnerNames = winners.map(winnerId => {
            const member = guild.members.cache.get(winnerId);
            return member ? member.user.username : `User ${winnerId}`;
        }).join(', ');

        const embed = new EmbedBuilder()
            .setTitle('🎊 GIVEAWAY ENDED 🎊')
            .setColor('#FF69B4')
            .setDescription(`**Prize:** ${giveaway.prize}`)
            .addFields(
                { name: '🏆 Winners', value: winnerNames || 'No participants', inline: true },
                { name: '👥 Total Participants', value: JSON.parse(giveaway.participants || '[]').length, inline: true },
                { name: '👤 Created by', value: creator ? creator.user.username : 'Unknown', inline: true }
            )
            .setFooter({ text: 'Congratulations to the winners!' })
            .setTimestamp();

        return embed;
    }

    createLeaderboardEmbed(users, guild) {
        const embed = new EmbedBuilder()
            .setTitle('🏆 Credit Leaderboard')
            .setColor('#FFD700')
            .setTimestamp();

        const topUsers = users.slice(0, 10);
        const leaderboardText = topUsers.map((user, index) => {
            const rank = this.rankSystem.getUserRank(user.credits);
            const member = guild.members.cache.get(user.user_id);
            const username = member ? member.user.username : `User ${user.user_id}`;
            
            return `**${index + 1}.** ${rank.color} ${username} - ${user.credits.toLocaleString()} credits`;
        }).join('\n');

        embed.setDescription(leaderboardText || 'No users found!');
        return embed;
    }
}

module.exports = GiveawaySystem;
