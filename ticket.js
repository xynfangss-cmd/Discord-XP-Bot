const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

class TicketSystem {
    constructor(database, client) {
        this.db = database;
        this.client = client;
    }

    async createTicket(userId, guildId, reason, category = 'General') {
        const ticketId = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        await this.db.createTicket(ticketId, userId, guildId, reason, category);
        return ticketId;
    }

    async closeTicket(ticketId, closedBy, reason = 'Closed by staff') {
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

    async createTicketChannel(guild, user, ticketId, category, reason) {
        const ticketChannel = await guild.channels.create({
            name: `ticket-${ticketId.toLowerCase()}`,
            type: 0, // Text channel
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: ['ViewChannel']
                },
                {
                    id: user.id,
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                }
            ]
        });

        // Add staff permissions
        const staffRoles = guild.roles.cache.filter(role => 
            role.name.toLowerCase().includes('staff') ||
            role.name.toLowerCase().includes('admin') ||
            role.name.toLowerCase().includes('moderator') ||
            role.permissions.has('Administrator') ||
            role.permissions.has('ManageGuild')
        );

        for (const role of staffRoles) {
            await ticketChannel.permissionOverwrites.create(role.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
        }

        // Send ticket creation message
        const embed = new EmbedBuilder()
            .setTitle('🎫 New Ticket Created')
            .setColor('#00FF00')
            .setDescription(`**Ticket ID:** ${ticketId}\n**Category:** ${category}\n**Reason:** ${reason}`)
            .addFields(
                { name: '👤 Created By', value: `${user.toString()} (${user.tag})`, inline: true },
                { name: '📅 Created At', value: new Date().toLocaleString(), inline: true }
            )
            .setThumbnail(user.displayAvatarURL())
            .setFooter({ text: '💎 Gem Economy Bot • Support System' })
            .setTimestamp();

        const closeButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`close_ticket_${ticketId}`)
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        await ticketChannel.send({ 
            content: `Hello ${user.toString()}! Staff will be with you shortly.`,
            embeds: [embed], 
            components: [closeButton] 
        });

        return ticketChannel;
    }

    createTicketPanelEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('🎫 Support Ticket System')
            .setColor('#0099FF')
            .setDescription('Need help? Create a support ticket and our staff will assist you!')
            .addFields(
                { name: '📋 **How to Create a Ticket**', value: '1. Click the "Create Ticket" button below\n2. Select a category for your issue\n3. Provide a brief description\n4. Wait for staff to respond', inline: false }
            )
            .addFields(
                { name: '🏷️ **Available Categories**', value: '• General Support\n• Economy Issues\n• Giveaway Issues\n• Bug Reports\n• Suggestions\n• Other', inline: false }
            )
            .setFooter({ text: '💎 Gem Economy Bot • Click the button below to create a ticket' })
            .setTimestamp();

        return embed;
    }

    createTicketPanelButtons() {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket_panel')
                    .setLabel('Create Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎫')
            );

        return [row];
    }

    createTicketSelectMenu() {
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_category_select')
                    .setPlaceholder('Select a category for your ticket')
                    .addOptions([
                        {
                            label: 'General Support',
                            description: 'General questions and help',
                            value: 'General Support',
                            emoji: '❓'
                        },
                        {
                            label: 'Economy Issues',
                            description: 'Problems with gems, bank, or transactions',
                            value: 'Economy Issues',
                            emoji: '💰'
                        },
                        {
                            label: 'Giveaway Issues',
                            description: 'Problems with giveaways or prizes',
                            value: 'Giveaway Issues',
                            emoji: '🎁'
                        },
                        {
                            label: 'Bug Reports',
                            description: 'Report bugs or glitches',
                            value: 'Bug Reports',
                            emoji: '🐛'
                        },
                        {
                            label: 'Suggestions',
                            description: 'Suggest improvements or new features',
                            value: 'Suggestions',
                            emoji: '💡'
                        },
                        {
                            label: 'Other',
                            description: 'Other issues not listed above',
                            value: 'Other',
                            emoji: '📝'
                        }
                    ])
            );

        return [row];
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
                { name: '📅 Closed At', value: new Date(ticket.closed_at).toLocaleString(), inline: true },
                { name: '📝 Close Reason', value: ticket.close_reason || 'No reason provided', inline: false }
            );
        }

        if (ticket.channel_id) {
            const channel = guild.channels.cache.get(ticket.channel_id);
            if (channel) {
                embed.addFields(
                    { name: '💬 Channel', value: `${channel.toString()}`, inline: false }
                );
            }
        }

        return embed;
    }

    createTicketListEmbed(tickets, guild) {
        const embed = new EmbedBuilder()
            .setTitle('🎫 Active Tickets')
            .setColor('#0099FF')
            .setDescription(`There are **${tickets.length}** active tickets in this server.`)
            .setFooter({ text: '💎 Gem Economy Bot • Ticket System' })
            .setTimestamp();

        if (tickets.length === 0) {
            embed.addFields(
                { name: '✅ No Active Tickets', value: 'There are currently no active tickets.', inline: false }
            );
            return embed;
        }

        // Group tickets by status
        const openTickets = tickets.filter(t => t.status === 'open');
        const closedTickets = tickets.filter(t => t.status === 'closed');

        if (openTickets.length > 0) {
            const openList = openTickets.map(ticket => {
                const user = guild.members.cache.get(ticket.user_id);
                const userName = user ? user.user.tag : `User ${ticket.user_id}`;
                return `**${ticket.ticket_id}** - ${userName} (${ticket.category})`;
            }).join('\n');

            embed.addFields(
                { name: `🟢 Open Tickets (${openTickets.length})`, value: openList, inline: false }
            );
        }

        if (closedTickets.length > 0) {
            const closedList = closedTickets.slice(0, 10).map(ticket => {
                const user = guild.members.cache.get(ticket.user_id);
                const userName = user ? user.user.tag : `User ${ticket.user_id}`;
                return `**${ticket.ticket_id}** - ${userName} (${ticket.category})`;
            }).join('\n');

            embed.addFields(
                { name: `🔴 Recently Closed (${Math.min(closedTickets.length, 10)})`, value: closedList, inline: false }
            );
        }

        return embed;
    }

    async createTicketModal(category) {
        const { ModalBuilder, TextInputBuilder, ActionRowBuilder } = require('discord.js');
        
        return new ModalBuilder()
            .setCustomId(`ticket_modal_${category}`)
            .setTitle(`Create ${category} Ticket`)
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('ticket_reason')
                        .setLabel('Please describe your issue')
                        .setStyle(2) // Paragraph
                        .setPlaceholder('Provide as much detail as possible...')
                        .setRequired(true)
                        .setMaxLength(1000)
                )
            );
    }
}

module.exports = TicketSystem;
