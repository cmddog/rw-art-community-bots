import { Events, type GuildMember, SeparatorBuilder } from 'discord.js';
import { db } from '../db/client.js';
import { triggers, triggerSubscribers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
    buildContainer,
    buildTextDisplay,
    fireAndForget,
    serverLog,
} from '../utils.js';
import { sendUpdate } from '../commands/trigger/trigger.js';
import { logger } from '../logger.js';

export const requiredIntents = ['GuildMembers'];
export const name = Events.GuildMemberRemove;

export async function execute(member: GuildMember) {
    const memberSubs = db.query.triggerSubscribers
        .findMany({
            where: eq(triggerSubscribers.userId, member.id),
        })
        .sync();

    db.delete(triggerSubscribers)
        .where(eq(triggerSubscribers.userId, member.id))
        .run();

    for (const sub of memberSubs) {
        const remaining = db.query.triggerSubscribers
            .findFirst({
                where: eq(triggerSubscribers.triggerName, sub.triggerName),
            })
            .sync();
        if (remaining) continue;

        const trigger = db.query.triggers
            .findFirst({
                where: eq(triggers.name, sub.triggerName),
            })
            .sync();
        if (!trigger) continue;

        db.delete(triggers).where(eq(triggers.name, trigger.name)).run();

        fireAndForget(
            sendUpdate(
                `### Removed\n**${trigger.name}**\n${trigger.description}`,
                member.guild,
                'error',
            ),
        );

        logger.info(
            `Removed trigger '${trigger.name} due to ${member.id} leaving`,
        );

        fireAndForget(
            serverLog(member.guild, [
                buildContainer({ text: '### Trigger Deleted' })
                    .addTextDisplayComponents(
                        buildTextDisplay(
                            'The last subscriber of this trigger left the server and it was deleted:',
                        ),
                    )
                    .addSeparatorComponents(new SeparatorBuilder())
                    .addTextDisplayComponents(
                        buildTextDisplay(`**${trigger.name}**`),
                        buildTextDisplay(`${trigger.description}`),
                    ),
            ]),
        );
    }
}
