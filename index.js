require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const Database = require('./database');
const RankSystem = require('./ranks');
const ChestSystem = require('./chest');
const GiveawaySystem = require('./giveaway');
const BankSystem = require('./bank');
const TicketSystem = require('./ticket');

// Import command handlers
const economyCommands = require('./commands/economy');
const funCommands = require('./commands/fun');
const rankCommands = require('./commands/ranks');
const adminCommands = require('./commands/admin');
const utilityCommands = require('./commands/utility');
const { parseAmount } = require('./commands/utility');

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

// Global variables for tracking
global.cooldowns = new Set();
global.pendingBankTransactions = new Map();
global.bankUpdateIntervals = new Map();

// Ready event
client.once('ready', async () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    client.user.setActivity('💎 Gem Economy', { type: 'WATCHING' });
    
    // Apply daily interest
    setInterval(async () => {
        await bankSystem.applyDailyInterest();
    }, 60000);
    
    console.log('🏦 Bank interest system started');
});

// MessageCreate event for bank transactions
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const pendingTransaction = global.pendingBankTransactions.get(message.author.id);
    if (!pendingTransaction) return;
    
    const amount = parseAmount(message.content.toLowerCase().trim());
    
    if (isNaN(amount) || amount <= 0) {
        const errorEmbed = {
            title: '❌ Invalid Amount',
            color: 0xFF0000,
            description: 'Please enter a valid positive number!',
            fields: [
                { name: '💡 **Examples**', value: '• `1000` or `1k` for 1,000\n• `50000` or `50k` for 50,000\n• `1000000` or `1m` for 1,000,000', inline: false }
            ],
            timestamp: new Date().toISOString()
        };
        
        await message.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
    }
    
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
        
        const resultEmbed = {
            title: result.success ? '✅ Transaction Successful' : '❌ Transaction Failed',
            color: result.success ? 0x00FF00 : 0xFF0000,
            description: result.message,
            timestamp: new Date().toISOString()
        };
        
        if (result.success) {
            const updatedAccount = await bankSystem.getBalance(message.author.id, message.guild.id);
            const updatedUserData = await db.getUser(message.author.id, message.guild.id);
            
            resultEmbed.fields = [
                { name: '💎 **New Wallet Balance**', value: `**${updatedUserData.gems.toLocaleString()}** gems`, inline: true },
                { name: '🏦 **New Bank Balance**', value: `**${updatedAccount.balance.toLocaleString()}** gems`, inline: true }
            ];
        }
        
        await message.reply({ embeds: [resultEmbed], ephemeral: true });
        global.pendingBankTransactions.delete(message.author.id);
        
    } catch (error) {
        console.error('Error processing transaction:', error);
        await message.reply({ 
            content: '❌ An error occurred while processing your transaction. Please try again.', 
            ephemeral: true 
        });
    }
});

// InteractionCreate event
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        }
    } catch (error) {
        // Common "interaction expired/unknown" situations shouldn't crash the bot.
        const errorCode = error?.code;
        const isUnknownInteraction =
            errorCode === 10062 ||
            errorCode === 40060 ||
            (typeof error?.message === 'string' && error.message.toLowerCase().includes('unknown interaction'));

        if (isUnknownInteraction) {
            console.warn('Interaction expired/unknown; skipping response.');
            return;
        }

        console.error('Error handling interaction:', error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'An error occurred while processing your request.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
            }
        } catch (replyError) {
            console.error('Failed to send error response:', replyError);
        }
    }
});

// Prevent crashes on unexpected promise rejections / client errors
process.on('unhandledRejection', (err) => {
    console.error('Unhandled promise rejection:', err);
});

client.on('error', (err) => {
    console.error('Discord client error:', err);
});

// Main command router
async function handleSlashCommand(interaction) {
    const command = interaction.commandName;
    
    switch (command) {
        // Economy Commands
        case 'balance':
            await economyCommands.handleBalance(interaction, db, bankSystem, rankSystem);
            break;
        case 'bank':
            await economyCommands.handleBank(interaction, bankSystem);
            break;
        case 'deposit':
            await economyCommands.handleQuickDeposit(interaction, db, bankSystem);
            break;
        case 'withdraw':
            await economyCommands.handleQuickWithdraw(interaction, db, bankSystem);
            break;
        case 'daily':
            await economyCommands.handleDaily(interaction, db);
            break;
        case 'work':
            await economyCommands.handleWork(interaction, db);
            break;
        case 'gamble':
            await economyCommands.handleGamble(interaction, db);
            break;
            
        // Rank Commands
        case 'rank':
            await rankCommands.handleRank(interaction, db, rankSystem);
            break;
        case 'addrank':
            await rankCommands.handleAddRank(interaction);
            break;
        case 'ranks':
            await rankCommands.handleRanks(interaction, db, rankSystem);
            break;
        case 'leaderboard':
            await rankCommands.handleLeaderboard(interaction, db, rankSystem);
            break;
            
        // Fun Commands
        case 'chest':
            await funCommands.handleChest(interaction, db);
            break;
        case 'slots':
            await funCommands.handleSlots(interaction, db);
            break;
        case 'coinflip':
            await funCommands.handleCoinflip(interaction, db);
            break;
            
        // Admin Commands
        case 'admin':
            await adminCommands.handleAdmin(interaction, db);
            break;
            
        // Utility Commands
        case 'help':
            await utilityCommands.handleHelp(interaction);
            break;
        case 'ping':
            await utilityCommands.handlePing(interaction);
            break;
        case 'serverinfo':
            await utilityCommands.handleServerInfo(interaction);
            break;
        case 'userinfo':
            await utilityCommands.handleUserInfo(interaction, db, rankSystem, bankSystem);
            break;
            
        // Giveaway Commands
        case 'giveaway':
            await giveawaySystem.handleSlashCommand(interaction);
            break;
            
        // Ticket Commands
        case 'ticket':
            await ticketSystem.handleSlashCommand(interaction);
            break;
        default:
            await interaction.reply({ content: 'Unknown command.', ephemeral: true });
            break;
    }
}

// Button interaction handler
async function handleButtonInteraction(interaction) {
    if (interaction.customId.startsWith('bank_')) {
        await handleBankInteraction(interaction);
    } else if (interaction.customId.startsWith('ticket_')) {
        await ticketSystem.handleButton(interaction);
    } else if (interaction.customId.startsWith('giveaway_')) {
        await giveawaySystem.handleButton(interaction);
    }
}

// Bank button interaction handler
async function handleBankInteraction(interaction) {
    const action = interaction.customId.replace('bank_', '');
    
    switch (action) {
        case 'deposit':
            global.pendingBankTransactions.set(interaction.user.id, 'deposit');
            await interaction.reply({ 
                content: 'Please reply with the amount you want to deposit (e.g., 1000, 50k, 1.5m).',
                ephemeral: true 
            });
            break;
            
        case 'withdraw':
            global.pendingBankTransactions.set(interaction.user.id, 'withdraw');
            await interaction.reply({ 
                content: 'Please reply with the amount you want to withdraw (e.g., 1000, 50k, 1.5m).',
                ephemeral: true 
            });
            break;
        default:
            await interaction.reply({ content: 'Unknown bank action.', ephemeral: true });
            break;
    }
}

// Modal submit handler
async function handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('ticket_')) {
        await ticketSystem.handleModal(interaction);
    }
}

// Login
client.login(process.env.DISCORD_TOKEN);
