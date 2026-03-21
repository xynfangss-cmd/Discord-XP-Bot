const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

class TicketSystem {
    constructor(database, client) {
        this.db = database;
        this.client = client;
    }

    async createTicket(userId, guildId, reason, category) {
        const ticketId = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        await this.db.createTicket(ticketId, userId, guildId, reason, category);
        return ticketId;
    }

    async closeTicket(ticketId, closedBy, reason) {
        await this.db.closeTicket(ticketId, closedBy, reason);
    }

    async getTicket(ticketId) {
        return await this.db.getTicket(ticketId);
    }

    async getUserTickets(userId, guildId) {
        return await this.db.getUserTickets(userId, guildId);
    }

    async getActiveTickets(guildId) {
        return await this.db.getActiveTickets(guildId);
    }

    createTicketEmbed(ticket, user, guild) {
        const status = ticket.status === 'open' ? '🟢 Open' : '🔴 Closed';
        const createdAt = new Date(ticket.created_at).toLocaleString();
        
        const embed = new EmbedBuilder()
            .setTitle(`🎫 Ticket ${ticket.ticket_id}`)
            .setColor(ticket.status === 'open' ? '#00FF00' : '#FF0000')
            .setDescription(`**Category:** ${ticket.category}\n**Status:** ${status}`)
            .addFields(
                { name: '👤 Created By', value: `<@${ticket.user_id}>`, inline: true },
                { name: '📅 Created At', value: createdAt, inline: true },
                { name: '📝 Reason', value: ticket.reason || 'No reason provided', inline: false }
            )
            .setThumbnail(user.displayAvatarURL())
            .setFooter({ text: `💎 Gem Economy Bot • Ticket System` })
            .setTimestamp();

        if (ticket.status === 'closed') {
            embed.addFields(
                { name: '🔒 Closed By', value: `<@${ticket.closed_by}>`, inline: true },
                { name: '⏰ Closed At', value: new Date(ticket.closed_at).toLocaleString(), inline: true },
                { name: '📋 Close Reason', value: ticket.close_reason || 'No reason provided', inline: false }
            );
        }

        return embed;
    }

    createTicketControlButtons(ticketId) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_close_${ticketId}`)
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒'),
                new ButtonBuilder()
                    .setCustomId(`ticket_claim_${ticketId}`)
                    .setLabel('Claim Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✅')
            );

        return row;
    }

    createTicketPanelEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('🎫 **Support Ticket System**')
            .setColor('#0099FF')
            .setDescription('Click the button below to create a support ticket. Our staff will assist you as soon as possible!')
            .addFields(
                { 
                    name: '📋 **Available Categories**', 
                    value: '• 🔧 **General Support** - General questions and help\n• 💎 **Economy Issues** - Problems with gems/bank\n• 🎉 **Giveaway Issues** - Problems with giveaways\n• 🏆 **Rank Issues** - Problems with ranks/XP\n• 🐛 **Bug Reports** - Report bugs or issues\n• 💡 **Suggestions** - Feature suggestions and feedback', 
                    inline: false 
                }
            )
            .addFields(
                { 
                    name: '⚠️ **Important**', 
                    value: '• Please be descriptive in your ticket\n• One ticket per issue\n• Do not spam tickets\n• Staff will respond as soon as possible', 
                    inline: false 
                }
            )
            .setImage('https://i.imgur.com/9QaKxJt.png')
            .setFooter({ text: '💎 Gem Economy Bot • Click the button below to create a ticket' })
            .setTimestamp();

        return embed;
    }

    createTicketPanelButtons() {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket')
                    .setLabel('Create Ticket')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎫')
            );

        return row;
    }

    createTicketCategoryButtons() {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_category_general')
                    .setLabel('General Support')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔧'),
                new ButtonBuilder()
                    .setCustomId('ticket_category_economy')
                    .setLabel('Economy Issues')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('💎'),
                new ButtonBuilder()
                    .setCustomId('ticket_category_giveaway')
                    .setLabel('Giveaway Issues')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎉')
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_category_rank')
                    .setLabel('Rank Issues')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🏆'),
                new ButtonBuilder()
                    .setCustomId('ticket_category_bug')
                    .setLabel('Bug Reports')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🐛'),
                new ButtonBuilder()
                    .setCustomId('ticket_category_suggestion')
                    .setLabel('Suggestions')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('💡')
            );

        return [row1, row2];
    }

    async createTicketChannel(guild, user, ticketId, category, reason) {
        const categoryName = category.toLowerCase().replace(/\s+/g, '-');
        const channelName = `ticket-${ticketId.toLowerCase()}`;
        
        // Check if ticket channel already exists
        const existingChannel = guild.channels.cache.find(ch => 
            ch.name === channelName && ch.type === 0 // 0 = text channel
        );
        
        if (existingChannel) {
            return existingChannel;
        }

        // Create new channel
        const channel = await guild.channels.create({
            name: channelName,
            type: 0, // text channel
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                },
                {
                    id: this.client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageChannels
                    ]
                }
            ]
        });

        // Add staff permissions (you can customize this based on your server roles)
        const staffRole = guild.roles.cache.find(role => 
            role.name.toLowerCase().includes('staff') || 
            role.name.toLowerCase().includes('admin') ||
            role.name.toLowerCase().includes('moderator')
        );

        if (staffRole) {
            await channel.permissionOverwrites.create(staffRole.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
        }

        // Send initial message
        const embed = new EmbedBuilder()
            .setTitle(`🎫 Ticket ${ticketId} Created`)
            .setColor('#00FF00')
            .setDescription(`**Category:** ${category}\n**Created by:** ${user.toString()}\n**Reason:** ${reason || 'No reason provided'}`)
            .addFields(
                { name: '📝 **Next Steps**', value: '• Please describe your issue in detail\n• Staff will join shortly to assist you\n• Use the buttons below to manage this ticket', inline: false }
            )
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();

        const buttons = this.createTicketControlButtons(ticketId);
        await channel.send({ 
            content: `${user.toString()} Welcome to your support ticket!`,
            embeds: [embed], 
            components: [buttons] 
        });

        return channel;
    }
}

module.exports = TicketSystem;
