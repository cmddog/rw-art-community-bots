import { type ChatInputCommandInteraction, SeparatorBuilder } from 'discord.js';
import { db } from '../../db/client.js';
import { and, eq } from 'drizzle-orm';
import { triggers, triggerSubscribers } from '../../db/schema.js';
import {
    buildContainer,
    buildTextDisplay,
    containerDisplay,
    fireAndForget,
    reply,
    serverLog,
} from '../../utils.js';
import { nameEquals, sendUpdate } from './trigger.js';
import { logger } from '../../logger.js';

export async function handleUnsubscribe(
    interaction: ChatInputCommandInteraction,
): Promise<unknown> {
    const name = interaction.options.getString('name', true);

    const trigger = db.query.triggers
        .findFirst({
            where: nameEquals(triggers.name, name),
        })
        .sync();
    if (!trigger) {
        return interaction.editReply(
            containerDisplay({
                text: `There is no trigger called **${name}**`,
                color: 'error',
            }),
        );
    }

    const deleted = db
        .delete(triggerSubscribers)
        .where(
            and(
                nameEquals(triggerSubscribers.triggerName, trigger.name),
                eq(triggerSubscribers.userId, interaction.user.id),
            ),
        )
        .run();

    if (deleted.changes === 0) {
        return interaction.editReply(
            containerDisplay({
                text: `You aren't subscribed to **${trigger.name}**`,
            }),
        );
    }

    const remaining = await db.query.triggerSubscribers.findFirst({
        where: nameEquals(triggerSubscribers.triggerName, trigger.name),
    });

    if (!remaining) {
        db.delete(triggers)
            .where(nameEquals(triggers.name, trigger.name))
            .run();

        logger.info(
            `The trigger '${trigger.name}' lost its last subscriber and was deleted`,
        );

        fireAndForget(
            serverLog(interaction.guild!, [
                buildContainer({ text: '## Trigger Deleted' })
                    .addTextDisplayComponents(
                        buildTextDisplay(
                            'This trigger lost its last subscriber and was deleted:',
                        ),
                    )
                    .addSeparatorComponents(new SeparatorBuilder())
                    .addTextDisplayComponents(
                        buildTextDisplay(`**${trigger.name}**`),
                        buildTextDisplay(`${trigger.description}`),
                    ),
            ]),
        );

        fireAndForget(
            sendUpdate(
                `### Removed\n**${trigger.name}**\n${trigger.description}`,
                interaction.guild!,
                'error',
            ),
        );

        return reply(
            interaction,
            containerDisplay({
                text: `Successfully unsubscribed from **${trigger.name}**. You were the last subscriber and the trigger has been deleted`,
                color: 'primary',
            }),
        );
    } else {
        return reply(
            interaction,
            containerDisplay({
                text: `Successfully unsubscribed from **${trigger.name}**`,
                color: 'primary',
            }),
        );
    }
}
