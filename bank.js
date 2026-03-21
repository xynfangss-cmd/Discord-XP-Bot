const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class BankSystem {
    constructor(database) {
        this.db = database;
        this.interestRate = 0.05; // 5% daily interest
        this.minDeposit = 0; // No minimum deposit
        this.maxBalance = 10000000; // 10M max balance
    }

    async getBalance(userId, guildId) {
        const account = await this.db.getBankAccount(userId, guildId);
        if (!account) {
            await this.db.createBankAccount(userId, guildId);
            const newAccount = await this.db.getBankAccount(userId, guildId);
            return {
                balance: newAccount.balance,
                hasAccount: true,
                totalDeposited: newAccount.total_deposited,
                totalWithdrawn: newAccount.total_withdrawn,
                totalInterestEarned: newAccount.total_interest_earned,
                lastInterestDate: newAccount.last_interest_date
            };
        }

        return {
            balance: account.balance,
            hasAccount: true,
            totalDeposited: account.total_deposited,
            totalWithdrawn: account.total_withdrawn,
            totalInterestEarned: account.total_interest_earned,
            lastInterestDate: account.last_interest_date
        };
    }

    async deposit(userId, guildId, amount) {
        if (amount <= 0) {
            return { success: false, message: 'Deposit amount must be greater than zero!' };
        }

        const userData = await this.db.getUser(userId, guildId);
        if (!userData || userData.gems < amount) {
            return { success: false, message: 'You do not have enough gems to deposit!' };
        }

        let account = await this.db.getBankAccount(userId, guildId);
        if (!account) {
            await this.db.createBankAccount(userId, guildId);
            account = await this.db.getBankAccount(userId, guildId);
        }

        if (account.balance + amount > this.maxBalance) {
            const canDeposit = this.maxBalance - account.balance;
            return { 
                success: false, 
                message: `Maximum bank balance is ${this.maxBalance.toLocaleString()} gems. You can only deposit ${canDeposit.toLocaleString()} more gems.` 
            };
        }

        // Remove gems from wallet
        await this.db.updateUser(userId, guildId, {
            gems: userData.gems - amount
        });

        // Add gems to bank
        await this.db.updateBankAccount(userId, guildId, {
            balance: account.balance + amount,
            total_deposited: account.total_deposited + amount
        });

        const newAccount = await this.db.getBankAccount(userId, guildId);
        
        return {
            success: true,
            message: `Successfully deposited ${amount.toLocaleString()} gems!`,
            newBalance: newAccount.balance
        };
    }

    async withdraw(userId, guildId, amount) {
        const account = await this.db.getBankAccount(userId, guildId);
        if (!account) {
            return { success: false, message: 'You do not have a bank account!' };
        }

        if (amount > account.balance) {
            return { success: false, message: 'You do not have enough gems in your bank account!' };
        }

        const userData = await this.db.getUser(userId, guildId);
        if (!userData) {
            return { success: false, message: 'User data not found!' };
        }

        // Remove gems from bank
        await this.db.updateBankAccount(userId, guildId, {
            balance: account.balance - amount,
            total_withdrawn: account.total_withdrawn + amount
        });

        // Add gems to wallet
        await this.db.updateUser(userId, guildId, {
            gems: userData.gems + amount
        });

        const newAccount = await this.db.getBankAccount(userId, guildId);
        
        return {
            success: true,
            message: `Successfully withdrew ${amount.toLocaleString()} gems!`,
            newBalance: newAccount.balance
        };
    }

    async applyDailyInterest() {
        const allAccounts = await this.db.getAllBankAccounts();
        const today = new Date().toDateString();

        for (const account of allAccounts) {
            if (account.last_interest_date !== today && account.balance > 0) {
                const interest = Math.floor(account.balance * this.interestRate);
                const newBalance = Math.min(account.balance + interest, this.maxBalance);

                await this.db.updateBankAccount(account.user_id, account.guild_id, {
                    balance: newBalance,
                    last_interest_date: today,
                    total_interest_earned: account.total_interest_earned + interest
                });
                console.log(`Applied ${interest} interest to user ${account.user_id} in guild ${account.guild_id}. New balance: ${newBalance}`);
            }
        }
    }

    createBankEmbed(user, accountInfo) {
        const embed = new EmbedBuilder()
            .setTitle('🏦 Gem Bank')
            .setColor('#FFD700')
            .setThumbnail('https://i.imgur.com/9QaKxJt.png')
            .setDescription('💎 **Welcome to the Gem Bank!**\n\nStore your gems safely and earn 5% daily interest!')
            .addFields(
                { name: '� **Current Balance**', value: `**${accountInfo.balance.toLocaleString()}** gems`, inline: true },
                { name: '💰 **Total Deposited**', value: `**${accountInfo.totalDeposited.toLocaleString()}** gems`, inline: true },
                { name: '💸 **Total Withdrawn**', value: `**${accountInfo.totalWithdrawn.toLocaleString()}** gems`, inline: true }
            )
            .addFields(
                { name: '� **Interest Earned**', value: `**${accountInfo.totalInterestEarned.toLocaleString()}** gems`, inline: true },
                { name: '🎯 **Interest Applied**', value: accountInfo.lastInterestDate === new Date().toDateString() ? '**Today!**' : 'Not yet today', inline: true },
                { name: '💵 **Interest Rate**', value: '**5%** daily', inline: true }
            )
            .addFields(
                { name: '💎 **Bank Features**', value: '• 📈 **5% daily interest**\n• 🔒 **Safe gem storage**\n• 💰 **No minimum deposit**\n• 📊 **Max balance: 10M gems**', inline: false }
            )
            .setFooter({ text: '💎 Click the buttons below to manage your account!' })
            .setTimestamp();

        return embed;
    }

    createBankButtons(accountInfo) {
        const row = new ActionRowBuilder();

        row.addComponents(
            new ButtonBuilder()
                .setCustomId('bank_deposit')
                .setLabel('Deposit')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💰'),
            new ButtonBuilder()
                .setCustomId('bank_withdraw')
                .setLabel('Withdraw')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💸'),
            new ButtonBuilder()
                .setCustomId('bank_balance')
                .setLabel('Balance')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('💎')
        );
        
        return [row];
    }

    async createPersonalBalanceEmbedWithData(user, guildId, db, rankSystem) {
        const accountInfo = await this.getBalance(user.id, guildId);
        const userData = await db.getUser(user.id, guildId);
        const rank = rankSystem.getUserRank(userData.gems);

        const embed = new EmbedBuilder()
            .setTitle('💎 Your Balance & Rank')
            .setColor('#00BFFF')
            .setThumbnail(user.displayAvatarURL())
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
            .setFooter({ text: '💎 This message is only visible to you' })
            .setTimestamp();

        return embed;
    }
}

module.exports = BankSystem;
