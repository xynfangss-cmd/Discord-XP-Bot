require('dotenv').config();
const { REST, Routes } = require('discord.js');

// Clean, simple command structure
const commands = [
    // Economy Commands
    {
        name: 'balance',
        description: 'Check your current balance and rank'
    },
    {
        name: 'bank',
        description: 'Access the Gem Bank to deposit and withdraw gems'
    },
    {
        name: 'deposit',
        description: 'Quick deposit gems to your bank account',
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
        description: 'Quick withdraw gems from your bank account',
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
        name: 'daily',
        description: 'Claim your daily reward'
    },
    {
        name: 'work',
        description: 'Work to earn gems'
    },
    {
        name: 'gamble',
        description: 'Gamble your gems for a chance to win more',
        options: [
            {
                name: 'amount',
                description: 'Amount to gamble',
                type: 4, // INTEGER
                required: true,
                min_value: 10
            }
        ]
    },
    
    // Rank Commands
    {
        name: 'rank',
        description: 'View or set your server rank',
        options: [
            {
                name: 'view',
                description: 'View rank info',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'View another user\'s rank',
                        type: 6, // USER
                        required: false
                    }
                ]
            },
            {
                name: 'set',
                description: 'Set your rank role in this server (restricted)',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'rank',
                        description: 'Rank to assign',
                        type: 3, // STRING
                        required: true,
                        choices: [
                            { name: 'Owner', value: 'Owner' },
                            { name: 'Member', value: 'Member' },
                            { name: 'Copper', value: 'Copper' },
                            { name: 'Gold', value: 'Gold' },
                            { name: 'Emerald', value: 'Emerald' },
                            { name: 'Diamond', value: 'Diamond' },
                            { name: 'Ruby', value: 'Ruby' },
                            { name: 'Titanium', value: 'Titanium' }
                        ]
                    }
                ]
            }
        ]
    },
    {
        name: 'addrank',
        description: 'Assign a rank role to a user (restricted)',
        options: [
            {
                name: 'user',
                description: 'User to assign the rank to',
                type: 6, // USER
                required: true
            },
            {
                name: 'rank',
                description: 'Rank to assign',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Owner', value: 'Owner' },
                    { name: 'Member', value: 'Member' },
                    { name: 'Copper', value: 'Copper' },
                    { name: 'Gold', value: 'Gold' },
                    { name: 'Emerald', value: 'Emerald' },
                    { name: 'Diamond', value: 'Diamond' },
                    { name: 'Ruby', value: 'Ruby' },
                    { name: 'Titanium', value: 'Titanium' }
                ]
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
    
    // Fun Commands
    {
        name: 'chest',
        description: 'Open a mystery chest for rewards'
    },
    {
        name: 'slots',
        description: 'Play the slot machine',
        options: [
            {
                name: 'amount',
                description: 'Amount to bet',
                type: 4, // INTEGER
                required: true,
                min_value: 10
            }
        ]
    },
    {
        name: 'coinflip',
        description: 'Flip a coin and bet on heads or tails',
        options: [
            {
                name: 'choice',
                description: 'Choose heads or tails',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Heads', value: 'heads' },
                    { name: 'Tails', value: 'tails' }
                ]
            },
            {
                name: 'amount',
                description: 'Amount to bet',
                type: 4, // INTEGER
                required: true,
                min_value: 10
            }
        ]
    },
    
    // Giveaway Commands
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
                        name: 'duration',
                        description: 'Duration in minutes',
                        type: 4, // INTEGER
                        required: false,
                        min_value: 1,
                        max_value: 1440
                    },
                    {
                        name: 'winners',
                        description: 'Number of winners',
                        type: 4, // INTEGER
                        required: false,
                        min_value: 1,
                        max_value: 10
                    }
                ]
            },
            {
                name: 'end',
                description: 'End an active giveaway',
                type: 1 // SUB_COMMAND
            },
            {
                name: 'reroll',
                description: 'Reroll a giveaway winner',
                type: 1 // SUB_COMMAND
            }
        ]
    },
    
    // Ticket Commands
    {
        name: 'ticket',
        description: 'Support ticket system',
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
                    }
                ]
            },
            {
                name: 'close',
                description: 'Close your ticket',
                type: 1 // SUB_COMMAND
            },
            {
                name: 'panel',
                description: 'Create a ticket panel',
                type: 1 // SUB_COMMAND
            }
        ]
    },
    
    // Admin Commands
    {
        name: 'admin',
        description: 'Admin management commands',
        options: [
            {
                name: 'givegems',
                description: 'Give gems to a user',
                type: 1, // SUB_COMMAND
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
                name: 'giveall',
                description: 'Give gems to all server members',
                type: 1, // SUB_COMMAND
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
                name: 'setbalance',
                description: 'Set a user\'s balance',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'User to set balance for',
                        type: 6, // USER
                        required: true
                    },
                    {
                        name: 'amount',
                        description: 'New balance amount',
                        type: 4, // INTEGER
                        required: true,
                        min_value: 0
                    }
                ]
            },
            {
                name: 'resetuser',
                description: 'Reset a user\'s data',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'User to reset',
                        type: 6, // USER
                        required: true
                    }
                ]
            }
        ]
    },
    
    // Utility Commands
    {
        name: 'help',
        description: 'View all available commands and help'
    },
    {
        name: 'ping',
        description: 'Check the bot\'s latency'
    },
    {
        name: 'serverinfo',
        description: 'View server information'
    },
    {
        name: 'userinfo',
        description: 'View user information',
        options: [
            {
                name: 'user',
                description: 'User to get info about',
                type: 6, // USER
                required: false
            }
        ]
    }
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
    } catch (error) {
        console.error('Error registering commands:', error);
    }
})();
