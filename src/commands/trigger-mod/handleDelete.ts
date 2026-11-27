import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type ChatInputCommandInteraction,
    ComponentType,
    MessageFlags,
} from 'discord.js';
import { db } from '../../db/client.js';
import { count } from 'drizzle-orm';
import { triggers, triggerSubscribers } from '../../db/schema.js';
import {
    buildContainer,
    containerDisplay,
    fireAndForget,
    reply,
} from '../../utils.js';
import type { PartialMessageOptions } from '../../types.js';
import { nameEquals, sendUpdate } from '../trigger/trigger.js';
import { verifyAdminOrOther } from './trigger-mod.js';
import { logger } from '../../logger.js';

export async function handleDelete(
    interaction: ChatInputCommandInteraction,
): Promise<unknown> {
    if (!verifyAdminOrOther(interaction)) return;

    const name = interaction.options.getString('name', true);
    const trigger = db.query.triggers
        .findFirst({
            where: nameEquals(triggers.name, name),
        })
        .sync();

    if (!trigger) {
        return reply(
            interaction,
            containerDisplay({
                text: `There is no trigger called **${name}**`,
                color: 'error',
            }),
        );
    }

    const [countRow] = db
        .select({ value: count() })
        .from(triggerSubscribers)
        .where(nameEquals(triggerSubscribers.triggerName, name))
        .all();
    const subscriberCount = countRow?.value ?? 0;
    const buildConfirmationReply: (
        confirmed: boolean,
    ) => PartialMessageOptions = (confirmed: boolean) => ({
        components: [
            buildContainer({
                text: `Are you sure you want to delete the trigger **${name}**? It currently has ${subscriberCount} ${subscriberCount === 1 ? 'subscriber' : 'subscribers'}.`,
                color: 'error',
            }).addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().setComponents(
                    new ButtonBuilder()
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setCustomId('cancel')
                        .setDisabled(confirmed),
                    new ButtonBuilder()
                        .setLabel(confirmed ? 'Confirmed' : 'Confirm')
                        .setStyle(ButtonStyle.Danger)
                        .setCustomId('confirm')
                        .setDisabled(confirmed),
                ),
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
    });
    const message = await interaction.reply(buildConfirmationReply(false));

    const collector = message.createMessageComponentCollector({
        time: 60_000,
        componentType: ComponentType.Button,
    });
    let handled = false;

    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            return reply(
                i,
                containerDisplay({ text: 'Not your dialog', color: 'error' }),
            );
        }

        handled = true;
        if (i.customId === 'confirm') {
            await i.update(buildConfirmationReply(true));
            const trigger = await db.query.triggers.findFirst({
                where: nameEquals(triggers.name, name),
            });

            if (!trigger) {
                collector.stop();
                return reply(
                    interaction,
                    containerDisplay({
                        text: `The trigger **${name}** no longer exists`,
                        color: 'error',
                    }),
                );
            }

            await db.delete(triggers).where(nameEquals(triggers.name, name));
            logger.info(
                `${interaction.user.username} (${interaction.user.id}) deleted trigger '${trigger.name}'`,
            );
            await i.followUp(
                containerDisplay({
                    text: `Successfully deleted trigger **${trigger.name}**`,
                    color: 'primary',
                }),
            );

            fireAndForget(
                sendUpdate(
                    `### Removed\n**${trigger.name}**\n${trigger.description}`,
                    interaction.guild!,
                    'error',
                ),
            );
        } else {
            await i.update(
                containerDisplay({ text: 'Interaction cancelled by user' }),
            );
        }
        return collector.stop();
    });

    collector.on('end', () => {
        if (!handled) {
            fireAndForget(
                reply(
                    interaction,
                    containerDisplay({ text: 'Interaction timed out' }),
                ),
            );
        }
    });
    return;
}
