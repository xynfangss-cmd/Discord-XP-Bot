# Discord Credit Bot

A feature-rich Discord bot with a credit-based ranking system, XP mechanics, and mystery chest rewards.

## Features

### 🏆 Ranking System
- **7 Rank Tiers** based on total credits:
  - ⚪ Member — 0+ Credits
  - 🟤 Copper — 45,000+ Credits
  - 🟡 Gold — 125,000+ Credits
  - 🟢 Emerald — 425,000+ Credits
  - 🔵 Diamond — 850,000+ Credits
  - 🔴 Ruby — 1,650,000+ Credits
  - ⚫ Titanium — 5,000,000+ Credits

### 💰 Credit System
- Earn **5-25 credits** per message
- Automatic rank-up notifications
- Persistent data storage

### ⭐ XP System
- **100 XP** earned per **10,000 credits**
- XP can be spent to open mystery chests
- XP bonus rewards available

### 🎁 Mystery Chest
- Cost: **750 XP** to open
- Multiple reward tiers:
  - Credit Boost (1K-5K credits)
  - Credit Fortune (5K-15K credits)
  - Credit Treasure (15K-30K credits)
  - Credit Jackpot (30K-50K credits)
  - Credit Mega Jackpot (50K-100K credits)
  - XP Boost (200 XP)
  - XP Super Boost (500 XP)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   - Copy `.env` file and fill in your bot token:
     ```
     DISCORD_TOKEN=your_bot_token_here
     CLIENT_ID=your_client_id_here
     ```

3. **Create a Discord Bot Application:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to "Bot" section and create a bot
   - Enable the following intents:
     - Server Members Intent
     - Message Content Intent
   - Copy the bot token

4. **Invite the Bot:**
   - Generate an invite link with the following permissions:
     - Administrator (recommended for easy setup)
     - Send Messages
     - Embed Links
     - Use Slash Commands
     - Read Message History

5. **Start the bot:**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## Commands

### `/setup`
*Administrator only*
Configure bot channels for different features:
- Credits Channel: Where credit notifications appear
- Chest Channel: Where chest commands work
- Welcome Channel: Where welcome messages appear

### `/rank`
View your current rank, credits, XP, and progress to next rank.

### `/leaderboard`
View the server's top credit earners.

### `/chest`
Open the mystery chest interface to spend XP and win rewards.

## Database

The bot uses SQLite for data storage, automatically creating a `bot.db` file with the following tables:
- `users`: User credits, XP, and statistics
- `guild_settings`: Server-specific configuration
- `chest_rewards`: History of chest rewards

## Configuration

The bot is designed to work out of the box with minimal configuration. All settings can be managed through the `/setup` command.

## Features in Detail

### Credit Earning
- Random credit amount per message (5-25 credits)
- 1-second cooldown per user to prevent spam
- Automatic rank-up notifications with beautiful embeds

### Progress Tracking
- Visual progress bars to next rank
- Detailed statistics including total messages sent
- Color-coded rank system with custom emojis

### Chest System
- Weighted random reward system
- Multiple reward tiers with varying probabilities
- Beautiful chest interface with interactive buttons
- Reward history tracking

## Support

If you encounter any issues or need help setting up the bot, feel free to reach out or check the console logs for detailed error information.

## License

MIT License - feel free to modify and distribute!
