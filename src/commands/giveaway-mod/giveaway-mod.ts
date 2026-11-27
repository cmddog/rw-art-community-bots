import {
    ChannelType,
    type ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import { containerDisplay, verifyChannelSendPermission } from '../../utils.js';
import { db } from '../../db/client.js';
import { giveawayPingRoles, keyValue } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../logger.js';

export const data = new SlashCommandBuilder()
    .setName('giveaway-mod')
    .setDescription('Moderator only commands for giveaways')
    .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageChannels |
            PermissionFlagsBits.ManageRoles |
            PermissionFlagsBits.ManageGuild,
    )
    .addSubcommand((s) =>
        s
            .setName('set-giveaway-channel')
            .setDescription('Set the channel where giveaways are sent')
            .addChannelOption((o) =>
                o
                    .setName('channel')
                    .setDescription('The channel')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true),
            ),
    )
    .addSubcommand((s) =>
        s
            .setName('toggle-giveaway-role')
            .setDescription('Determine the roles people can ping for giveaways')
            .addRoleOption((o) =>
                o
                    .setName('role')
                    .setDescription(
                        'The role to add to or removed from the list',
                    )
                    .setRequired(true),
            ),
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommand(true)) {
        case 'set-giveaway-channel':
            return setGiveawayChannel(interaction);
        case 'toggle-giveaway-role':
            return toggleGiveawayRole(interaction);
        default: {
            console.error(
                `giveaway-mod ran with unknown subcommand: `,
                interaction.options.getSubcommand(),
            );
            return interaction.reply(
                containerDisplay(
                    { text: 'Unknown subcommand', color: 'error' },
                    MessageFlags.Ephemeral,
                ),
            );
        }
    }
}

async function setGiveawayChannel(interaction: ChatInputCommandInteraction) {
    const channel = interaction.options.getChannel('channel', true, [
        ChannelType.GuildText,
    ]);

    if (!(await verifyChannelSendPermission(interaction, channel))) return;

    db.insert(keyValue)
        .values({ key: 'giveawayChannelId', value: channel.id })
        .onConflictDoUpdate({
            target: keyValue.key,
            set: { value: channel.id },
        })
        .run();

    logger.info(`Giveaway channel set to ${channel.id}`);

    return interaction.reply(
        containerDisplay({
            text: `Giveaways will now be sent to ${channel}`,
            color: 'primary',
        }),
    );
}

async function toggleGiveawayRole(interaction: ChatInputCommandInteraction) {
    const role = interaction.options.getRole('role', true);

    const added = db.transaction((tx) => {
        const deleted = tx
            .delete(giveawayPingRoles)
            .where(eq(giveawayPingRoles.roleId, role.id))
            .returning({ roleId: giveawayPingRoles.roleId })
            .all();

        if (deleted.length > 0) return false;

        tx.insert(giveawayPingRoles).values({ roleId: role.id }).run();
        return true;
    });

    logger.info(
        `Giveaway ping role ${role.name} (${role.id}) ${added ? 'added' : 'removed'}`,
    );

    return interaction.reply(
        containerDisplay({
            text: added
                ? `${role} can now be pinged for giveaways`
                : `${role} can no longer be pinged for giveaways`,
            color: 'primary',
        }),
    );
}
