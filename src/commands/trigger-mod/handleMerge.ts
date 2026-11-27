import { type ChatInputCommandInteraction } from 'discord.js';
import { containerDisplay, fireAndForget, reply } from '../../utils.js';
import { db } from '../../db/client.js';
import { and, notInArray } from 'drizzle-orm';
import { triggers, triggerSubscribers } from '../../db/schema.js';
import { nameEquals, sendUpdate } from '../trigger/trigger.js';
import { logger } from '../../logger.js';

export async function handleMerge(
    interaction: ChatInputCommandInteraction,
): Promise<unknown> {
    const sourceName = interaction.options.getString('source-name', true);
    const targetName = interaction.options.getString('target-name', true);

    if (sourceName.toLowerCase() === targetName.toLowerCase())
        return reply(
            interaction,
            containerDisplay({
                text: 'Source and target cannot be the same',
                color: 'error',
            }),
        );

    const source = db.query.triggers
        .findFirst({
            where: nameEquals(triggers.name, sourceName),
        })
        .sync();

    if (!source) {
        return reply(
            interaction,
            containerDisplay({
                text: `There is no trigger called **${sourceName}**`,
                color: 'error',
            }),
        );
    }

    const target = db.query.triggers
        .findFirst({
            where: nameEquals(triggers.name, targetName),
        })
        .sync();

    if (!target) {
        return reply(
            interaction,
            containerDisplay({
                text: `There is no trigger called **${targetName}**`,
                color: 'error',
            }),
        );
    }

    const targetSubs = db.query.triggerSubscribers
        .findMany({
            where: nameEquals(triggerSubscribers.triggerName, target.name),
        })
        .sync();
    const targetUserIds = targetSubs.map((s) => s.userId);

    db.update(triggerSubscribers)
        .set({ triggerName: target.name })
        .where(
            and(
                nameEquals(triggerSubscribers.triggerName, source.name),
                targetUserIds.length > 0
                    ? notInArray(triggerSubscribers.userId, targetUserIds)
                    : undefined,
            ),
        )
        .run();
    db.delete(triggers).where(nameEquals(triggers.name, source.name)).run();
    logger.info(
        `${interaction.user.username} (${interaction.user.id}) Merged the trigger '${sourceName}' into '${targetName}'`,
    );

    fireAndForget(
        sendUpdate(
            `### Triggers merged\nTransferred subscribers from **${source.name}** to **${target.name}** and deleted **${source.name}**`,
            interaction.guild!,
        ),
    );

    return interaction.reply(
        containerDisplay({
            text: `Transferred unique subscribers to **${target.name}** and deleted **${source.name}**`,
            color: 'primary',
        }),
    );
}
