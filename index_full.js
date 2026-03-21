require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder } = require('discord.js');
const Database = require('./database');
const RankSystem = require('./ranks');
const ChestSystem = require('./chest');
const GiveawaySystem = require('./giveaway');
const BankSystem = require('./bank');
const TicketSystem = require('./ticket');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Initialize systems
const db = new Database();
const rankSystem = new RankSystem();
const chestSystem = new ChestSystem(db, client);
const giveawaySystem = new GiveawaySystem(db, client);
const bankSystem = new BankSystem(db);
const ticketSystem = new TicketSystem(db, client);

// Cooldowns and pending transactions
const cooldowns = new Set();
const pendingBankTransactions = new Map();
const bankUpdateIntervals = new Map();

// Ready event
client.once('ready', async () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    
    // Set bot status
    client.user.setActivity('💎 Gem Economy', { type: 'WATCHING' });
    
    // Apply daily interest
    setInterval(async () => {
        await bankSystem.applyDailyInterest();
    }, 60000); // Check every minute
    
    console.log('🏦 Bank interest system started');
});

// MessageCreate event for bank transactions
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const pendingTransaction = pendingBankTransactions.get(message.author.id);
    if (!pendingTransaction) return;
    
    // Parse amount with support for k, m, b suffixes
    let amount;
    const content = message.content.toLowerCase().trim();
    
    if (content.includes('k')) {
        amount = parseInt(parseFloat(content.replace('k', '')) * 1000);
    } else if (content.includes('m')) {
        amount = parseInt(parseFloat(content.replace('m', '')) * 1000000);
    } else if (content.includes('b')) {
        amount = parseInt(parseFloat(content.replace('b', '')) * 1000000000);
    } else {
        amount = parseInt(content);
    }
    
    if (isNaN(amount) || amount <= 0) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Invalid Amount')
            .setColor('#FF0000')
            .setDescription('Please enter a valid positive number!')
            .addFields(
                { name: '💡 **Examples**', value: '• `1000` or `1k` for 1,000\n• `50000` or `50k` for 50,000\n• `1000000` or `1m` for 1,000,000', inline: false }
            )
            .setTimestamp();
        
        await message.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
    }
    
    // Handle transaction
    try {
        let result;
        
        switch (pendingTransaction) {
            case 'deposit':
                result = await bankSystem.deposit(message.author.id, message.guild.id, amount);
                break;
            case 'withdraw':
                result = await bankSystem.withdraw(message.author.id, message.guild.id, amount);
                break;
        }
        
        // Send result
        const resultEmbed = new EmbedBuilder()
            .setTitle(result.success ? '✅ Transaction Successful' : '❌ Transaction Failed')
            .setColor(result.success ? '#00FF00' : '#FF0000')
            .setDescription(result.message)
            .setTimestamp();
        
        if (result.success) {
            const updatedAccount = await bankSystem.getBalance(message.author.id, message.guild.id);
            const updatedUserData = await db.getUser(message.author.id, message.guild.id);
            
            resultEmbed.addFields(
                { name: '💎 **New Wallet Balance**', value: `**${updatedUserData.gems.toLocaleString()}** gems`, inline: true },
                { name: '🏦 **New Bank Balance**', value: `**${updatedAccount.balance.toLocaleString()}** gems`, inline: true }
            );
        }
        
        await message.reply({ embeds: [resultEmbed], ephemeral: true });
        
        // Clear pending transaction
        pendingBankTransactions.delete(message.author.id);
        
    } catch (error) {
        console.error('Error processing transaction:', error);
        await message.reply({ 
            content: '❌ An error occurred while processing your transaction. Please try again.', 
            ephemeral: true 
        });
    }
});

// InteractionCreate event for slash commands and buttons
client.on('interactionCreate', async (interaction) => {
    try {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction);
        }
        // Handle button interactions
        else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        }
        // Handle modal submissions
        else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        }
        // Handle select menus
        else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction);
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
        }
    }
});

// Slash command handler
async function handleSlashCommand(interaction) {
    const command = interaction.commandName;
    
    switch (command) {
        // Economy Commands
        case 'balance':
            await handleBalance(interaction);
            break;
        case 'bank':
            await handleBank(interaction);
            break;
        case 'deposit':
            await handleQuickDeposit(interaction);
            break;
        case 'withdraw':
            await handleQuickWithdraw(interaction);
            break;
        case 'daily':
            await handleDaily(interaction);
            break;
        case 'work':
            await handleWork(interaction);
            break;
        case 'gamble':
            await handleGamble(interaction);
            break;
            
        // Rank Commands
        case 'rank':
            await handleRank(interaction);
            break;
        case 'ranks':
            await handleRanks(interaction);
            break;
        case 'leaderboard':
            await handleLeaderboard(interaction);
            break;
            
        // Fun Commands
        case 'chest':
            await handleChest(interaction);
            break;
        case 'slots':
            await handleSlots(interaction);
            break;
        case 'coinflip':
            await handleCoinflip(interaction);
            break;
            
        // Giveaway Commands
        case 'giveaway':
            await handleGiveaway(interaction);
            break;
            
        // Ticket Commands
        case 'ticket':
            await handleTicket(interaction);
            break;
            
        // Admin Commands
        case 'admin':
            await handleAdmin(interaction);
            break;
            
        // Utility Commands
        case 'help':
            await handleHelp(interaction);
            break;
        case 'ping':
            await handlePing(interaction);
            break;
        case 'serverinfo':
            await handleServerInfo(interaction);
            break;
        case 'userinfo':
            await handleUserInfo(interaction);
            break;
    }
}

// Economy Command Handlers
async function handleBalance(interaction) {
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
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

async function handleBank(interaction) {
    await interaction.deferReply();
    
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    // Clear any existing interval for this user
    if (bankUpdateIntervals.has(userId)) {
        clearInterval(bankUpdateIntervals.get(userId));
        bankUpdateIntervals.delete(userId);
    }
    
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
            // If message was deleted or interaction expired, clear the interval
            clearInterval(interval);
            bankUpdateIntervals.delete(userId);
        }
    }, 10000); // 10 seconds
    
    // Store the interval so we can clear it later
    bankUpdateIntervals.set(userId, interval);
}

async function handleQuickDeposit(interaction) {
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

async function handleQuickWithdraw(interaction) {
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

async function handleDaily(interaction) {
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    const now = new Date();
    const lastDaily = userData.last_daily ? new Date(userData.last_daily) : null;
    
    // Check if user can claim daily (24 hour cooldown)
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
    
    // Calculate daily reward (base 1000 + random bonus)
    const baseReward = 1000;
    const bonusReward = Math.floor(Math.random() * 2000); // 0-2000 bonus
    const totalReward = baseReward + bonusReward;
    
    // Give reward
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

async function handleWork(interaction) {
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    const now = new Date();
    const lastWork = userData.last_work ? new Date(userData.last_work) : null;
    
    // Check cooldown (1 hour)
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
    
    // Calculate work reward (random between 500-2000)
    const reward = Math.floor(Math.random() * 1500) + 500;
    
    // Give reward
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

async function handleGamble(interaction) {
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    
    // Check if user has enough gems
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
    
    // Gamble logic (50% chance to win, 2x multiplier)
    const won = Math.random() < 0.5;
    const winAmount = won ? amount * 2 : 0;
    const netChange = won ? amount : -amount;
    
    // Update balance
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

// Button interaction handler
async function handleButtonInteraction(interaction) {
    if (interaction.customId.startsWith('bank_')) {
        await handleBankInteraction(interaction);
    } else if (interaction.customId.startsWith('chest_')) {
        await handleChestInteraction(interaction);
    } else if (interaction.customId.startsWith('giveaway_')) {
        await handleGiveawayInteraction(interaction);
    } else if (interaction.customId === 'create_ticket_panel') {
        await handleTicketPanelButton(interaction);
    } else if (interaction.customId.startsWith('close_ticket_')) {
        await handleCloseTicketButton(interaction);
    }
}

async function handleTicketPanelButton(interaction) {
    await interaction.deferUpdate();
    
    const modal = await ticketSystem.createTicketModal('General Support');
    await interaction.showModal(modal);
}

async function handleCloseTicketButton(interaction) {
    const ticketId = interaction.customId.replace('close_ticket_', '');
    
    await interaction.deferReply();
    
    // Check if user has permission to close tickets
    if (!interaction.member.permissions.has('ManageChannels') && !interaction.member.roles.cache.some(role => 
        role.name.toLowerCase().includes('staff') ||
        role.name.toLowerCase().includes('admin') ||
        role.name.toLowerCase().includes('moderator')
    )) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** Only staff members can close tickets.',
            ephemeral: true
        });
    }
    
    try {
        await ticketSystem.closeTicket(ticketId, interaction.user.id, 'Closed via button');
        
        // Close and archive the channel
        const channel = interaction.channel;
        await channel.setName(`closed-${ticketId.toLowerCase()}`);
        await channel.permissionOverwrites.set([
            {
                id: interaction.guild.id,
                deny: ['ViewChannel', 'SendMessages']
            },
            {
                id: interaction.user.id,
                allow: ['ViewChannel', 'ReadMessageHistory'],
                deny: ['SendMessages']
            }
        ]);
        
        const embed = new EmbedBuilder()
            .setTitle('🔒 Ticket Closed')
            .setColor('#FF0000')
            .setDescription(`This ticket has been closed by ${interaction.user.toString()}`)
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        
        await interaction.editReply({
            content: `✅ **Ticket ${ticketId} has been closed successfully!**`,
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error closing ticket:', error);
        await interaction.editReply({
            content: '❌ **Error closing ticket!** Please try again.',
            ephemeral: true
        });
    }
}

// Bank button interaction handler
async function handleBankInteraction(interaction) {
    const action = interaction.customId.replace('bank_', '');
    
    switch (action) {
        case 'deposit':
            await interaction.deferUpdate();
            
            // Get account info
            const accountInfo = await bankSystem.getBalance(interaction.user.id, interaction.guild.id);
            const userData = await db.getUser(interaction.user.id, interaction.guild.id);
            
            // Set pending transaction
            pendingBankTransactions.set(interaction.user.id, 'deposit');
            
            const embed = new EmbedBuilder()
                .setTitle('💰 **Deposit Gems**')
                .setColor('#00FF00')
                .setDescription('How much would you like to deposit to your bank account?')
                .addFields(
                    { name: '💎 **Current Wallet**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                    { name: '🏦 **Current Bank**', value: `**${accountInfo.balance.toLocaleString()}** gems`, inline: true },
                    { name: '💰 **No Minimum**', value: '**Deposit any amount!**', inline: true }
                )
                .addFields(
                    { name: '💡 **Accepted Formats**', value: '• `1000` - One thousand\n• `50k` - Fifty thousand\n• `1.5m` - One point five million\n• `2b` - Two billion', inline: false }
                )
                .setFooter({ text: 'Type the amount in chat (only you can see this message)' })
                .setTimestamp();
            
            await interaction.followUp({
                content: 'Please reply with the amount you want to deposit:',
                embeds: [embed],
                ephemeral: true
            });
            break;
            
        case 'withdraw':
            await interaction.deferUpdate();
            
            // Get account info
            const withdrawAccountInfo = await bankSystem.getBalance(interaction.user.id, interaction.guild.id);
            const withdrawUserData = await db.getUser(interaction.user.id, interaction.guild.id);
            
            // Set pending transaction
            pendingBankTransactions.set(interaction.user.id, 'withdraw');
            
            const withdrawEmbed = new EmbedBuilder()
                .setTitle('💸 **Withdraw Gems**')
                .setColor('#FFA500')
                .setDescription('How much would you like to withdraw from your bank account?')
                .addFields(
                    { name: '🏦 **Current Bank**', value: `**${withdrawAccountInfo.balance.toLocaleString()}** gems`, inline: true },
                    { name: '💎 **Current Wallet**', value: `**${withdrawUserData.gems.toLocaleString()}** gems`, inline: true },
                    { name: '💰 **Available to Withdraw**', value: `**${withdrawAccountInfo.balance.toLocaleString()}** gems`, inline: true }
                )
                .addFields(
                    { name: '💡 **Accepted Formats**', value: '• `1000` - One thousand\n• `50k` - Fifty thousand\n• `1.5m` - One point five million\n• `2b` - Two billion', inline: false }
                )
                .setFooter({ text: 'Type the amount in chat (only you can see this message)' })
                .setTimestamp();
            
            await interaction.followUp({
                content: 'Please reply with the amount you want to withdraw:',
                embeds: [withdrawEmbed],
                ephemeral: true
            });
            break;
            
        case 'balance':
            await interaction.deferUpdate();
            // Show personal balance and rank (only visible to user)
            const balanceEmbed = await bankSystem.createPersonalBalanceEmbedWithData(interaction.user, interaction.guild.id, db, rankSystem);
            
            await interaction.followUp({
                embeds: [balanceEmbed],
                ephemeral: true // Only visible to the user who clicked
            });
            break;
    }
}

// Placeholder handlers for other commands (to be implemented)
async function handleRank(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    await interaction.deferReply();
    
    const userData = await db.getUser(targetUser.id, interaction.guild.id);
    const rank = rankSystem.getUserRank(userData.gems);
    const xp = rankSystem.calculateXP(userData.gems);
    const nextRank = rankSystem.getNextRank(userData.gems);
    const progress = rankSystem.getProgressToNextRank(userData.gems);
    
    const embed = new EmbedBuilder()
        .setTitle(`⭐ **${targetUser.username}'s Rank & Stats**`)
        .setColor(rank.color.replace('�', '#0000FF').replace('🟩', '#00FF00').replace('🟨', '#FFFF00').replace('🟧', '#FFA500').replace('🟥', '#FF0000').replace('🟪', '#800080').replace('⚫', '#000000').replace('⚪', '#FFFFFF'))
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(`${rank.color} **Current Rank:** ${rank.name}`)
        .addFields(
            { name: '💎 **Gems**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
            { name: '📈 **XP**', value: `**${xp.toLocaleString()}** XP`, inline: true },
            { name: '🏆 **Rank Level**', value: `**${rank.level}**`, inline: true }
        );
    
    if (nextRank) {
        embed.addFields(
            { name: '🎯 **Next Rank**', value: `**${nextRank.name}** (${nextRank.required.toLocaleString()} gems)`, inline: true },
            { name: '📊 **Progress**', value: `**${progress}%** (${(userData.gems).toLocaleString()}/${nextRank.required.toLocaleString()})`, inline: true },
            { name: '💰 **Needed**', value: `**${(nextRank.required - userData.gems).toLocaleString()}** gems`, inline: true }
        );
    } else {
        embed.addFields(
            { name: '👑 **Max Rank**', value: '**You\'ve reached the highest rank!**', inline: false }
        );
    }
    
    embed.addFields(
        { name: '📝 **Rank Description**', value: rank.description, inline: false }
    )
    .setFooter({ text: `💎 Use /ranks to see all available ranks` })
    .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleRanks(interaction) {
    await interaction.deferReply();
    
    const allRanks = rankSystem.getAllRanks();
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    const currentRank = rankSystem.getUserRank(userData.gems);
    
    const embed = new EmbedBuilder()
        .setTitle('🏆 **All Available Ranks**')
        .setColor('#00BFFF')
        .setDescription('Here are all the ranks you can achieve by earning gems!')
        .setThumbnail('https://i.imgur.com/9QaKxJt.png');
    
    // Group ranks by tier
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

async function handleLeaderboard(interaction) {
    await interaction.deferReply();
    
    try {
        // Get top 50 users by gems
        const topUsers = await db.getTopUsers(interaction.guild.id, 50);
        const userData = await db.getUser(interaction.user.id, interaction.guild.id);
        
        // Find user's position
        const userPosition = topUsers.findIndex(u => u.user_id === interaction.user.id) + 1;
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 **Gem Leaderboard**')
            .setColor('#FFD700')
            .setDescription(`Top gem earners in **${interaction.guild.name}**!`)
            .setThumbnail('https://i.imgur.com/9QaKxJt.png');
        
        // Display top 10
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
        
        // Show user's position if not in top 10
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
            ephemeral: true
        });
    }
}

async function handleChest(interaction) {
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    const chestCost = 100; // Cost to open a chest
    
    // Check if user has enough gems
    if (userData.gems < chestCost) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Insufficient Gems')
            .setColor('#FF0000')
            .setDescription('You do not have enough gems to open a mystery chest!')
            .addFields(
                { name: '� **Your Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                { name: '💸 **Cost**', value: `**${chestCost.toLocaleString()}** gems`, inline: true },
                { name: '💎 **Needed**', value: `**${(chestCost - userData.gems).toLocaleString()}** gems`, inline: true }
            )
            .setFooter({ text: 'Earn more gems with /work and /daily!' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    // Open the chest
    await db.updateUser(interaction.user.id, interaction.guild.id, {
        gems: userData.gems - chestCost
    });
    
    // Calculate rewards (weighted random)
    const rewards = [
        { min: 50, max: 200, weight: 40, name: 'Small Prize' },
        { min: 200, max: 500, weight: 30, name: 'Medium Prize' },
        { min: 500, max: 1000, weight: 20, name: 'Large Prize' },
        { min: 1000, max: 2500, weight: 8, name: 'Super Prize' },
        { min: 2500, max: 5000, weight: 2, name: 'Mega Prize' }
    ];
    
    // Weighted random selection
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
    
    // Give reward to user
    await db.updateUser(interaction.user.id, interaction.guild.id, {
        gems: userData.gems - chestCost + rewardAmount
    });
    
    const netProfit = rewardAmount - chestCost;
    const profitColor = netProfit >= 0 ? '#00FF00' : '#FF0000';
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

async function handleSlots(interaction) {
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    
    // Check if user has enough gems
    if (userData.gems < amount) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Insufficient Gems')
            .setColor('#FF0000')
            .setDescription('You do not have enough gems to play the slot machine!')
            .addFields(
                { name: '💰 **Your Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                { name: '� **Bet Amount**', value: `**${amount.toLocaleString()}** gems`, inline: true }
            )
            .setFooter({ text: 'Earn more gems with /work and /daily!' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    // Slot machine symbols
    const symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣'];
    const weights = [30, 25, 20, 15, 8, 2]; // Weighted probabilities
    
    // Spin the slots
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
    
    // Calculate winnings
    let winAmount = 0;
    let winType = '';
    
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
        // Three of a kind
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
        // Two of a kind
        winAmount = amount * 0.5;
        winType = 'Two of a Kind!';
    } else if (reels.includes('💎')) {
        // Any diamond
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

async function handleCoinflip(interaction) {
    const choice = interaction.options.getString('choice');
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    
    // Check if user has enough gems
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
    
    // Flip the coin
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

async function handleGiveaway(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
        case 'create':
            await handleGiveawayCreate(interaction);
            break;
        case 'end':
            await handleGiveawayEnd(interaction);
            break;
        case 'reroll':
            await handleGiveawayReroll(interaction);
            break;
    }
}

async function handleGiveawayCreate(interaction) {
    const prize = interaction.options.getString('prize');
    const duration = interaction.options.getInteger('duration') || 60; // Default 60 minutes
    const winners = interaction.options.getInteger('winners') || 1; // Default 1 winner
    
    await interaction.deferReply();
    
    // Check if user has permission to create giveaways
    if (!interaction.member.permissions.has('ManageEvents') && !interaction.member.permissions.has('Administrator')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need "Manage Events" or "Administrator" permission to create giveaways.',
            ephemeral: true
        });
    }
    
    try {
        const giveawayId = await giveawaySystem.createGiveaway(
            interaction.guild.id,
            interaction.channel.id,
            interaction.user.id,
            prize,
            duration,
            winners
        );
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 **New Giveaway!**')
            .setColor('#00FF00')
            .setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\n**Duration:** ${duration} minutes`)
            .addFields(
                { name: '🎫 **How to Enter**', value: 'Click the "Enter Giveaway" button below!', inline: false },
                { name: '⏰ **Ends In**', value: `<t:${Math.floor(Date.now() / 1000) + (duration * 60)}:R>`, inline: false }
            )
            .setFooter({ text: `Giveaway ID: ${giveawayId}` })
            .setTimestamp();
        
        const enterButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway_enter_${giveawayId}`)
                    .setLabel('Enter Giveaway')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎉')
            );
        
        const message = await interaction.channel.send({
            content: '@everyone 🎉 **New Giveaway Started!**',
            embeds: [embed],
            components: [enterButton]
        });
        
        // Update giveaway with message ID
        await db.updateGiveawayMessage(giveawayId, message.id);
        
        await interaction.editReply({
            content: `✅ **Giveaway Created Successfully!**\n**Giveaway ID:** ${giveawayId}\n**Prize:** ${prize}`,
            ephemeral: true
        });
        
        // Schedule giveaway end
        setTimeout(async () => {
            await endGiveaway(giveawayId);
        }, duration * 60 * 1000);
        
    } catch (error) {
        console.error('Error creating giveaway:', error);
        await interaction.editReply({
            content: '❌ **Error creating giveaway!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleGiveawayEnd(interaction) {
    await interaction.deferReply();
    
    // Check if user has permission to end giveaways
    if (!interaction.member.permissions.has('ManageEvents') && !interaction.member.permissions.has('Administrator')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need "Manage Events" or "Administrator" permission to end giveaways.',
            ephemeral: true
        });
    }
    
    // Find active giveaways in the channel
    const giveaways = await giveawaySystem.getActiveGiveaways(interaction.guild.id);
    
    if (giveaways.length === 0) {
        return await interaction.editReply({
            content: '❌ **No Active Giveaways!** There are no active giveaways in this server.',
            ephemeral: true
        });
    }
    
    // End the most recent giveaway
    const latestGiveaway = giveaways[giveaways.length - 1];
    await endGiveaway(latestGiveaway.id);
    
    await interaction.editReply({
        content: `✅ **Giveaway Ended!** Giveaway ${latestGiveaway.id} has been ended and winners have been selected.`,
        ephemeral: true
    });
}

async function handleGiveawayReroll(interaction) {
    await interaction.deferReply();
    
    // Check if user has permission to reroll giveaways
    if (!interaction.member.permissions.has('ManageEvents') && !interaction.member.permissions.has('Administrator')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need "Manage Events" or "Administrator" permission to reroll giveaways.',
            ephemeral: true
        });
    }
    
    // Find ended giveaways in the channel
    const giveaways = await giveawaySystem.getEndedGiveaways(interaction.guild.id);
    
    if (giveaways.length === 0) {
        return await interaction.editReply({
            content: '❌ **No Ended Giveaways!** There are no ended giveaways to reroll.',
            ephemeral: true
        });
    }
    
    // Reroll the most recent giveaway
    const latestGiveaway = giveaways[giveaways.length - 1];
    
    try {
        const newWinner = await giveawaySystem.rerollGiveaway(latestGiveaway.id);
        
        if (!newWinner) {
            return await interaction.editReply({
                content: '❌ **No Entries!** There are no entries to reroll from.',
                ephemeral: true
            });
        }
        
        const winner = await interaction.guild.members.fetch(newWinner);
        
        const embed = new EmbedBuilder()
            .setTitle('🎲 **Giveaway Rerolled!**')
            .setColor('#FFD700')
            .setDescription(`**New Winner:** ${winner.toString()}\n**Prize:** ${latestGiveaway.prize}`)
            .addFields(
                { name: '🎉 **Congratulations!**', value: `${winner.toString()} has won the giveaway!`, inline: false }
            )
            .setFooter({ text: `Giveaway ID: ${latestGiveaway.id}` })
            .setTimestamp();
        
        await interaction.channel.send({
            content: `${winner.toString()} 🎉 **New Winner!**`,
            embeds: [embed]
        });
        
        await interaction.editReply({
            content: `✅ **Giveaway Rerolled!** New winner: ${winner.toString()}`,
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error rerolling giveaway:', error);
        await interaction.editReply({
            content: '❌ **Error rerolling giveaway!** Please try again later.',
            ephemeral: true
        });
    }
}

async function endGiveaway(giveawayId) {
    try {
        const giveaway = await giveawaySystem.getGiveaway(giveawayId);
        if (!giveaway || giveaway.status !== 'active') return;
        
        const winners = await giveawaySystem.endGiveaway(giveawayId);
        
        if (winners.length === 0) {
            // No winners
            const embed = new EmbedBuilder()
                .setTitle('🎉 **Giveaway Ended!**')
                .setColor('#FFA500')
                .setDescription(`**Prize:** ${giveaway.prize}\n**Winners:** No one entered!`)
                .addFields(
                    { name: '� **No Winners**', value: 'Unfortunately, no one entered this giveaway.', inline: false }
                )
                .setFooter({ text: `Giveaway ID: ${giveawayId}` })
                .setTimestamp();
            
            // Update the giveaway message
            const channel = giveawaySystem.client.channels.cache.get(giveaway.channel_id);
            if (channel) {
                const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
                if (message) {
                    await message.edit({
                        embeds: [embed],
                        components: []
                    });
                }
            }
            
        } else {
            // We have winners
            const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
            
            const embed = new EmbedBuilder()
                .setTitle('🎉 **Giveaway Ended!**')
                .setColor('#00FF00')
                .setDescription(`**Prize:** ${giveaway.prize}\n**Winners (${winners.length}):** ${winnerMentions}`)
                .addFields(
                    { name: '🎊 **Congratulations!**', value: `${winnerMentions} have won the giveaway!`, inline: false }
                )
                .setFooter({ text: `Giveaway ID: ${giveawayId}` })
                .setTimestamp();
            
            // Update the giveaway message
            const channel = giveawaySystem.client.channels.cache.get(giveaway.channel_id);
            if (channel) {
                const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
                if (message) {
                    await message.edit({
                        embeds: [embed],
                        components: []
                    });
                    
                    // Announce winners
                    await channel.send({
                        content: `🎉 **Giveaway Winners!**\n${winnerMentions}\n\nCongratulations! You've won **${giveaway.prize}**!`
                    });
                }
            }
        }
        
    } catch (error) {
        console.error('Error ending giveaway:', error);
    }
}

async function handleTicket(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
        case 'create':
            await handleTicketCreate(interaction);
            break;
        case 'close':
            await handleTicketClose(interaction);
            break;
        case 'panel':
            await handleTicketPanel(interaction);
            break;
    }
}

async function handleTicketCreate(interaction) {
    const reason = interaction.options.getString('reason');
    
    await interaction.deferReply({ ephemeral: true });
    
    const ticketId = await ticketSystem.createTicket(
        interaction.user.id,
        interaction.guild.id,
        reason,
        'General Support'
    );
    
    try {
        const channel = await ticketSystem.createTicketChannel(
            interaction.guild,
            interaction.user,
            ticketId,
            'General Support',
            reason
        );
        
        // Update ticket with channel ID
        await db.updateTicketChannel(ticketId, channel.id);
        
        const embed = new EmbedBuilder()
            .setTitle('🎫 Ticket Created Successfully!')
            .setColor('#00FF00')
            .setDescription(`Your support ticket has been created!`)
            .addFields(
                { name: '🎫 **Ticket ID**', value: `**${ticketId}**`, inline: true },
                { name: '💬 **Channel**', value: `${channel.toString()}`, inline: true },
                { name: '📝 **Reason**', value: reason, inline: false }
            )
            .addFields(
                { name: '📍 **Next Steps**', value: '• Staff will be notified of your ticket\n• You can discuss your issue in the ticket channel\n• Staff will respond as soon as possible', inline: false }
            )
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        // Log to console
        console.log(`Ticket ${ticketId} created by ${interaction.user.username}`);
        
    } catch (error) {
        console.error('Error creating ticket channel:', error);
        await interaction.editReply({
            content: '❌ **Error creating ticket!** Please try again later or contact staff.',
            ephemeral: true
        });
    }
}

async function handleTicketClose(interaction) {
    await interaction.reply('🚧 Ticket close command is being remade!');
}

async function handleTicketPanel(interaction) {
    await interaction.deferReply();
    
    const embed = ticketSystem.createTicketPanelEmbed();
    const buttons = ticketSystem.createTicketPanelButtons();
    
    await interaction.editReply({ 
        embeds: [embed], 
        components: buttons 
    });
}

async function handleAdmin(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
        case 'givegems':
            await handleAdminGiveGems(interaction);
            break;
        case 'giveall':
            await handleAdminGiveAll(interaction);
            break;
        case 'setbalance':
            await handleAdminSetBalance(interaction);
            break;
        case 'resetuser':
            await handleAdminResetUser(interaction);
            break;
    }
}

async function handleAdminGiveGems(interaction) {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply({ ephemeral: true });
    
    // Check if user has admin permissions
    if (!interaction.member.permissions.has('Administrator')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need Administrator permission to use this command.',
            ephemeral: true
        });
    }
    
    try {
        const userData = await db.getUser(targetUser.id, interaction.guild.id);
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
        
        // Log to console
        console.log(`Admin ${interaction.user.username} gave ${amount} gems to ${targetUser.username}`);
        
    } catch (error) {
        console.error('Error giving gems:', error);
        await interaction.editReply({
            content: '❌ **Error giving gems!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleAdminGiveAll(interaction) {
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply({ ephemeral: true });
    
    // Check if user has admin permissions
    if (!interaction.member.permissions.has('Administrator')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need Administrator permission to use this command.',
            ephemeral: true
        });
    }
    
    try {
        // Fetch all guild members
        const members = await interaction.guild.members.fetch();
        let totalGiven = 0;
        let usersUpdated = 0;
        
        for (const member of members) {
            if (!member.user.bot) {
                const userData = await db.getUser(member.id, interaction.guild.id);
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
        
        // Log to console
        console.log(`Admin ${interaction.user.username} gave ${amount} gems to ${usersUpdated} users (total: ${totalGiven})`);
        
    } catch (error) {
        console.error('Error giving gems to all:', error);
        await interaction.editReply({
            content: '❌ **Error distributing gems!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleAdminSetBalance(interaction) {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    
    await interaction.deferReply({ ephemeral: true });
    
    // Check if user has admin permissions
    if (!interaction.member.permissions.has('Administrator')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need Administrator permission to use this command.',
            ephemeral: true
        });
    }
    
    try {
        const userData = await db.getUser(targetUser.id, interaction.guild.id);
        await db.updateUser(targetUser.id, interaction.guild.id, {
            gems: amount
        });
        
        const embed = new EmbedBuilder()
            .setTitle('⚖️ **Balance Set Successfully**')
            .setColor('#00FF00')
            .setDescription(`Successfully set balance for ${targetUser.toString()}`)
            .addFields(
                { name: '� **User**', value: targetUser.toString(), inline: true },
                { name: '💰 **Old Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                { name: '💎 **New Balance**', value: `**${amount.toLocaleString()}** gems`, inline: true }
            )
            .addFields(
                { name: '📊 **Change**', value: `${amount >= userData.gems ? '+' : ''}${(amount - userData.gems).toLocaleString()} gems`, inline: false }
            )
            .setFooter({ text: `💎 Admin action by ${interaction.user.username}` })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        // Log to console
        console.log(`Admin ${interaction.user.username} set balance of ${targetUser.username} to ${amount} gems`);
        
    } catch (error) {
        console.error('Error setting balance:', error);
        await interaction.editReply({
            content: '❌ **Error setting balance!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleAdminResetUser(interaction) {
    const targetUser = interaction.options.getUser('user');
    
    await interaction.deferReply({ ephemeral: true });
    
    // Check if user has admin permissions
    if (!interaction.member.permissions.has('Administrator')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need Administrator permission to use this command.',
            ephemeral: true
        });
    }
    
    try {
        // Get user data before reset for logging
        const userData = await db.getUser(targetUser.id, interaction.guild.id);
        const bankData = await db.getBankAccount(targetUser.id, interaction.guild.id);
        
        // Reset user data
        await db.resetUser(targetUser.id, interaction.guild.id);
        
        const embed = new EmbedBuilder()
            .setTitle('🔄 **User Data Reset Successfully**')
            .setColor('#FFA500')
            .setDescription(`Successfully reset all data for ${targetUser.toString()}`)
            .addFields(
                { name: '👤 **User**', value: targetUser.toString(), inline: true },
                { name: '💰 **Previous Balance**', value: `**${userData.gems.toLocaleString()}** gems`, inline: true },
                { name: '🏦 **Previous Bank**', value: `**${bankData ? bankData.balance.toLocaleString() : 0}** gems`, inline: true }
            )
            .addFields(
                { name: '🔄 **Data Reset**', value: 'All user data has been reset to default values', inline: false }
            )
            .setFooter({ text: `💎 Admin action by ${interaction.user.username}` })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        // Log to console
        console.log(`Admin ${interaction.user.username} reset data for ${targetUser.username}`);
        
    } catch (error) {
        console.error('Error resetting user data:', error);
        await interaction.editReply({
            content: '❌ **Error resetting user data!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleHelp(interaction) {
    await interaction.deferReply();
    
    const embed = new EmbedBuilder()
        .setTitle('� **Gem Economy Bot - Help**')
        .setColor('#00BFFF')
        .setDescription('Welcome to the Gem Economy Bot! Here are all available commands:')
        .setThumbnail('https://i.imgur.com/9QaKxJt.png')
        .addFields(
            { name: '💰 **Economy Commands**', value: 
                '`/balance` - View your balance and rank\n' +
                '`/bank` - Access the bank system\n' +
                '`/deposit <amount>` - Deposit gems to bank\n' +
                '`/withdraw <amount>` - Withdraw gems from bank\n' +
                '`/daily` - Claim daily reward\n' +
                '`/work` - Work for gems\n' +
                '`/gamble <amount>` - Gamble your gems', 
                inline: false }
        )
        .addFields(
            { name: '🏆 **Rank Commands**', value: 
                '`/rank [@user]` - View rank and stats\n' +
                '`/ranks` - View all available ranks\n' +
                '`/leaderboard` - View server leaderboard', 
                inline: false }
        )
        .addFields(
            { name: '🎮 **Fun Commands**', value: 
                '`/chest` - Open mystery chest\n' +
                '`/slots <amount>` - Play slot machine\n' +
                '`/coinflip <choice> <amount>` - Flip a coin', 
                inline: false }
        )
        .addFields(
            { name: '🎁 **Giveaway Commands**', value: 
                '`/giveaway create <prize>` - Create giveaway\n' +
                '`/giveaway end` - End active giveaway\n' +
                '`/giveaway reroll` - Reroll giveaway winner', 
                inline: false }
        )
        .addFields(
            { name: '🎫 **Ticket Commands**', value: 
                '`/ticket create <reason>` - Create support ticket\n' +
                '`/ticket panel` - Create ticket panel', 
                inline: false }
        )
        .addFields(
            { name: '⚙️ **Admin Commands**', value: 
                '`/admin givegems <user> <amount>` - Give gems\n' +
                '`/admin giveall <amount>` - Give gems to all\n' +
                '`/admin setbalance <user> <amount>` - Set balance\n' +
                '`/admin resetuser <user>` - Reset user data', 
                inline: false }
        )
        .addFields(
            { name: '🔧 **Utility Commands**', value: 
                '`/ping` - Check bot latency\n' +
                '`/serverinfo` - View server information\n' +
                '`/userinfo [@user]` - View user information', 
                inline: false }
        )
        .addFields(
            { name: '💡 **Tips**', value: 
                '• Use `/daily` and `/work` regularly for gems\n' +
                '• Bank your gems to earn 5% daily interest\n' +
                '• Format amounts like `1k`, `2.5m`, or `1b`\n' +
                '• Create tickets for support with `/ticket`', 
                inline: false }
        )
        .setFooter({ text: '💎 Gem Economy Bot • Made with ❤️' })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleServerInfo(interaction) {
    await interaction.deferReply();
    
    const guild = interaction.guild;
    const owner = await guild.fetchOwner();
    const totalMembers = guild.memberCount;
    const humans = guild.members.cache.filter(member => !member.user.bot).size;
    const bots = guild.members.cache.filter(member => member.user.bot).size;
    const channels = guild.channels.cache.size;
    const roles = guild.roles.cache.size;
    const emojis = guild.emojis.cache.size;
    
    const embed = new EmbedBuilder()
        .setTitle(`📊 **${guild.name} Server Information**`)
        .setColor('#00BFFF')
        .setThumbnail(guild.iconURL())
        .setDescription(`**Server ID:** ${guild.id}`)
        .addFields(
            { name: '� **Server Owner**', value: owner.toString(), inline: true },
            { name: '📅 **Created On**', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
            { name: '👥 **Total Members**', value: `**${totalMembers.toLocaleString()}**`, inline: true }
        )
        .addFields(
            { name: '👤 **Humans**', value: `**${humans.toLocaleString()}**`, inline: true },
            { name: '🤖 **Bots**', value: `**${bots.toLocaleString()}**`, inline: true },
            { name: '💬 **Channels**', value: `**${channels.toLocaleString()}**`, inline: true }
        )
        .addFields(
            { name: '🎭 **Roles**', value: `**${roles.toLocaleString()}**`, inline: true },
            { name: '😀 **Emojis**', value: `**${emojis.toLocaleString()}**`, inline: true },
            { name: '🚀 **Boost Level**', value: `**Level ${guild.premiumTier}**`, inline: true }
        )
        .addFields(
            { name: '💎 **Boosts**', value: `**${guild.premiumSubscriptionCount || 0}** boosts`, inline: true },
            { name: '🔒 **Verification Level**', value: `**${guild.verificationLevel}**`, inline: true },
            { name: '🌍 **Preferred Locale**', value: `**${guild.preferredLocale}**`, inline: true }
        )
        .setFooter({ text: `💎 Requested by ${interaction.user.username}` })
        .setTimestamp();
    
    if (guild.bannerURL()) {
        embed.setImage(guild.bannerURL());
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleUserInfo(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(targetUser.id);
    
    await interaction.deferReply();
    
    if (!member) {
        return await interaction.editReply({
            content: '❌ **User not found!** This user is not in this server.',
            ephemeral: true
        });
    }
    
    const userData = await db.getUser(targetUser.id, interaction.guild.id);
    const rank = rankSystem.getUserRank(userData.gems);
    const accountInfo = await bankSystem.getBalance(targetUser.id, interaction.guild.id);
    
    const embed = new EmbedBuilder()
        .setTitle(`👤 **${targetUser.username}'s Information**`)
        .setColor('#00BFFF')
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(`**User ID:** ${targetUser.id}`)
        .addFields(
            { name: '🏷️ **Tag**', value: `**${targetUser.tag}**`, inline: true },
            { name: '� **Joined Server**', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
            { name: '🎂 **Account Created**', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
        )
        .addFields(
            { name: '💎 **Economy Stats**', value: 
                `💰 **Wallet:** ${userData.gems.toLocaleString()} gems\n` +
                `🏦 **Bank:** ${accountInfo.balance.toLocaleString()} gems\n` +
                `⭐ **Rank:** ${rank.color} ${rank.name}`, 
                inline: false }
        );
    
    // Roles
    if (member.roles.cache.size > 1) {
        const roles = member.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .slice(0, 10)
            .join(', ');
        
        embed.addFields(
            { name: '🎭 **Roles**', value: roles || 'No roles', inline: false }
        );
    }
    
    // Permissions
    const isAdmin = member.permissions.has('Administrator');
    const isModerator = member.permissions.has('ManageGuild') || member.permissions.has('ManageChannels');
    
    embed.addFields(
        { name: '⚡ **Key Permissions**', value: 
            `${isAdmin ? '🔑 **Administrator**' : ''}\n` +
            `${isModerator && !isAdmin ? '🛡️ **Moderator**' : ''}\n` +
            `${!isAdmin && !isModerator ? '👤 **Member**' : ''}`, 
            inline: false }
    )
    .setFooter({ text: `💎 Requested by ${interaction.user.username}` })
    .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleChestInteraction(interaction) {
    await interaction.reply('🚧 Chest interaction is being remade!');
}

async function handleGiveawayInteraction(interaction) {
    if (interaction.customId.startsWith('giveaway_enter_')) {
        await handleGiveawayEnter(interaction);
    }
}

async function handleGiveawayEnter(interaction) {
    const giveawayId = interaction.customId.replace('giveaway_enter_', '');
    
    await interaction.deferReply();
    
    try {
        const giveaway = await giveawaySystem.getGiveaway(giveawayId);
        if (!giveaway || giveaway.status !== 'active') {
            return await interaction.editReply({
                content: '❌ **Giveaway not found or has ended!**',
                ephemeral: true
            });
        }
        
        // Check if user already entered
        const entries = await giveawaySystem.getGiveawayEntries(giveawayId);
        if (entries.includes(interaction.user.id)) {
            return await interaction.editReply({
                content: '❌ **You have already entered this giveaway!**',
                ephemeral: true
            });
        }
        
        // Add entry
        await giveawaySystem.addGiveawayEntry(giveawayId, interaction.user.id);
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 **Giveaway Entry Successful!**')
            .setColor('#00FF00')
            .setDescription(`You have successfully entered the giveaway for **${giveaway.prize}**!`)
            .addFields(
                { name: '🎁 **Prize**', value: giveaway.prize, inline: true },
                { name: '🎫 **Giveaway ID**', value: giveawayId, inline: true },
                { name: '⏰ **Ends In**', value: `<t:${Math.floor(new Date(giveaway.end_time).getTime() / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: '💎 Good luck! Winners will be announced when the giveaway ends.' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
    } catch (error) {
        console.error('Error entering giveaway:', error);
        await interaction.editReply({
            content: '❌ **Error entering giveaway!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('ticket_modal_')) {
        await handleTicketModalSubmit(interaction);
    } else {
        await interaction.reply('🚧 This modal is being remade!');
    }
}

async function handleTicketModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const reason = interaction.fields.getTextInputValue('ticket_reason').trim();
    const category = interaction.customId.replace('ticket_modal_', '');
    
    if (reason.length < 10) {
        return await interaction.editReply({
            content: '❌ **Reason too short!** Please provide at least 10 characters describing your issue.',
            ephemeral: true
        });
    }
    
    const ticketId = await ticketSystem.createTicket(
        interaction.user.id,
        interaction.guild.id,
        reason,
        category
    );
    
    try {
        const channel = await ticketSystem.createTicketChannel(
            interaction.guild,
            interaction.user,
            ticketId,
            category,
            reason
        );
        
        // Update ticket with channel ID
        await db.updateTicketChannel(ticketId, channel.id);
        
        const embed = new EmbedBuilder()
            .setTitle('🎫 Ticket Created Successfully!')
            .setColor('#00FF00')
            .setDescription(`Your support ticket has been created!`)
            .addFields(
                { name: '🎫 **Ticket ID**', value: `**${ticketId}**`, inline: true },
                { name: '🏷️ **Category**', value: category, inline: true },
                { name: '💬 **Channel**', value: `${channel.toString()}`, inline: true }
            )
            .addFields(
                { name: '📝 **Reason**', value: reason, inline: false }
            )
            .addFields(
                { name: '📍 **Next Steps**', value: '• Staff will be notified of your ticket\n• You can discuss your issue in the ticket channel\n• Staff will respond as soon as possible', inline: false }
            )
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        // Log to console
        console.log(`Ticket ${ticketId} created by ${interaction.user.username} (${category})`);
        
    } catch (error) {
        console.error('Error creating ticket channel:', error);
        await interaction.editReply({
            content: '❌ **Error creating ticket!** Please try again later or contact staff.',
            ephemeral: true
        });
    }
}

async function handleSelectMenu(interaction) {
    await interaction.reply('🚧 Select menu is being remade!');
}

// Login
client.login(process.env.DISCORD_TOKEN);
