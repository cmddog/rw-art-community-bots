import {
    ChannelType,
    type ChatInputCommandInteraction,
    PermissionFlagsBits,
} from 'discord.js';
import { containerDisplay, verifyChannelSendPermission } from '../../utils.js';
import { db } from '../../db/client.js';
import { keyValue } from '../../db/schema.js';
import { verifyAdminOrOther } from './trigger-mod.js';
import { logger } from '../../logger.js';

export async function handleSetUpdateChannel(
    interaction: ChatInputCommandInteraction,
): Promise<unknown> {
    if (!verifyAdminOrOther(interaction, PermissionFlagsBits.ManageGuild))
        return;

    const channel = interaction.options.getChannel('channel', true, [
        ChannelType.GuildText,
    ]);

    if (!(await verifyChannelSendPermission(interaction, channel))) return;

    db.insert(keyValue)
        .values({
            key: 'triggerUpdateChannelId',
            value: channel.id,
        })
        .onConflictDoUpdate({
            target: keyValue.key,
            set: { value: channel.id },
        })
        .run();
    logger.info(
        `Trigger update channel set to ${channel.name} (${channel.id})`,
    );

    return interaction.reply(
        containerDisplay({
            text: `Trigger creation announcement channel set to ${channel}`,
            color: 'primary',
        }),
    );
}
