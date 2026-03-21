const { EmbedBuilder } = require('discord.js');

class AutoGiveawaySystem {
    constructor(database, giveawaySystem, client) {
        this.db = database;
        this.giveawaySystem = giveawaySystem;
        this.client = client;
        this.autoGiveaways = new Map(); // guildId -> config
        this.intervals = new Map(); // guildId -> interval
        this.scheduledGiveaways = new Map(); // guildId -> scheduled times
        this.timezone = 'America/Chicago'; // CST timezone
        // Don't start auto-giveaway checker in constructor - start it after bot is ready
    }

    startAutoGiveawayChecker() {
        // Check every minute for auto-giveaways that need to start
        setInterval(async () => {
            await this.checkAndStartGiveaways();
        }, 60000);
    }

    getCSTTime() {
        const now = new Date();
        // Convert to CST (America/Chicago timezone)
        return new Date(now.toLocaleString("en-US", { timeZone: this.timezone }));
    }

    async checkAndStartGiveaways() {
        for (const [guildId, config] of this.autoGiveaways) {
            if (!config.enabled) continue;

            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) continue;

            const lastGiveaway = config.lastGiveaway || 0;
            const intervalMs = config.interval * 60 * 1000; // Convert minutes to milliseconds
            const now = Date.now();

            if (now - lastGiveaway >= intervalMs) {
                await this.createAutoGiveaway(guildId, config);
                config.lastGiveaway = now;
                this.autoGiveaways.set(guildId, config);
                
                console.log(`🎉 Auto-giveaway created in ${guild.name} - Next in ${config.interval} minutes`);
            }
        }
    }

    convertTo24Hour(time12h) {
        const [time, period] = time12h.split(' ');
        const [hours, minutes] = time.split(':').map(Number);
        
        let hours24 = hours;
        if (period === 'PM' && hours !== 12) {
            hours24 += 12;
        } else if (period === 'AM' && hours === 12) {
            hours24 = 0;
        }
        
        return `${hours24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    async createAutoGiveaway(guildId, config) {
        try {
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) return;

            // Get the channel for giveaways
            const channel = guild.channels.cache.get(config.channelId);
            if (!channel || !channel.isTextBased()) return;

            // Generate random prize
            const prize = this.generateRandomPrize(config.prizePool);
            const winners = Math.floor(Math.random() * (config.maxWinners - config.minWinners + 1)) + config.minWinners;
            const duration = config.giveawayDuration; // Use configured duration
            const entryCost = Math.random() < 0.3 ? Math.floor(Math.random() * (config.maxEntryCost - config.minEntryCost + 1)) + config.minEntryCost : 0;

            // Create the giveaway
            const giveawayId = await this.giveawaySystem.createGiveaway(
                guildId,
                channel.id,
                prize,
                winners,
                Date.now() + (duration * 60 * 1000), // Convert minutes to milliseconds for end time
                entryCost,
                this.client.user.id // Bot creates the giveaway
            );

            // Save to database
            await this.saveAutoGiveawayConfig(guildId, config);

            // Send the giveaway message
            const giveaway = await this.db.getGiveaway(giveawayId);
            const embed = this.giveawaySystem.createGiveawayEmbed(giveaway, this.client);
            const buttons = this.giveawaySystem.createGiveawayButtons(giveawayId);
            
            const message = await channel.send({ embeds: [embed], components: [buttons] });
            
            // Update giveaway with message ID
            await this.db.updateGiveaway(giveawayId, { message_id: message.id });

            console.log(`🎉 Auto-giveaway created in ${guild.name}: ${prize} (${duration} minutes)`);

        } catch (error) {
            console.error('Error creating auto-giveaway:', error);
        }
    }

    generateRandomPrize(prizePool) {
        if (prizePool && prizePool.length > 0) {
            return prizePool[Math.floor(Math.random() * prizePool.length)];
        }

        // Generate random gem amounts
        const gemRanges = [
            { min: 1000, max: 5000, weight: 40 },    // 40% chance for 1K-5K
            { min: 5000, max: 15000, weight: 30 },   // 30% chance for 5K-15K
            { min: 15000, max: 50000, weight: 20 },  // 20% chance for 15K-50K
            { min: 50000, max: 100000, weight: 8 },  // 8% chance for 50K-100K
            { min: 100000, max: 250000, weight: 2 }  // 2% chance for 100K-250K
        ];

        // Weighted random selection
        const totalWeight = gemRanges.reduce((sum, range) => sum + range.weight, 0);
        let random = Math.random() * totalWeight;
        
        let selectedRange = gemRanges[0];
        for (const range of gemRanges) {
            random -= range.weight;
            if (random <= 0) {
                selectedRange = range;
                break;
            }
        }

        const randomAmount = Math.floor(Math.random() * (selectedRange.max - selectedRange.min + 1)) + selectedRange.min;
        return `${randomAmount.toLocaleString()} gems 💎`;
    }

    async enableAutoGiveaway(guildId, channelId, config = {}) {
        const defaultConfig = {
            enabled: true,
            channelId: channelId,
            interval: 30, // 30 minutes between giveaways
            giveawayDuration: 15, // 15 minutes for each giveaway
            minWinners: 1,
            maxWinners: 3,
            minEntryCost: 0,
            maxEntryCost: 5000,
            prizePool: [], // Custom prize pool
            lastGiveaway: 0
        };

        const finalConfig = { ...defaultConfig, ...config };
        this.autoGiveaways.set(guildId, finalConfig);
        await this.saveAutoGiveawayConfig(guildId, finalConfig);

        return finalConfig;
    }

    async setGiveawayDuration(guildId, duration) {
        const config = this.autoGiveaways.get(guildId);
        if (!config) return false;

        // Validate duration (5-120 minutes)
        if (duration < 5 || duration > 120) {
            throw new Error('Duration must be between 5 and 120 minutes');
        }

        config.giveawayDuration = duration;
        this.autoGiveaways.set(guildId, config);
        await this.saveAutoGiveawayConfig(guildId, config);
        return true;
    }

    async setInterval(guildId, interval) {
        const config = this.autoGiveaways.get(guildId);
        if (!config) return false;

        // Validate interval (5-1440 minutes)
        if (interval < 5 || interval > 1440) {
            throw new Error('Interval must be between 5 and 1440 minutes');
        }

        config.interval = interval;
        this.autoGiveaways.set(guildId, config);
        await this.saveAutoGiveawayConfig(guildId, config);
        return true;
    }

    async disableAutoGiveaway(guildId) {
        const config = this.autoGiveaways.get(guildId);
        if (config) {
            config.enabled = false;
            this.autoGiveaways.set(guildId, config);
            await this.saveAutoGiveawayConfig(guildId, config);
        }
    }

    async saveAutoGiveawayConfig(guildId, config) {
        // This would save to database, for now we'll keep it in memory
        // In a production bot, you'd want to persist this
        console.log(`Auto-giveaway config updated for guild ${guildId}:`, config);
    }

    async loadAutoGiveawayConfig(guildId) {
        // This would load from database
        // For now, return null (no auto-giveaways configured)
        return null;
    }

    getAutoGiveawayConfig(guildId) {
        return this.autoGiveaways.get(guildId);
    }

    createAutoGiveawayEmbed(guild, config) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Auto-Giveaway Status')
            .setColor('#00FF00')
            .addFields(
                { name: '🔄 Status', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '📍 Channel', value: `<#${config.channelId}>`, inline: true },
                { name: '🌍 Timezone', value: 'CST (Central Standard Time)', inline: true },
                { name: '⏰ Interval', value: `Every ${config.interval} minutes`, inline: true },
                { name: '⏱️ Duration', value: `${config.giveawayDuration} minutes`, inline: true },
                { name: '🎯 Winners', value: `${config.minWinners}-${config.maxWinners}`, inline: true }
            )
            .addFields(
                { name: '� Entry Cost', value: `${config.minEntryCost}-${config.maxEntryCost} gems`, inline: true }
            )
            .setTimestamp();

        if (config.prizePool && config.prizePool.length > 0) {
            embed.addFields({
                name: '🎁 Prize Pool',
                value: config.prizePool.slice(0, 5).join('\n') + (config.prizePool.length > 5 ? `\n... and ${config.prizePool.length - 5} more` : ''),
                inline: false
            });
        }

        const cstTime = this.getCSTTime();
        const currentTimeStr = cstTime.toLocaleTimeString('en-US', { 
            timeZone: this.timezone,
            hour: '2-digit',
            minute: '2-digit'
        });
        
        embed.setFooter({ text: `Current CST time: ${currentTimeStr}` });
        return embed;
    }
}

module.exports = AutoGiveawaySystem;
