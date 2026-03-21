const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'bot.db'));
        this.init();
    }

    init() {
        this.db.serialize(() => {
            // Create users table with gems column
            this.db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    guild_id TEXT,
                    gems INTEGER DEFAULT 0,
                    xp INTEGER DEFAULT 0,
                    total_messages INTEGER DEFAULT 0,
                    last_message_time INTEGER DEFAULT 0,
                    rank_tier TEXT DEFAULT 'Member'
                )
            `);

            // Add gems column if it doesn't exist (for existing databases)
            this.db.run(`
                ALTER TABLE users ADD COLUMN gems INTEGER DEFAULT 0
            `, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.log('Error adding gems column:', err.message);
                }
            });

            // Drop credits column if it exists
            this.db.run(`
                ALTER TABLE users DROP COLUMN IF EXISTS credits
            `, (err) => {
                if (err) {
                    console.log('Error dropping credits column (may not exist):', err.message);
                }
            });

            this.db.run(`
                CREATE TABLE IF NOT EXISTS guild_settings (
                    guild_id TEXT PRIMARY KEY,
                    credits_channel_id TEXT,
                    chest_channel_id TEXT,
                    welcome_channel_id TEXT,
                    giveaway_channel_id TEXT,
                    bank_channel_id TEXT
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS giveaways (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT,
                    channel_id TEXT,
                    message_id TEXT,
                    prize TEXT,
                    winners INTEGER DEFAULT 1,
                    end_time INTEGER,
                    entry_cost INTEGER DEFAULT 0,
                    created_by TEXT,
                    status TEXT DEFAULT 'active',
                    participants TEXT DEFAULT '[]',
                    winner_ids TEXT DEFAULT '[]'
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS chest_rewards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    reward_type TEXT,
                    reward_amount INTEGER,
                    opened_at INTEGER DEFAULT (strftime('%s', 'now'))
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS bank_accounts (
                    user_id TEXT NOT NULL,
                    guild_id TEXT,
                    balance INTEGER DEFAULT 0,
                    total_deposited INTEGER DEFAULT 0,
                    total_withdrawn INTEGER DEFAULT 0,
                    total_interest_earned INTEGER DEFAULT 0,
                    last_interest_date TEXT,
                    created_at INTEGER DEFAULT (strftime('%s', 'now')),
                    PRIMARY KEY (user_id, guild_id)
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS redeem_codes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    code TEXT UNIQUE NOT NULL,
                    reward_type TEXT NOT NULL,
                    reward_amount INTEGER NOT NULL,
                    max_uses INTEGER DEFAULT 1,
                    current_uses INTEGER DEFAULT 0,
                    created_by TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER,
                    is_active BOOLEAN DEFAULT 1
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS tickets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_id TEXT UNIQUE NOT NULL,
                    user_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    reason TEXT,
                    status TEXT DEFAULT 'open',
                    channel_id TEXT,
                    created_at INTEGER NOT NULL,
                    closed_at INTEGER,
                    closed_by TEXT,
                    close_reason TEXT,
                    claimed_by TEXT,
                    claimed_at INTEGER
                )
            `);
        });
    }

    async resetUser(userId, guildId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE users SET gems = 0, xp = 0, total_messages = 0, last_message_time = 0, rank_tier = \'Member\' WHERE user_id = ? AND guild_id = ?',
                [userId, guildId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getUser(userId, guildId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE user_id = ? AND guild_id = ?',
                [userId, guildId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async createUser(userId, guildId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR IGNORE INTO users (user_id, guild_id) VALUES (?, ?)',
                [userId, guildId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async updateUser(userId, guildId, updates) {
        const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);
        
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE users SET ${fields} WHERE user_id = ? AND guild_id = ?`,
                [...values, userId, guildId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getTopUsers(guildId, limit) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM users WHERE guild_id = ? ORDER BY gems DESC LIMIT ?`,
                [guildId, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async getGuildSettings(guildId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM guild_settings WHERE guild_id = ?',
                [guildId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async updateGuildSettings(guildId, settings) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT OR REPLACE INTO guild_settings (guild_id, credits_channel_id, chest_channel_id, welcome_channel_id, giveaway_channel_id, bank_channel_id) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [guildId, settings.credits_channel_id, settings.chest_channel_id, settings.welcome_channel_id, settings.giveaway_channel_id, settings.bank_channel_id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getAllBankAccounts() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM bank_accounts',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async addChestReward(userId, rewardType, rewardAmount) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO chest_rewards (user_id, reward_type, reward_amount) VALUES (?, ?, ?)',
                [userId, rewardType, rewardAmount],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getBankAccount(userId, guildId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM bank_accounts WHERE user_id = ? AND guild_id = ?',
                [userId, guildId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async createBankAccount(userId, guildId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR IGNORE INTO bank_accounts (user_id, guild_id) VALUES (?, ?)',
                [userId, guildId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async updateBankAccount(userId, guildId, updates) {
        const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);
        
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE bank_accounts SET ${fields} WHERE user_id = ? AND guild_id = ?`,
                [...values, userId, guildId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getLeaderboard(guildId, limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT user_id, gems, total_messages FROM users WHERE guild_id = ? ORDER BY gems DESC LIMIT ?',
                [guildId, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async createGiveaway(guildId, channelId, prize, winners, endTime, entryCost, createdBy) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO giveaways (guild_id, channel_id, prize, winners, end_time, entry_cost, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [guildId, channelId, prize, winners, endTime, entryCost, createdBy],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getGiveaway(giveawayId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM giveaways WHERE id = ?',
                [giveawayId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async createBankAccount(userId, guildId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR IGNORE INTO bank_accounts (user_id, guild_id) VALUES (?, ?)',
                [userId, guildId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getBankAccount(userId, guildId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM bank_accounts WHERE user_id = ? AND guild_id = ?',
                [userId, guildId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async updateBankAccount(userId, guildId, updates) {
        const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);
        
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE bank_accounts SET ${fields} WHERE user_id = ? AND guild_id = ?`,
                [...values, userId, guildId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getAllBankAccounts() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM bank_accounts',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async updateGiveaway(giveawayId, updates) {
        const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);
        
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE giveaways SET ${fields} WHERE id = ?`,
                [...values, giveawayId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getActiveGiveaways(guildId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM giveaways WHERE guild_id = ? AND status = "active" AND end_time > ?',
                [guildId, Date.now()],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async createRedeemCode(code, rewardType, rewardAmount, maxUses, createdBy, expiresAt = null) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO redeem_codes (code, reward_type, reward_amount, max_uses, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [code.toUpperCase(), rewardType, rewardAmount, maxUses, createdBy, Date.now(), expiresAt],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getRedeemCode(code) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM redeem_codes WHERE code = ? AND is_active = 1',
                [code.toUpperCase()],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async updateRedeemCodeUses(codeId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE redeem_codes SET current_uses = current_uses + 1 WHERE id = ?',
                [codeId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async recordCodeRedemption(userId, guildId, codeId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO redeemed_codes (user_id, guild_id, code_id, redeemed_at) VALUES (?, ?, ?, ?)',
                [userId, guildId, codeId, Date.now()],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async hasUserRedeemedCode(userId, guildId, codeId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM redeemed_codes WHERE user_id = ? AND guild_id = ? AND code_id = ?',
                [userId, guildId, codeId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }

    async getAllRedeemCodes() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM redeem_codes ORDER BY created_at DESC',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async deleteRedeemCode(code) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE redeem_codes SET is_active = 0 WHERE code = ?',
                [code.toUpperCase()],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    // Ticket functions
    async createTicket(ticketId, userId, guildId, reason, category) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO tickets (ticket_id, user_id, guild_id, reason, category, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [ticketId, userId, guildId, reason, category, Date.now()],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async getTicket(ticketId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM tickets WHERE ticket_id = ?',
                [ticketId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async getTicketByChannel(channelId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM tickets WHERE channel_id = ? AND status = "open"',
                [channelId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async getUserTickets(userId, guildId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM tickets WHERE user_id = ? AND guild_id = ? ORDER BY created_at DESC',
                [userId, guildId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async getActiveTickets(guildId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM tickets WHERE guild_id = ? AND status = "open" ORDER BY created_at DESC',
                [guildId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async closeTicket(ticketId, closedBy, closeReason) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE tickets SET status = "closed", closed_by = ?, close_reason = ?, closed_at = ? WHERE ticket_id = ?',
                [closedBy, closeReason, Date.now(), ticketId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async claimTicket(ticketId, claimedBy) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE tickets SET claimed_by = ?, claimed_at = ? WHERE ticket_id = ?',
                [claimedBy, Date.now(), ticketId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    async updateTicketChannel(ticketId, channelId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE tickets SET channel_id = ? WHERE ticket_id = ?',
                [channelId, ticketId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = Database;
