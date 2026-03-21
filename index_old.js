require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, ModalSubmitInteraction } = require('discord.js');
const Database = require('./database');
const RankSystem = require('./ranks');
const ChestSystem = require('./chest');
const GiveawaySystem = require('./giveaway');
const AutoGiveawaySystem = require('./autogiveaway');
const TimeUtils = require('./timeUtils');
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
const autoGiveawaySystem = new AutoGiveawaySystem(db, giveawaySystem, client);
const bankSystem = new BankSystem(db);
const ticketSystem = new TicketSystem(db, client);

const cooldowns = new Set();
const pendingBankTransactions = new Map(); // Store pending bank transactions
const bankUpdateIntervals = new Map(); // Store update intervals for bank embeds

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Check if user has a pending bank transaction
    const pendingTransaction = pendingBankTransactions.get(message.author.id);
    if (!pendingTransaction) return;
    
    // Try to parse the amount (support for k, m, b suffixes)
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
    
    // Handle different transaction types
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
            // Get updated account info for balance display
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
        console.error('Error processing bank transaction:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Transaction Error')
            .setColor('#FF0000')
            .setDescription('An error occurred while processing your transaction. Please try again later.')
            .setTimestamp();
        
        await message.reply({ embeds: [errorEmbed], ephemeral: true });
        pendingBankTransactions.delete(message.author.id);
    }
});

client.on('ready', () => {
    console.log(`✅ ${client.user.tag} is online!`);
    client.user.setActivity('Gem Economy', { type: 'WATCHING' });
    
    // Start background processes after bot is ready
    giveawaySystem.startGiveawayChecker();
    autoGiveawaySystem.startAutoGiveawayChecker();

    // Schedule daily interest application
    setInterval(async () => {
        console.log('Applying daily interest...');
        await bankSystem.applyDailyInterest();
    }, 24 * 60 * 60 * 1000); // Every 24 hours (24 * 60 * 60 * 1000 milliseconds)
    
    // Clean up bank update intervals every 5 minutes to prevent memory leaks
    setInterval(() => {
        const now = Date.now();
        for (const [userId, interval] of bankUpdateIntervals.entries()) {
            // Clear intervals older than 10 minutes
            if (now - (parseInt(userId) + 600000) > 0) {
                clearInterval(interval);
                bankUpdateIntervals.delete(userId);
            }
        }
    }, 5 * 60 * 1000); // Every 5 minutes
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const guildId = message.guild.id;
    const userId = message.author.id;
    
    // Check for pending bank transactions
    if (pendingBankTransactions.has(userId)) {
        const transactionType = pendingBankTransactions.get(userId);
        const amount = parseInt(message.content.trim());
        
        if (isNaN(amount) || amount <= 0) {
            await message.reply({ content: 'Please enter a valid positive number!', ephemeral: true });
            return;
        }
        
        try {
            let result;
            if (transactionType === 'deposit') {
                result = await bankSystem.deposit(userId, guildId, amount);
            } else if (transactionType === 'withdraw') {
                result = await bankSystem.withdraw(userId, guildId, amount);
            }
            
            const accountInfo = await bankSystem.getBalance(userId, guildId);
            const embed = bankSystem.createBankEmbed(message.author, accountInfo);
            const buttons = bankSystem.createBankButtons(accountInfo);
            
            const reply = await message.reply({ 
                content: result.message,
                embeds: [embed], 
                components: [buttons],
                ephemeral: true
            });
            
            // Update the stored reply reference for auto-updates
            if (bankUpdateIntervals.has(userId)) {
                // Clear old interval and create new one with updated message
                clearInterval(bankUpdateIntervals.get(userId));
                
                const interval = setInterval(async () => {
                    try {
                        const updatedAccountInfo = await bankSystem.getBalance(userId, guildId);
                        const updatedEmbed = bankSystem.createBankEmbed(message.author, updatedAccountInfo);
                        const updatedButtons = bankSystem.createBankButtons(updatedAccountInfo);
                        
                        await reply.edit({
                            embeds: [updatedEmbed],
                            components: [updatedButtons]
                        });
                    } catch (error) {
                        clearInterval(interval);
                        bankUpdateIntervals.delete(userId);
                    }
                }, 10000);
                
                bankUpdateIntervals.set(userId, interval);
            }
        } catch (error) {
            console.error('Bank transaction error:', error);
            await message.reply({ 
                content: 'An error occurred during the transaction. Please try again.', 
                ephemeral: true 
            });
        }
        
        pendingBankTransactions.delete(userId);
        return;
    }
    
    // Check cooldown (1 second per message to prevent spam)
    const cooldownKey = `${userId}-${guildId}`;
    if (cooldowns.has(cooldownKey)) return;
    
    cooldowns.add(cooldownKey);
    setTimeout(() => cooldowns.delete(cooldownKey), 1000);
    
    try {
        // Get or create user
        let userData = await db.getUser(userId, guildId);
        if (!userData) {
            await db.createUser(userId, guildId);
            userData = await db.getUser(userId, guildId);
        }
        
        // Calculate credits earned (random between 5-25 gems per message)
        const gemsEarned = Math.floor(Math.random() * 21) + 5;
        const newGems = userData.gems + gemsEarned;
        
        // Update user data
        await db.updateUser(userId, guildId, {
            gems: newGems,
            total_messages: userData.total_messages + 1,
            last_message_time: Date.now(),
            rank_tier: rankSystem.getUserRank(newGems).name
        });
        
        // Check for rank up
        const newRank = rankSystem.getUserRank(newGems);
        if (userData.rank_tier !== newRank.name) {
            const rankUpEmbed = new EmbedBuilder()
                .setTitle('🎉 Rank Up!')
                .setColor(newRank.hexColor)
                .setDescription(`Congratulations ${message.author.username}! You've ranked up to **${newRank.color} ${newRank.name}**!`)
                .addFields(
                    { name: '💎 Gems', value: `${newGems.toLocaleString()}`, inline: true },
                    { name: '⭐ XP', value: `${rankSystem.calculateXP(newGems).toLocaleString()}`, inline: true }
                )
                .setThumbnail(message.author.displayAvatarURL())
                .setTimestamp();
            
            message.channel.send({ embeds: [rankUpEmbed] });
        }
        
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() && !interaction.isButton() && !interaction.isStringSelectMenu()) return;
    
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    
    try {
        if (interaction.isCommand()) {
            const command = interaction.commandName;
            
            switch (command) {
                case 'setup':
                    await handleSetup(interaction);
                    break;
                    
                case 'rank':
                    await handleRank(interaction);
                    break;
                    
                case 'ranks':
                    await handleRanks(interaction);
                    break;
                    
                case 'leaderboard':
                    await handleLeaderboard(interaction);
                    break;
                    
                case 'bank':
                    await handleBank(interaction);
                    break;
                    
                case 'deposit':
                    await handleDeposit(interaction);
                    break;
                    
                case 'withdraw':
                    await handleWithdraw(interaction);
                    break;
                    
                case 'balance':
                    await handleBalance(interaction);
                    break;
                    
                case 'chest':
                    await handleChest(interaction);
                    break;
                    
                case 'giveaway':
                    await handleGiveaway(interaction);
                    break;
                    
                case 'autogiveaway':
                    await handleAutoGiveaway(interaction);
                    break;
                    
                case 'givegems':
                    await handleGiveGems(interaction);
                    break;
                    
                case 'giveall':
                    await handleGiveAll(interaction);
                    break;
                    
                case 'redeem':
                    await handleRedeem(interaction);
                    break;
                    
                case 'code':
                    await handleCode(interaction);
                    break;
                    
                case 'help':
                    await handleHelp(interaction);
                    break;
                    
                case 'ticket':
                    await handleTicket(interaction);
                    break;
                    
                case 'givexp':
                    await handleGiveXP(interaction);
                    break;
            }
        } else if (interaction.isButton()) {
            if (interaction.customId === 'open_chest') {
                await handleOpenChest(interaction);
            } else if (interaction.customId.startsWith('giveaway_join_')) {
                await handleGiveawayJoin(interaction);
            } else if (interaction.customId.startsWith('bank_')) {
                await handleBankInteraction(interaction);
            } else if (interaction.customId === 'create_ticket') {
                await handleCreateTicketButton(interaction);
            } else if (interaction.customId.startsWith('ticket_category_')) {
                await handleTicketCategorySelection(interaction);
            } else if (interaction.customId.startsWith('ticket_close_')) {
                await handleTicketCloseButton(interaction);
            } else if (interaction.customId.startsWith('ticket_claim_')) {
                await handleTicketClaimButton(interaction);
            } else if (interaction.customId.startsWith('leaderboard_')) {
                await handleLeaderboardPagination(interaction);
            }
        } else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'channel_select') {
                await handleChannelSelect(interaction);
            } else if (interaction.customId.startsWith('confirm_')) {
                await handleChannelConfirm(interaction);
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('ticket_modal_')) {
                await handleTicketModalSubmit(interaction);
            } else if (interaction.customId.startsWith('close_ticket_modal_')) {
                await handleCloseTicketModalSubmit(interaction);
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
        }
    }
});

async function handleSetup(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Only administrators can use this command!', ephemeral: true });
    }
    
    const guildSettings = await db.getGuildSettings(interaction.guild.id);
    
    const embed = new EmbedBuilder()
        .setTitle('⚙️ **Bot Configuration Panel**')
        .setColor('#0099FF')
        .setDescription('🔧 **Configure your bot channels and settings**\n\nSelect which feature you want to configure from the dropdown menu below.')
        .addFields(
            { name: '📋 **Available Features**', value: '• 💎 **Credits Channel** - Where gem notifications appear\n• 📦 **Chest Channel** - Where chest commands work\n• 👋 **Welcome Channel** - Where welcome messages appear\n• 🎉 **Giveaway Channel** - Where giveaways are hosted\n• 🏦 **Bank Channel** - Where bank commands work', inline: false },
            { name: '⚡ **Quick Status**', value: 
                `💎 Credits: ${guildSettings?.credits_channel_id ? `<#${guildSettings.credits_channel_id}>` : '❌ Not set'}\n` +
                `📦 Chest: ${guildSettings?.chest_channel_id ? `<#${guildSettings.chest_channel_id}>` : '❌ Not set'}\n` +
                `👋 Welcome: ${guildSettings?.welcome_channel_id ? `<#${guildSettings.welcome_channel_id}>` : '❌ Not set'}`, 
                inline: true }
        )
        .setThumbnail(interaction.guild.iconURL())
        .setFooter({ text: '💎 Gem Economy Bot • Configuration Panel' })
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('channel_select')
                .setPlaceholder('🔧 Select a feature to configure...')
                .addOptions(
                    {
                        label: '💎 Credits Channel',
                        description: 'Where credit notifications and rank ups appear',
                        value: 'credits_channel',
                        emoji: '💎'
                    },
                    {
                        label: '📦 Chest Channel',
                        description: 'Where chest commands and rewards work',
                        value: 'chest_channel',
                        emoji: '📦'
                    },
                    {
                        label: '👋 Welcome Channel',
                        description: 'Where welcome messages appear',
                        value: 'welcome_channel',
                        emoji: '👋'
                    },
                    {
                        label: '🎉 Giveaway Channel',
                        description: 'Where giveaways are hosted',
                        value: 'giveaway_channel',
                        emoji: '🎉'
                    },
                    {
                        label: '🏦 Bank Channel',
                        description: 'Where bank commands work',
                        value: 'bank_channel',
                        emoji: '🏦'
                    }
                )
        );
    
    await interaction.reply({ 
        embeds: [embed], 
        components: [row], 
        ephemeral: true 
    });
}

async function handleChannelSelect(interaction) {
    const selection = interaction.values[0];
    
    const channelSelectRow = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`confirm_${selection}`)
                .setPlaceholder(`Select ${selection.replace('_', ' ')}`)
                .addOptions(
                    ...interaction.guild.channels.cache
                        .filter(channel => channel.isTextBased())
                        .map(channel => ({
                            label: channel.name,
                            value: channel.id
                        }))
                )
        );
    
    await interaction.update({ 
        content: `📍 Select the ${selection.replace('_', ' ')}:`, 
        components: [channelSelectRow],
        ephemeral: true 
    });
}

async function handleChannelConfirm(interaction) {
    const channelType = interaction.customId.replace('confirm_', '');
    const channelId = interaction.values[0];
    
    const guildSettings = await db.getGuildSettings(interaction.guild.id);
    const updates = {
        credits_channel_id: guildSettings?.credits_channel_id || null,
        chest_channel_id: guildSettings?.chest_channel_id || null,
        welcome_channel_id: guildSettings?.welcome_channel_id || null,
        giveaway_channel_id: guildSettings?.giveaway_channel_id || null,
        bank_channel_id: guildSettings?.bank_channel_id || null
    };
    
    updates[channelType] = channelId;
    
    await db.updateGuildSettings(interaction.guild.id, updates);
    
    const channel = interaction.guild.channels.cache.get(channelId);
    
    const embed = new EmbedBuilder()
        .setTitle('✅ **Configuration Updated!**')
        .setColor('#00FF00')
        .setDescription(`Successfully configured **${channelType.replace('_', ' ')}**`)
        .addFields(
            { name: '📍 **Channel Set**', value: `**#${channel.name}**`, inline: true },
            { name: '🆔 **Channel ID**', value: `\`${channelId}\``, inline: true },
            { name: '⚡ **Status**', value: '**Active**', inline: true }
        )
        .setThumbnail('https://i.imgur.com/9QaKxJt.png')
        .setFooter({ text: '💎 Gem Economy Bot • Configuration Updated' })
        .setTimestamp();
    
    await interaction.update({
        embeds: [embed],
        components: [],
        ephemeral: true
    });
}

async function handleRank(interaction) {
    const guildSettings = await db.getGuildSettings(interaction.guild.id);
    if (guildSettings?.credits_channel_id && interaction.channelId !== guildSettings.credits_channel_id) {
        return interaction.reply({ 
            content: `This command can only be used in <#${guildSettings.credits_channel_id}>`, 
            ephemeral: true 
        });
    }
    
    await interaction.deferReply();
    
    // Check if a user was mentioned
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    let userData = await db.getUser(targetUser.id, interaction.guild.id);
    if (!userData) {
        if (targetUser.id === interaction.user.id) {
            await db.createUser(targetUser.id, interaction.guild.id);
            return interaction.editReply('Creating your profile... Try again in a moment!');
        } else {
            return interaction.editReply('❌ **User not found!** This user hasn\'t created a profile yet.');
        }
    }
    
    const embed = rankSystem.createRankEmbed(targetUser, userData);
    
    // Add footer showing whose profile it is
    if (targetUser.id !== interaction.user.id) {
        embed.setFooter({ 
            text: `Viewing ${targetUser.username}'s profile • 💎 Gem Economy Bot • ${new Date().toLocaleDateString()}` 
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleRanks(interaction) {
    await interaction.deferReply();
    
    const embed = rankSystem.createAllRanksEmbed();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleDeposit(interaction) {
    await interaction.deferReply();
    
    const amount = interaction.options.getInteger('amount');
    const result = await bankSystem.deposit(interaction.user.id, interaction.guild.id, amount);
    
    const accountInfo = await bankSystem.getBalance(interaction.user.id, interaction.guild.id);
    const embed = bankSystem.createBankEmbed(interaction.user, accountInfo);
    
    await interaction.editReply({ 
        content: result.message,
        embeds: [embed],
        ephemeral: true
    });
}

async function handleWithdraw(interaction) {
    await interaction.deferReply();
    
    const amount = interaction.options.getInteger('amount');
    const result = await bankSystem.withdraw(interaction.user.id, interaction.guild.id, amount);
    
    const accountInfo = await bankSystem.getBalance(interaction.user.id, interaction.guild.id);
    const embed = bankSystem.createBankEmbed(interaction.user, accountInfo);
    
    await interaction.editReply({ 
        content: result.message,
        embeds: [embed],
        ephemeral: true
    });
}

async function handleBalance(interaction) {
    await interaction.deferReply();
    
    const embed = await bankSystem.createPersonalBalanceEmbedWithData(interaction.user, interaction.guild.id, db, rankSystem);
    
    await interaction.editReply({ embeds: [embed], ephemeral: true });
}

async function handleRedeem(interaction) {
    await interaction.deferReply();
    
    const code = interaction.options.getString('code');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    try {
        // Get the code from database
        const redeemCode = await db.getRedeemCode(code);
        
        if (!redeemCode) {
            return await interaction.editReply({ 
                content: '❌ **Invalid Code!** This code does not exist or has been deactivated.', 
                ephemeral: true 
            });
        }
        
        console.log(`User ${interaction.user.username} attempting to redeem code: ${code}`);
        
        // Check if code has expired
        if (redeemCode.expires_at && redeemCode.expires_at < Date.now()) {
            return await interaction.editReply({ 
                content: '❌ **Expired Code!** This code has expired.', 
                ephemeral: true 
            });
        }
        
        // Check if code has reached max uses
        if (redeemCode.current_uses >= redeemCode.max_uses) {
            return await interaction.editReply({ 
                content: '❌ **Code Fully Used!** This code has reached its maximum uses.', 
                ephemeral: true 
            });
        }
        
        // Check if user has already redeemed this code
        const hasRedeemed = await db.hasUserRedeemedCode(userId, guildId, redeemCode.id);
        if (hasRedeemed) {
            return await interaction.editReply({ 
                content: '❌ **Already Redeemed!** You have already used this code.', 
                ephemeral: true 
            });
        }
        
        // Process the redemption
        let userData = await db.getUser(userId, guildId);
        if (!userData) {
            await db.createUser(userId, guildId);
            userData = await db.getUser(userId, guildId);
        }
        
        // Give the reward
        const newGems = userData.gems + redeemCode.reward_amount;
        await db.updateUser(userId, guildId, { 
            gems: newGems,
            rank_tier: rankSystem.getUserRank(newGems).name
        });
        
        // Update code usage
        await db.updateRedeemCodeUses(redeemCode.id);
        
        // Record redemption
        await db.recordCodeRedemption(userId, guildId, redeemCode.id);
        
        console.log(`Code ${code} successfully redeemed by ${interaction.user.username} for ${redeemCode.reward_amount} gems`);
        
        // Create success embed
        const embed = new EmbedBuilder()
            .setTitle('🎉 **Code Redeemed Successfully!**')
            .setColor('#00FF00')
            .setDescription(`🎊 **Congratulations ${interaction.user.username}!**`)
            .addFields(
                { name: '🎁 **Code Used**', value: `**${code.toUpperCase()}**`, inline: true },
                { name: '💎 **Reward Received**', value: `**${redeemCode.reward_amount.toLocaleString()}** gems`, inline: true },
                { name: '💰 **New Balance**', value: `**${newGems.toLocaleString()}** gems`, inline: true }
            )
            .addFields(
                { name: '📊 **Code Info**', value: `Uses: ${redeemCode.current_uses + 1}/${redeemCode.max_uses}`, inline: true },
                { name: '🎯 **Remaining Uses**', value: `${redeemCode.max_uses - (redeemCode.current_uses + 1)} uses left`, inline: true }
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setFooter({ text: '💎 Gem Economy Bot • Code Redemption' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error redeeming code:', error);
        await interaction.editReply({ 
            content: '❌ **Error!** An error occurred while redeeming the code. Please try again.', 
            ephemeral: true 
        });
    }
}

async function handleCode(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Only administrators can manage redeem codes!', ephemeral: true });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
        case 'create':
            await handleCreateCode(interaction);
            break;
        case 'list':
            await handleListCodes(interaction);
            break;
        case 'delete':
            await handleDeleteCode(interaction);
            break;
    }
}

async function handleCreateCode(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const code = interaction.options.getString('code');
    const amount = interaction.options.getInteger('amount');
    const uses = interaction.options.getInteger('uses') || 1;
    
    try {
        await db.createRedeemCode(code, 'gems', amount, uses, interaction.user.id);
        
        const embed = new EmbedBuilder()
            .setTitle('🎫 **Code Created Successfully!**')
            .setColor('#00FF00')
            .setDescription(`✅ **Redeem code has been created**`)
            .addFields(
                { name: '🎫 **Code**', value: `**${code.toUpperCase()}**`, inline: true },
                { name: '💎 **Reward**', value: `**${amount.toLocaleString()}** gems`, inline: true },
                { name: '🔄 **Uses**', value: `**${uses}** uses`, inline: true }
            )
            .addFields(
                { name: '👤 **Created By**', value: interaction.user.username, inline: true },
                { name: '📅 **Created At**', value: new Date().toLocaleDateString(), inline: true }
            )
            .setFooter({ text: '💎 Gem Economy Bot • Code Management' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error creating code:', error);
        await interaction.editReply({ 
            content: '❌ **Error!** This code might already exist. Please try a different code.', 
            ephemeral: true 
        });
    }
}

async function handleListCodes(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const codes = await db.getAllRedeemCodes();
        
        if (codes.length === 0) {
            return await interaction.editReply({ 
                content: '📋 **No redeem codes found!** Use `/code create` to create one.', 
                ephemeral: true 
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🎫 **All Redeem Codes**')
            .setColor('#0099FF')
            .setDescription(`📊 **Total codes: ${codes.length}**`)
            .addFields(
                codes.map(code => ({
                    name: `🎫 ${code.code}`,
                    value: `💎 **${code.reward_amount.toLocaleString()}** gems\n🔄 **${code.current_uses}/${code.max_uses}** uses\n👤 **Created by:** <@${code.created_by}>`,
                    inline: true
                }))
            )
            .setFooter({ text: '💎 Gem Economy Bot • Code Management' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error listing codes:', error);
        await interaction.editReply({ 
            content: '❌ **Error!** Could not retrieve codes.', 
            ephemeral: true 
        });
    }
}

async function handleDeleteCode(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const code = interaction.options.getString('code');
    
    try {
        await db.deleteRedeemCode(code);
        
        const embed = new EmbedBuilder()
            .setTitle('🗑️ **Code Deleted Successfully!**')
            .setColor('#FF0000')
            .setDescription(`✅ **Code has been deactivated**`)
            .addFields(
                { name: '🎫 **Code**', value: `**${code.toUpperCase()}**`, inline: true },
                { name: '👤 **Deleted By**', value: interaction.user.username, inline: true },
                { name: '📅 **Deleted At**', value: new Date().toLocaleDateString(), inline: true }
            )
            .setFooter({ text: '💎 Gem Economy Bot • Code Management' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error deleting code:', error);
        await interaction.editReply({ 
            content: '❌ **Error!** Could not delete the code.', 
            ephemeral: true 
        });
    }
}

async function handleHelp(interaction) {
    await interaction.deferReply();
    
    const embed = new EmbedBuilder()
        .setTitle('🎮 **Gem Economy Bot - Help**')
        .setColor('#0099FF')
        .setDescription('💎 **All available commands and features**')
        .addFields(
            { name: '👤 **User Commands**', value: 
                '`/rank` - View your rank and stats\n' +
                '`/ranks` - View all available ranks\n' +
                '`/leaderboard` - Server leaderboard\n' +
                '`/bank` - Access bank system\n' +
                '`/deposit <amount>` - Deposit gems\n' +
                '`/withdraw <amount>` - Withdraw gems\n' +
                '`/balance` - Check balances\n' +
                '`/chest` - Open mystery chests\n' +
                '`/redeem <code>` - Redeem a code', 
                inline: false },
            { name: '🎁 **Giveaway Commands**', value: 
                '`/giveaway create` - Create giveaway\n' +
                '`/giveaway end` - End giveaway\n' +
                '`/autogiveaway enable` - Auto giveaways\n' +
                '`/autogiveaway disable` - Disable auto', 
                inline: false },
            { name: '⚙️ **Admin Commands**', value: 
                '`/setup` - Configure bot\n' +
                '`/givegems <user> <amount>` - Give gems\n' +
                '`/giveall <amount>` - Give to all users\n' +
                '`/code create <code> <amount>` - Create redeem code\n' +
                '`/code list` - List all codes\n' +
                '`/code delete <code>` - Delete code', 
                inline: false },
            { name: '💡 **How to Earn Gems**', value: 
                '💬 **Chat** - 5-25 gems per message\n' +
                '🏦 **Bank** - 5% daily interest\n' +
                '🎁 **Chests** - Win bonus gems\n' +
                '🎉 **Giveaways** - Win prizes', 
                inline: false }
        )
        .setFooter({ text: '💎 Gem Economy Bot • Made with ❤️' })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleLeaderboard(interaction) {
    await interaction.deferReply();
    
    const users = await db.getLeaderboard(interaction.guild.id, 50); // Get more users for pagination
    const embed = rankSystem.createLeaderboardEmbed(users, interaction.guild, 1, 10);
    const buttons = rankSystem.createLeaderboardButtons(1, Math.ceil(users.length / 10));
    
    await interaction.editReply({ embeds: [embed], components: [buttons] });
}

async function handleChest(interaction) {
    const guildSettings = await db.getGuildSettings(interaction.guild.id);
    if (guildSettings?.chest_channel_id && interaction.channelId !== guildSettings.chest_channel_id) {
        return interaction.reply({ 
            content: `This command can only be used in <#${guildSettings.chest_channel_id}>`, 
            ephemeral: true 
        });
    }
    
    await interaction.deferReply();
    
    const userData = await db.getUser(interaction.user.id, interaction.guild.id);
    if (!userData) {
        await db.createUser(interaction.user.id, interaction.guild.id);
        return interaction.editReply('Creating your profile... Try again in a moment!');
    }
    
    const embed = chestSystem.createChestEmbed(interaction.user, userData);
    const buttons = chestSystem.createChestButtons();
    
    await interaction.editReply({ embeds: [embed], components: [buttons] });
}

async function handleOpenChest(interaction) {
    await interaction.deferUpdate();
    
    const result = await chestSystem.openChest(interaction.user.id, interaction.guild.id);
    
    if (!result.success) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Cannot Open Chest')
            .setColor('#FF0000')
            .setDescription(result.message);
        
        return interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
    
    const newUserData = await db.getUser(interaction.user.id, interaction.guild.id);
    const embed = chestSystem.createChestResultEmbed(interaction.user, result, newUserData);
    
    await interaction.followUp({ embeds: [embed] });
}

// Register slash commands
client.on('ready', async () => {
    const commands = [
        {
            name: 'setup',
            description: 'Configure bot channels and settings'
        },
        {
            name: 'rank',
            description: 'View your current rank and statistics',
            options: [
                {
                    name: 'user',
                    description: 'View another user\'s profile (optional)',
                    type: 6, // USER
                    required: false
                }
            ]
        },
        {
            name: 'ranks',
            description: 'View all available ranks and requirements'
        },
        {
            name: 'leaderboard',
            description: 'View the server gem leaderboard'
        },
        {
            name: 'bank',
            description: 'Access the Gem Bank system'
        },
        {
            name: 'deposit',
            description: 'Deposit gems to your bank account',
            options: [
                {
                    name: 'amount',
                    description: 'Amount to deposit',
                    type: 4, // INTEGER
                    required: true,
                    min_value: 1
                }
            ]
        },
        {
            name: 'withdraw',
            description: 'Withdraw gems from your bank account',
            options: [
                {
                    name: 'amount',
                    description: 'Amount to withdraw',
                    type: 4, // INTEGER
                    required: true,
                    min_value: 1
                }
            ]
        },
        {
            name: 'balance',
            description: 'Check your bank and wallet balance'
        },
        {
            name: 'chest',
            description: 'Open mystery chests for rewards'
        },
        {
            name: 'giveaway',
            description: 'Giveaway management commands',
            options: [
                {
                    name: 'create',
                    description: 'Create a new giveaway',
                    type: 1, // SUB_COMMAND
                    options: [
                        {
                            name: 'prize',
                            description: 'Prize for the winner',
                            type: 3, // STRING
                            required: true
                        },
                        {
                            name: 'winners',
                            description: 'Number of winners',
                            type: 4, // INTEGER
                            required: false,
                            min_value: 1,
                            max_value: 10
                        },
                        {
                            name: 'duration',
                            description: 'Duration in minutes',
                            type: 4, // INTEGER
                            required: false,
                            min_value: 1,
                            max_value: 1440
                        },
                        {
                            name: 'end_time',
                            description: 'Specific end time (e.g., "5pm", "tomorrow 8pm")',
                            type: 3, // STRING
                            required: false
                        },
                        {
                            name: 'entry_cost',
                            description: 'Cost to enter in gems',
                            type: 4, // INTEGER
                            required: false,
                            min_value: 0
                        }
                    ]
                },
                {
                    name: 'end',
                    description: 'End an active giveaway',
                    type: 1 // SUB_COMMAND
                }
            ]
        },
        {
            name: 'autogiveaway',
            description: 'Manage automatic giveaways',
            options: [
                {
                    name: 'enable',
                    description: 'Enable automatic giveaways',
                    type: 1, // SUB_COMMAND
                    options: [
                        {
                            name: 'channel',
                            description: 'Channel for auto-giveaways',
                            type: 7, // CHANNEL
                            required: true,
                            channel_types: [0] // Text channel
                        },
                        {
                            name: 'duration',
                            description: 'Duration of each giveaway in minutes (default: 15)',
                            type: 4, // INTEGER
                            required: false,
                            min_value: 5,
                            max_value: 120
                        },
                        {
                            name: 'interval',
                            description: 'Interval between giveaways in minutes (default: 30)',
                            type: 4, // INTEGER
                            required: false,
                            min_value: 5,
                            max_value: 1440
                        }
                    ]
                },
                {
                    name: 'setduration',
                    description: 'Set giveaway duration',
                    type: 1, // SUB_COMMAND
                    options: [
                        {
                            name: 'duration',
                            description: 'Duration in minutes (5-120)',
                            type: 4, // INTEGER
                            required: true,
                            min_value: 5,
                            max_value: 120
                        }
                    ]
                },
                {
                    name: 'setinterval',
                    description: 'Set interval between giveaways',
                    type: 1, // SUB_COMMAND
                    options: [
                        {
                            name: 'interval',
                            description: 'Interval in minutes (5-1440)',
                            type: 4, // INTEGER
                            required: true,
                            min_value: 5,
                            max_value: 1440
                        }
                    ]
                },
                {
                    name: 'status',
                    description: 'View auto-giveaway status',
                    type: 1 // SUB_COMMAND
                },
                {
                    name: 'disable',
                    description: 'Disable automatic giveaways',
                    type: 1 // SUB_COMMAND
                }
            ]
        },
        {
            name: 'givegems',
            description: 'Give gems to a user (Admin only)',
            options: [
                {
                    name: 'user',
                    description: 'User to give gems to',
                    type: 6, // USER
                    required: true
                },
                {
                    name: 'amount',
                    description: 'Amount of gems to give',
                    type: 4, // INTEGER
                    required: true,
                    min_value: 1,
                    max_value: 1000000
                }
            ]
        },
        {
            name: 'givexp',
            description: 'Give XP to a user (Admin only)',
            options: [
                {
                    name: 'user',
                    description: 'User to give XP to',
                    type: 6, // USER
                    required: true
                },
                {
                    name: 'amount',
                    description: 'Amount of XP to give',
                    type: 4, // INTEGER
                    required: true,
                    min_value: 1,
                    max_value: 10000
                }
            ]
        },
        {
            name: 'giveall',
            description: 'Give gems to all server members (Admin only)',
            options: [
                {
                    name: 'amount',
                    description: 'Amount per user',
                    type: 4, // INTEGER
                    required: true,
                    min_value: 1,
                    max_value: 100000
                }
            ]
        },
        {
            name: 'redeem',
            description: 'Redeem a code for rewards',
            options: [
                {
                    name: 'code',
                    description: 'The code to redeem',
                    type: 3, // STRING
                    required: true
                }
            ]
        },
        {
            name: 'code',
            description: 'Manage redeem codes (Admin only)',
            options: [
                {
                    name: 'create',
                    description: 'Create a new redeem code',
                    type: 1, // SUB_COMMAND
                    options: [
                        {
                            name: 'code',
                            description: 'The code text',
                            type: 3, // STRING
                            required: true
                        },
                        {
                            name: 'amount',
                            description: 'Reward amount in gems',
                            type: 4, // INTEGER
                            required: true,
                            min_value: 1,
                            max_value: 1000000
                        },
                        {
                            name: 'uses',
                            description: 'Maximum number of uses',
                            type: 4, // INTEGER
                            required: false,
                            min_value: 1,
                            max_value: 1000
                        }
                    ]
                },
                {
                    name: 'list',
                    description: 'List all redeem codes',
                    type: 1 // SUB_COMMAND
                },
                {
                    name: 'delete',
                    description: 'Delete a redeem code',
                    type: 1, // SUB_COMMAND
                    options: [
                        {
                            name: 'code',
                            description: 'The code to delete',
                            type: 3, // STRING
                            required: true
                        }
                    ]
                }
            ]
        },
        {
            name: 'help',
            description: 'View all available commands and help'
        },
        {
            name: 'ticket',
            description: 'Manage support tickets',
            options: [
                {
                    name: 'create',
                    description: 'Create a new support ticket',
                    type: 1, // SUB_COMMAND
                    options: [
                        {
                            name: 'reason',
                            description: 'Reason for creating the ticket',
                            type: 3, // STRING
                            required: true,
                            max_length: 500
                        },
                        {
                            name: 'category',
                            description: 'Ticket category',
                            type: 3, // STRING
                            required: true,
                            choices: [
                                { name: 'General Support', value: 'General Support' },
                                { name: 'Economy Issues', value: 'Economy Issues' },
                                { name: 'Giveaway Issues', value: 'Giveaway Issues' },
                                { name: 'Rank Issues', value: 'Rank Issues' },
                                { name: 'Bug Reports', value: 'Bug Reports' },
                                { name: 'Suggestions', value: 'Suggestions' }
                            ]
                        }
                    ]
                },
                {
                    name: 'close',
                    description: 'Close a ticket (Staff only)',
                    type: 1, // SUB_COMMAND
                    options: [
                        {
                            name: 'ticket_id',
                            description: 'Ticket ID to close',
                            type: 3, // STRING
                            required: true
                        },
                        {
                            name: 'reason',
                            description: 'Reason for closing the ticket',
                            type: 3, // STRING
                            required: false,
                            max_length: 500
                        }
                    ]
                },
                {
                    name: 'list',
                    description: 'List all tickets (Staff only)',
                    type: 1 // SUB_COMMAND
                },
                {
                    name: 'panel',
                    description: 'Create a ticket panel in the current channel',
                    type: 1 // SUB_COMMAND
                }
            ]
        }
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('✅ All slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

async function handleGiveaway(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Only administrators can create giveaways!', ephemeral: true });
    }
    
    const subCommand = interaction.options.getSubcommand();
    
    if (subCommand === 'create') {
        await handleCreateGiveaway(interaction);
    } else if (subCommand === 'end') {
        await handleEndGiveaway(interaction);
    }
}

async function handleCreateGiveaway(interaction) {
    await interaction.deferReply();
    
    const prize = interaction.options.getString('prize');
    const winners = interaction.options.getInteger('winners') || 1;
    const duration = interaction.options.getInteger('duration');
    const endTime = interaction.options.getString('end_time');
    const entryCost = interaction.options.getInteger('entry_cost') || 0;
    
    let endTimeMs;
    
    if (endTime) {
        const parsedTime = TimeUtils.parseTimeString(endTime);
        if (!parsedTime) {
            return interaction.editReply({ 
                content: `❌ Invalid time format! Examples: ${TimeUtils.getTimeExamples().join(', ')}`,
                ephemeral: true 
            });
        }
        endTimeMs = parsedTime.getTime();
        
        // Check if end time is at least 5 minutes in the future
        if (endTimeMs - Date.now() < 5 * 60 * 1000) {
            return interaction.editReply({ 
                content: '❌ End time must be at least 5 minutes in the future!',
                ephemeral: true 
            });
        }
    } else if (duration) {
        endTimeMs = Date.now() + (duration * 60 * 1000); // Convert minutes to milliseconds
    } else {
        // Default to 24 hours if neither is specified
        endTimeMs = Date.now() + (24 * 60 * 60 * 1000);
    }
    
    const giveawayId = await giveawaySystem.createGiveaway(
        interaction.guild.id,
        interaction.channel.id,
        prize,
        winners,
        endTimeMs,
        entryCost,
        interaction.user.id
    );
    
    const giveaway = await db.getGiveaway(giveawayId);
    const embed = giveawaySystem.createGiveawayEmbed(giveaway, client);
    const buttons = giveawaySystem.createGiveawayButtons(giveawayId);
    
    const message = await interaction.channel.send({ embeds: [embed], components: [buttons] });
    
    // Update giveaway with message ID
    await db.updateGiveaway(giveawayId, { message_id: message.id });
    
    const timeDisplay = endTime ? `Ends at ${endTime}` : `${duration || 24} hours`;
    
    await interaction.editReply({ 
        content: `🎉 Giveaway created successfully!\n\n**Prize:** ${prize}\n**Winners:** ${winners}\n**Duration:** ${timeDisplay}\n**Entry Cost:** ${entryCost > 0 ? `${entryCost} gems` : 'Free'}`,
        ephemeral: true 
    });
}

async function handleEndGiveaway(interaction) {
    await interaction.deferReply();
    
    const guildId = interaction.guild.id;
    const activeGiveaways = await db.getActiveGiveaways(guildId);
    
    if (activeGiveaways.length === 0) {
        return interaction.editReply({ 
            content: '❌ **No active giveaways found!** There are no giveaways to end.', 
            ephemeral: true 
        });
    }
    
    let endedCount = 0;
    let errorCount = 0;
    
    for (const giveaway of activeGiveaways) {
        try {
            const winners = await giveawaySystem.endGiveaway(giveaway.id);
            
            // Announce winners
            const guild = interaction.guild;
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
                    const updatedEmbed = giveawaySystem.createGiveawayEmbed({...giveaway, status: 'ended'}, client);
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
            
            endedCount++;
        } catch (error) {
            console.error(`Error ending giveaway ${giveaway.id}:`, error);
            errorCount++;
        }
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🎊 **Giveaways Ended!**')
        .setColor('#00FF00')
        .setDescription(`**Summary of giveaway endings:**`)
        .addFields(
            { name: '✅ **Successfully Ended**', value: `${endedCount} giveaways`, inline: true },
            { name: '❌ **Errors**', value: `${errorCount} giveaways`, inline: true },
            { name: '👤 **Ended By**', value: interaction.user.username, inline: true }
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleGiveawayJoin(interaction) {
    await interaction.deferUpdate();
    
    const giveawayId = interaction.customId.replace('giveaway_join_', '');
    const result = await giveawaySystem.joinGiveaway(interaction.user.id, giveawayId);
    
    if (result.success) {
        // Update the giveaway message with new participant count
        const giveaway = await db.getGiveaway(giveawayId);
        const embed = giveawaySystem.createGiveawayEmbed(giveaway, client);
        const buttons = giveawaySystem.createGiveawayButtons(giveawayId);
        
        await interaction.message.edit({ embeds: [embed], components: [buttons] });
        
        const entriesText = result.entries > 1 ? ` (${result.entries}x entries!)` : '';
        await interaction.followUp({ 
            content: `✅ ${result.message}\nTotal participants: ${result.participants}\nYour entries: ${result.entries}${entriesText}`, 
            ephemeral: true 
        });
    } else {
        await interaction.followUp({ content: `❌ ${result.message}`, ephemeral: true });
    }
}

async function handleAutoGiveaway(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Only administrators can manage auto-giveaways!', ephemeral: true });
    }
    
    const subCommand = interaction.options.getSubcommand();
    
    switch (subCommand) {
        case 'enable':
            await handleEnableAutoGiveaway(interaction);
            break;
        case 'setduration':
            await handleSetDuration(interaction);
            break;
        case 'setinterval':
            await handleSetInterval(interaction);
            break;
        case 'disable':
            await handleDisableAutoGiveaway(interaction);
            break;
        case 'status':
            await handleAutoGiveawayStatus(interaction);
            break;
    }
}

async function handleEnableAutoGiveaway(interaction) {
    await interaction.deferReply();
    
    const channel = interaction.options.getChannel('channel');
    const duration = interaction.options.getInteger('duration') || 15;
    const interval = interaction.options.getInteger('interval') || 30;
    
    const config = await autoGiveawaySystem.enableAutoGiveaway(
        interaction.guild.id,
        channel.id,
        { giveawayDuration: duration, interval }
    );
    
    const embed = autoGiveawaySystem.createAutoGiveawayEmbed(interaction.guild, config);
    
    await interaction.editReply({ 
        content: `✅ **Auto-giveaways enabled!**\n\nGiveaways will start every **${interval} minutes** and run for **${duration} minutes** each in <#${channel.id}>`,
        embeds: [embed],
        ephemeral: true 
    });
}

async function handleSetDuration(interaction) {
    await interaction.deferReply();
    
    const duration = interaction.options.getInteger('duration');
    
    try {
        const success = await autoGiveawaySystem.setGiveawayDuration(interaction.guild.id, duration);
        
        if (success) {
            const config = autoGiveawaySystem.getAutoGiveawayConfig(interaction.guild.id);
            const embed = autoGiveawaySystem.createAutoGiveawayEmbed(interaction.guild, config);
            
            await interaction.editReply({ 
                content: `✅ **Duration updated!**\n\nGiveaways will now run for **${duration} minutes**`,
                embeds: [embed],
                ephemeral: true 
            });
        } else {
            await interaction.editReply({ 
                content: '❌ Auto-giveaways not configured. Use `/autogiveaway enable` first.',
                ephemeral: true 
            });
        }
    } catch (error) {
        await interaction.editReply({ 
            content: `❌ ${error.message}`,
            ephemeral: true 
        });
    }
}

async function handleSetInterval(interaction) {
    await interaction.deferReply();
    
    const interval = interaction.options.getInteger('interval');
    
    try {
        const success = await autoGiveawaySystem.setInterval(interaction.guild.id, interval);
        
        if (success) {
            const config = autoGiveawaySystem.getAutoGiveawayConfig(interaction.guild.id);
            const embed = autoGiveawaySystem.createAutoGiveawayEmbed(interaction.guild, config);
            
            await interaction.editReply({ 
                content: `✅ **Interval updated!**\n\nGiveaways will now start every **${interval} minutes**`,
                embeds: [embed],
                ephemeral: true 
            });
        } else {
            await interaction.editReply({ 
                content: '❌ Auto-giveaways not configured. Use `/autogiveaway enable` first.',
                ephemeral: true 
            });
        }
    } catch (error) {
        await interaction.editReply({ 
            content: `❌ ${error.message}`,
            ephemeral: true 
        });
    }
}

async function handleDisableAutoGiveaway(interaction) {
    await interaction.deferReply();
    
    await autoGiveawaySystem.disableAutoGiveaway(interaction.guild.id);
    
    await interaction.editReply({ 
        content: '❌ **Auto-giveaways disabled!**\n\nNo more automatic giveaways will be created.',
        ephemeral: true 
    });
}

async function handleAutoGiveawayStatus(interaction) {
    await interaction.deferReply();
    
    const config = autoGiveawaySystem.getAutoGiveawayConfig(interaction.guild.id);
    
    if (!config) {
        return interaction.editReply({ 
            content: '❌ **Auto-giveaways not configured!**\n\nUse `/autogiveaway enable` to set up automatic giveaways.',
            ephemeral: true 
        });
    }
    
    const embed = autoGiveawaySystem.createAutoGiveawayEmbed(interaction.guild, config);
    
    await interaction.editReply({ 
        embeds: [embed],
        ephemeral: true 
    });
}

async function handleGiveGems(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Only administrators can use this command!', ephemeral: true });
    }
    
    await interaction.deferReply();
    
    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const reason = 'Admin command';
    
    // Get or create user data
    let userData = await db.getUser(user.id, interaction.guild.id);
    if (!userData) {
        await db.createUser(user.id, interaction.guild.id);
        userData = await db.getUser(user.id, interaction.guild.id);
    }
    
    // Update user gems
    const newGems = userData.gems + amount;
    await db.updateUser(user.id, interaction.guild.id, {
        gems: newGems,
        rank_tier: rankSystem.getUserRank(newGems).name
    });
    
    // Create success embed
    const embed = new EmbedBuilder()
        .setTitle('💎 Gems Given!')
        .setColor('#00FF00')
        .setDescription(`Successfully gave ${amount.toLocaleString()} gems to ${user.username}`)
        .addFields(
            { name: '👤 User', value: user.username, inline: true },
            { name: '💎 Amount', value: `${amount.toLocaleString()} gems`, inline: true },
            { name: '💰 New Balance', value: `${newGems.toLocaleString()} gems`, inline: true },
            { name: '📝 Reason', value: reason, inline: false }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    
    // Notify user
    try {
        const notifyEmbed = new EmbedBuilder()
            .setTitle('💎 You Received Gems!')
            .setColor('#00FF00')
            .setDescription(`You received ${amount.toLocaleString()} gems from ${interaction.user.username}`)
            .addFields(
                { name: '💎 Amount', value: `${amount.toLocaleString()} gems`, inline: true },
                { name: '📝 Reason', value: reason, inline: true },
                { name: '💰 New Balance', value: `${newGems.toLocaleString()} gems`, inline: true }
            )
            .setTimestamp();
        
        await user.send({ embeds: [notifyEmbed] });
    } catch (error) {
        console.log('Could not send DM to user:', error.message);
    }
}

async function handleGiveXP(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Only administrators can use this command!', ephemeral: true });
    }
    
    await interaction.deferReply();
    
    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const reason = 'Admin command';
    
    // Get or create user data
    let userData = await db.getUser(user.id, interaction.guild.id);
    if (!userData) {
        await db.createUser(user.id, interaction.guild.id);
        userData = await db.getUser(user.id, interaction.guild.id);
    }
    
    // XP doesn't directly affect user data, but we can track it separately
    // For now, we'll just log the XP given
    
    // Create success embed
    const embed = new EmbedBuilder()
        .setTitle('⭐ XP Given!')
        .setColor('#FFD700')
        .setDescription(`Successfully gave ${amount.toLocaleString()} XP to ${user.username}`)
        .addFields(
            { name: '👤 User', value: user.username, inline: true },
            { name: '⭐ Amount', value: `${amount.toLocaleString()} XP`, inline: true },
            { name: '📝 Reason', value: reason, inline: false }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    
    // Notify user
    try {
        const notifyEmbed = new EmbedBuilder()
            .setTitle('⭐ You Received XP!')
            .setColor('#FFD700')
            .setDescription(`You received ${amount.toLocaleString()} XP from ${interaction.user.username}`)
            .addFields(
                { name: '⭐ Amount', value: `${amount.toLocaleString()} XP`, inline: true },
                { name: '📝 Reason', value: reason, inline: true }
            )
            .setTimestamp();
        
        await user.send({ embeds: [notifyEmbed] });
    } catch (error) {
        console.log('Could not send DM to user:', error.message);
    }
}

async function handleGiveAll(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Only administrators can use this command!', ephemeral: true });
    }
    
    await interaction.deferReply();
    
    const amount = interaction.options.getInteger('amount');
    const reason = 'Server-wide reward';
    
    // Get all online members
    const onlineMembers = interaction.guild.members.cache.filter(member => !member.user.bot && member.presence?.status !== 'offline');
    
    if (onlineMembers.size === 0) {
        return interaction.editReply({ content: 'No online users found!' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const [memberId, member] of onlineMembers) {
        try {
            let userData = await db.getUser(memberId, interaction.guild.id);
            if (!userData) {
                await db.createUser(memberId, interaction.guild.id);
                userData = await db.getUser(memberId, interaction.guild.id);
            }
            
            const newGems = userData.gems + amount;
            await db.updateUser(memberId, interaction.guild.id, {
                gems: newGems,
                rank_tier: rankSystem.getUserRank(newGems).name
            });
            
            // Notify user
            try {
                const notifyEmbed = new EmbedBuilder()
                    .setTitle('💎 Server Gift!')
                    .setColor('#00FF00')
                    .setDescription(`You received ${amount.toLocaleString()} gems from the server!`)
                    .addFields(
                        { name: '💎 Amount', value: `${amount.toLocaleString()} gems`, inline: true },
                        { name: '📝 Reason', value: reason, inline: true },
                        { name: '💰 New Balance', value: `${newGems.toLocaleString()} gems`, inline: true }
                    )
                    .setTimestamp();
                
                await member.user.send({ embeds: [notifyEmbed] });
            } catch (error) {
                console.log('Could not send DM to user:', error.message);
            }
            
            successCount++;
        } catch (error) {
            console.error(`Error giving gems to ${member.user.username}:`, error);
            errorCount++;
        }
    }
    
    // Create summary embed
    const embed = new EmbedBuilder()
        .setTitle('🎁 Gems Given to All!')
        .setColor('#00FF00')
        .setDescription(`Successfully gave ${amount.toLocaleString()} gems to all online users`)
        .addFields(
            { name: '✅ Successful', value: `${successCount} users`, inline: true },
            { name: '❌ Failed', value: `${errorCount} users`, inline: true },
            { name: '💎 Amount per user', value: `${amount.toLocaleString()} gems`, inline: true },
            { name: '📝 Reason', value: reason, inline: false }
        )
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
        // Removed ephemeral: true to make it public
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

async function handleLeaderboardPagination(interaction) {
    await interaction.deferUpdate();
    
    const [action, pageStr] = interaction.customId.split('_');
    const currentPage = parseInt(pageStr);
    const users = await db.getLeaderboard(interaction.guild.id, 50);
    const totalPages = Math.ceil(users.length / 10);
    
    let newPage = currentPage;
    if (action === 'prev') {
        newPage = Math.max(1, currentPage - 1);
    } else if (action === 'next') {
        newPage = Math.min(totalPages, currentPage + 1);
    }
    
    const embed = rankSystem.createLeaderboardEmbed(users, interaction.guild, newPage, 10);
    const buttons = rankSystem.createLeaderboardButtons(newPage, totalPages);
    
    await interaction.editReply({ embeds: [embed], components: [buttons] });
}

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

async function handleTicket(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
        case 'create':
            await handleCreateTicket(interaction);
            break;
        case 'close':
            await handleCloseTicket(interaction);
            break;
        case 'list':
            await handleListTickets(interaction);
            break;
        case 'panel':
            await handleTicketPanel(interaction);
            break;
    }
}

async function handleCreateTicket(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const reason = interaction.options.getString('reason');
    const category = interaction.options.getString('category');
    
    try {
        // Check if user already has open tickets
        const userTickets = await ticketSystem.getUserTickets(interaction.user.id, interaction.guild.id);
        const openTickets = userTickets.filter(ticket => ticket.status === 'open');
        
        if (openTickets.length >= 3) {
            return await interaction.editReply({
                content: '❌ **Too Many Open Tickets!** You already have 3 open tickets. Please close one before creating another.',
                ephemeral: true
            });
        }
        
        // Create ticket
        const ticketId = await ticketSystem.createTicket(interaction.user.id, interaction.guild.id, reason, category);
        
        // Create ticket channel
        const channel = await ticketSystem.createTicketChannel(interaction.guild, interaction.user, ticketId, category, reason);
        
        // Update ticket with channel ID
        await db.updateTicketChannel(ticketId, channel.id);
        
        // Send confirmation
        const embed = new EmbedBuilder()
            .setTitle('🎫 **Ticket Created Successfully!**')
            .setColor('#00FF00')
            .setDescription(`Your support ticket has been created!\n\n**Ticket ID:** ${ticketId}\n**Category:** ${category}\n**Channel:** ${channel.toString()}`)
            .addFields(
                { name: '📝 **Your Reason**', value: reason, inline: false },
                { name: '📍 **Next Steps**', value: `Please go to ${channel.toString()} and describe your issue in detail. Staff will assist you shortly.`, inline: false }
            )
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        // Log to console
        console.log(`Ticket ${ticketId} created by ${interaction.user.username} in ${interaction.guild.name}`);
        
    } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.editReply({
            content: '❌ **Error creating ticket!** Please try again later or contact an administrator.',
            ephemeral: true
        });
    }
}

async function handleCloseTicket(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    if (!interaction.member.permissions.has('ManageChannels')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need the "Manage Channels" permission to close tickets.',
            ephemeral: true
        });
    }
    
    const ticketId = interaction.options.getString('ticket_id');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    try {
        const ticket = await ticketSystem.getTicket(ticketId);
        
        if (!ticket) {
            return await interaction.editReply({
                content: `❌ **Ticket Not Found!** Ticket with ID ${ticketId} does not exist.`,
                ephemeral: true
            });
        }
        
        if (ticket.status === 'closed') {
            return await interaction.editReply({
                content: `❌ **Already Closed!** Ticket ${ticketId} is already closed.`,
                ephemeral: true
            });
        }
        
        // Close ticket in database
        await ticketSystem.closeTicket(ticketId, interaction.user.id, reason);
        
        // Close and archive the channel if it exists
        if (ticket.channel_id) {
            const channel = interaction.guild.channels.cache.get(ticket.channel_id);
            if (channel) {
                try {
                    await channel.setName(`closed-${ticketId.toLowerCase()}`);
                    await channel.permissionOverwrites.set([
                        {
                            id: interaction.guild.id,
                            deny: ['ViewChannel', 'SendMessages']
                        },
                        {
                            id: ticket.user_id,
                            deny: ['SendMessages']
                        }
                    ]);
                    
                    // Send closing message
                    const closeEmbed = new EmbedBuilder()
                        .setTitle('🔒 **Ticket Closed**')
                        .setColor('#FF0000')
                        .setDescription(`This ticket has been closed by ${interaction.user.toString()}\n\n**Reason:** ${reason}`)
                        .setFooter({ text: '💎 Gem Economy Bot • Support System' })
                        .setTimestamp();
                    
                    await channel.send({ embeds: [closeEmbed] });
                } catch (channelError) {
                    console.error('Error closing ticket channel:', channelError);
                }
            }
        }
        
        // Send confirmation
        const embed = new EmbedBuilder()
            .setTitle('🔒 **Ticket Closed Successfully!**')
            .setColor('#FF0000')
            .setDescription(`Ticket ${ticketId} has been closed.\n\n**Closed by:** ${interaction.user.toString()}\n**Reason:** ${reason}`)
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        console.log(`Ticket ${ticketId} closed by ${interaction.user.username}`);
        
    } catch (error) {
        console.error('Error closing ticket:', error);
        await interaction.editReply({
            content: '❌ **Error closing ticket!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleListTickets(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    if (!interaction.member.permissions.has('ManageChannels')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need the "Manage Channels" permission to list tickets.',
            ephemeral: true
        });
    }
    
    try {
        const tickets = await ticketSystem.getActiveTickets(interaction.guild.id);
        
        if (tickets.length === 0) {
            return await interaction.editReply({
                content: '📋 **No Active Tickets** - There are currently no open tickets.',
                ephemeral: true
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('📋 **Active Tickets**')
            .setColor('#0099FF')
            .setDescription(`There are currently **${tickets.length}** open tickets.`)
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();
        
        for (const ticket of tickets) {
            const user = await client.users.fetch(ticket.user_id).catch(() => null);
            const username = user ? user.username : `Unknown (${ticket.user_id})`;
            const createdAt = new Date(ticket.created_at).toLocaleString();
            
            embed.addFields({
                name: `🎫 Ticket ${ticket.ticket_id}`,
                value: `👤 **User:** ${username}\n📂 **Category:** ${ticket.category}\n📅 **Created:** ${createdAt}\n📝 **Reason:** ${ticket.reason || 'No reason provided'}`,
                inline: false
            });
        }
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
    } catch (error) {
        console.error('Error listing tickets:', error);
        await interaction.editReply({
            content: '❌ **Error fetching tickets!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleTicketPanel(interaction) {
    await interaction.deferReply();
    
    if (!interaction.member.permissions.has('ManageChannels')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need the "Manage Channels" permission to create ticket panels.',
            ephemeral: true
        });
    }
    
    try {
        const embed = ticketSystem.createTicketPanelEmbed();
        const buttons = ticketSystem.createTicketPanelButtons();
        
        await interaction.editReply({
            content: '🎫 **Ticket Panel Created!** Members can now create support tickets using the button below.',
            embeds: [embed],
            components: [buttons]
        });
        
    } catch (error) {
        console.error('Error creating ticket panel:', error);
        await interaction.editReply({
            content: '❌ **Error creating ticket panel!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleCreateTicketButton(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        // Check if user already has too many open tickets
        const userTickets = await ticketSystem.getUserTickets(interaction.user.id, interaction.guild.id);
        const openTickets = userTickets.filter(ticket => ticket.status === 'open');
        
        if (openTickets.length >= 3) {
            return await interaction.editReply({
                content: '❌ **Too Many Open Tickets!** You already have 3 open tickets. Please close one before creating another.',
                ephemeral: true
            });
        }
        
        // Show category selection
        const embed = new EmbedBuilder()
            .setTitle('🎫 **Select Ticket Category**')
            .setColor('#0099FF')
            .setDescription('Please select the category that best describes your issue:')
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();
        
        const buttons = ticketSystem.createTicketCategoryButtons();
        
        await interaction.editReply({
            embeds: [embed],
            components: buttons
        });
        
    } catch (error) {
        console.error('Error handling ticket button:', error);
        await interaction.editReply({
            content: '❌ **Error!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleTicketCategorySelection(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const categoryMap = {
            'ticket_category_general': 'General Support',
            'ticket_category_economy': 'Economy Issues',
            'ticket_category_giveaway': 'Giveaway Issues',
            'ticket_category_rank': 'Rank Issues',
            'ticket_category_bug': 'Bug Reports',
            'ticket_category_suggestion': 'Suggestions'
        };
        
        const category = categoryMap[interaction.customId];
        if (!category) {
            return await interaction.editReply({
                content: '❌ **Invalid Category!** Please try again.',
                ephemeral: true
            });
        }
        
        // Create modal for reason input
        const modal = new ModalBuilder()
            .setCustomId(`ticket_modal_${category.replace(/\s+/g, '_').toLowerCase()}`)
            .setTitle(`Create ${category} Ticket`)
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('ticket_reason')
                        .setLabel('Please describe your issue in detail')
                        .setStyle(1) // Paragraph
                        .setPlaceholder('Be as descriptive as possible...')
                        .setRequired(true)
                        .setMaxLength(500)
                )
            );
        
        await interaction.showModal(modal);
        
    } catch (error) {
        console.error('Error handling ticket category selection:', error);
        await interaction.editReply({
            content: '❌ **Error!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleTicketCloseButton(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    if (!interaction.member.permissions.has('ManageChannels')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need the "Manage Channels" permission to close tickets.',
            ephemeral: true
        });
    }
    
    try {
        const ticketId = interaction.customId.replace('ticket_close_', '');
        const ticket = await ticketSystem.getTicket(ticketId);
        
        if (!ticket) {
            return await interaction.editReply({
                content: `❌ **Ticket Not Found!** Ticket with ID ${ticketId} does not exist.`,
                ephemeral: true
            });
        }
        
        if (ticket.status === 'closed') {
            return await interaction.editReply({
                content: `❌ **Already Closed!** Ticket ${ticketId} is already closed.`,
                ephemeral: true
            });
        }
        
        // Create modal for close reason
        const modal = new ModalBuilder()
            .setCustomId(`close_ticket_modal_${ticketId}`)
            .setTitle('Close Ticket')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('close_reason')
                        .setLabel('Reason for closing this ticket (optional)')
                        .setStyle(1) // Paragraph
                        .setPlaceholder('Enter reason for closing...')
                        .setRequired(false)
                        .setMaxLength(500)
                )
            );
        
        await interaction.showModal(modal);
        
    } catch (error) {
        console.error('Error handling ticket close button:', error);
        await interaction.editReply({
            content: '❌ **Error!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleTicketClaimButton(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    if (!interaction.member.permissions.has('ManageChannels')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need the "Manage Channels" permission to claim tickets.',
            ephemeral: true
        });
    }
    
    try {
        const ticketId = interaction.customId.replace('ticket_claim_', '');
        const ticket = await ticketSystem.getTicket(ticketId);
        
        if (!ticket) {
            return await interaction.editReply({
                content: `❌ **Ticket Not Found!** Ticket with ID ${ticketId} does not exist.`,
                ephemeral: true
            });
        }
        
        if (ticket.status === 'closed') {
            return await interaction.editReply({
                content: `❌ **Already Closed!** Ticket ${ticketId} is already closed.`,
                ephemeral: true
            });
        }
        
        if (ticket.claimed_by) {
            return await interaction.editReply({
                content: `❌ **Already Claimed!** This ticket has already been claimed by <@${ticket.claimed_by}>.`,
                ephemeral: true
            });
        }
        
        // Claim the ticket
        await ticketSystem.claimTicket(ticketId, interaction.user.id);
        
        // Update the message to show it's claimed
        const embed = new EmbedBuilder()
            .setTitle('🎫 **Ticket Claimed**')
            .setColor('#00FF00')
            .setDescription(`This ticket has been claimed by ${interaction.user.toString()}`)
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();
        
        await interaction.message.edit({ embeds: [embed], components: [] });
        
        await interaction.editReply({
            content: `✅ **Ticket Claimed!** You have successfully claimed ticket ${ticketId}.`,
            ephemeral: true
        });
        
        console.log(`Ticket ${ticketId} claimed by ${interaction.user.username}`);
        
    } catch (error) {
        console.error('Error handling ticket claim button:', error);
        await interaction.editReply({
            content: '❌ **Error!** Please try again later.',
            ephemeral: true
        });
    }
}

async function handleTicketModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        // Extract category from modal custom ID
        const categoryMap = {
            'ticket_modal_general_support': 'General Support',
            'ticket_modal_economy_issues': 'Economy Issues',
            'ticket_modal_giveaway_issues': 'Giveaway Issues',
            'ticket_modal_rank_issues': 'Rank Issues',
            'ticket_modal_bug_reports': 'Bug Reports',
            'ticket_modal_suggestions': 'Suggestions'
        };
        
        const category = categoryMap[interaction.customId];
        if (!category) {
            return await interaction.editReply({
                content: '❌ **Invalid Category!** Please try again.',
                ephemeral: true
            });
        }
        
        const reason = interaction.fields.getTextInputValue('ticket_reason');
        
        // Check if user already has too many open tickets
        const userTickets = await ticketSystem.getUserTickets(interaction.user.id, interaction.guild.id);
        const openTickets = userTickets.filter(ticket => ticket.status === 'open');
        
        if (openTickets.length >= 3) {
            return await interaction.editReply({
                content: '❌ **Too Many Open Tickets!** You already have 3 open tickets. Please close one before creating another.',
                ephemeral: true
            });
        }
        
        // Create ticket
        const ticketId = await ticketSystem.createTicket(interaction.user.id, interaction.guild.id, reason, category);
        
        // Create ticket channel
        const channel = await ticketSystem.createTicketChannel(interaction.guild, interaction.user, ticketId, category, reason);
        
        // Update ticket with channel ID
        await db.updateTicketChannel(ticketId, channel.id);
        
        // Send confirmation
        const embed = new EmbedBuilder()
            .setTitle('🎫 **Ticket Created Successfully!**')
            .setColor('#00FF00')
            .setDescription(`Your support ticket has been created!\n\n**Ticket ID:** ${ticketId}\n**Category:** ${category}\n**Channel:** ${channel.toString()}`)
            .addFields(
                { name: '📝 **Your Reason**', value: reason, inline: false },
                { name: '📍 **Next Steps**', value: `Please go to ${channel.toString()} and describe your issue in detail. Staff will assist you shortly.`, inline: false }
            )
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        // Log to console
        console.log(`Ticket ${ticketId} created by ${interaction.user.username} in ${interaction.guild.name}`);
        
    } catch (error) {
        console.error('Error handling ticket modal submit:', error);
        await interaction.editReply({
            content: '❌ **Error creating ticket!** Please try again later or contact an administrator.',
            ephemeral: true
        });
    }
}

async function handleCloseTicketModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    if (!interaction.member.permissions.has('ManageChannels')) {
        return await interaction.editReply({
            content: '❌ **Permission Denied!** You need the "Manage Channels" permission to close tickets.',
            ephemeral: true
        });
    }
    
    try {
        const ticketId = interaction.customId.replace('close_ticket_modal_', '');
        const reason = interaction.fields.getTextInputValue('close_reason') || 'No reason provided';
        
        const ticket = await ticketSystem.getTicket(ticketId);
        
        if (!ticket) {
            return await interaction.editReply({
                content: `❌ **Ticket Not Found!** Ticket with ID ${ticketId} does not exist.`,
                ephemeral: true
            });
        }
        
        if (ticket.status === 'closed') {
            return await interaction.editReply({
                content: `❌ **Already Closed!** Ticket ${ticketId} is already closed.`,
                ephemeral: true
            });
        }
        
        // Close ticket in database
        await ticketSystem.closeTicket(ticketId, interaction.user.id, reason);
        
        // Close and archive the channel if it exists
        if (ticket.channel_id) {
            const channel = interaction.guild.channels.cache.get(ticket.channel_id);
            if (channel) {
                try {
                    await channel.setName(`closed-${ticketId.toLowerCase()}`);
                    await channel.permissionOverwrites.set([
                        {
                            id: interaction.guild.id,
                            deny: ['ViewChannel', 'SendMessages']
                        },
                        {
                            id: ticket.user_id,
                            deny: ['SendMessages']
                        }
                    ]);
                    
                    // Send closing message
                    const closeEmbed = new EmbedBuilder()
                        .setTitle('🔒 **Ticket Closed**')
                        .setColor('#FF0000')
                        .setDescription(`This ticket has been closed by ${interaction.user.toString()}\n\n**Reason:** ${reason}`)
                        .setFooter({ text: '💎 Gem Economy Bot • Support System' })
                        .setTimestamp();
                    
                    await channel.send({ embeds: [closeEmbed] });
                } catch (channelError) {
                    console.error('Error closing ticket channel:', channelError);
                }
            }
        }
        
        // Send confirmation
        const embed = new EmbedBuilder()
            .setTitle('🔒 **Ticket Closed Successfully!**')
            .setColor('#FF0000')
            .setDescription(`Ticket ${ticketId} has been closed.\n\n**Closed by:** ${interaction.user.toString()}\n**Reason:** ${reason}`)
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        
        console.log(`Ticket ${ticketId} closed by ${interaction.user.username}`);
        
    } catch (error) {
        console.error('Error handling close ticket modal submit:', error);
        await interaction.editReply({
            content: '❌ **Error closing ticket!** Please try again later.',
            ephemeral: true
        });
    }
}

client.login(process.env.DISCORD_TOKEN);
