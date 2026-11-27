import { type ChatInputCommandInteraction } from 'discord.js';
import { db } from '../../db/client.js';
import { triggers } from '../../db/schema.js';
import {
    buildContainer,
    buildTextDisplay,
    containerDisplay,
    fireAndForget,
    reply,
} from '../../utils.js';
import { isValidName, nameEquals, sendUpdate } from '../trigger/trigger.js';
import { logger } from '../../logger.js';

export async function handleEdit(
    interaction: ChatInputCommandInteraction,
): Promise<unknown> {
    const currName = interaction.options.getString('current-name', true);
    const newName = interaction.options.getString('new-name');
    const newDescription = interaction.options.getString('new-description');
    const withAnnouncement =
        interaction.options.getBoolean('with-announcement');

    if (!newName && !newDescription) {
        return reply(
            interaction,
            containerDisplay({
                text: 'You need to edit at least one of the properties',
                color: 'error',
            }),
        );
    }

    const trigger = db.query.triggers
        .findFirst({
            where: nameEquals(triggers.name, currName),
        })
        .sync();

    if (!trigger) {
        return reply(
            interaction,
            containerDisplay({
                text: `There is no trigger called **${currName}**`,
                color: 'error',
            }),
        );
    }

    if (newDescription) {
        db.update(triggers)
            .set({ description: newDescription })
            .where(nameEquals(triggers.name, currName))
            .run();
        logger.info(
            `${interaction.user.username} (${interaction.user.id}) changed the description of the trigger '${trigger.name}' from '${trigger.description}' to '${newDescription}'`,
        );
    }

    if (newName) {
        const existing = db.query.triggers
            .findFirst({
                where: nameEquals(triggers.name, newName),
            })
            .sync();
        if (existing && trigger.name !== existing.name) {
            return reply(
                interaction,
                containerDisplay({
                    text: `There is already a trigger called **${existing.name}**. Did you mean to use \`/trigger merge\`?`,
                }),
            );
        }

        if (!isValidName(newName)) {
            return reply(
                interaction,
                containerDisplay({
                    text: 'Name must only include letters and spaces',
                    color: 'error',
                }),
            );
        }

        db.update(triggers)
            .set({ name: newName })
            .where(nameEquals(triggers.name, currName))
            .run();
        logger.info(
            `${interaction.user.username} (${interaction.user.id}) changed the name of the trigger '${trigger.name}' to '${newName}'`,
        );
    }

    if (newName && newDescription) {
        if (withAnnouncement) {
            fireAndForget(
                sendUpdate(
                    `### Trigger changed\nRenamed from **${trigger.name}** to **${newName}**\n\nDescription changed from:\n> ${trigger.description}\nTo:\n> ${newDescription}`,
                    interaction.guild!,
                ),
            );
        }

        return interaction.reply({
            components: [
                buildContainer({
                    text: `### Description and name of trigger **${trigger.name}** successfully changed\nRenamed from **${trigger.name}** to **${newName}**`,
                    color: 'primary',
                }).addTextDisplayComponents(
                    buildTextDisplay(
                        `Description changed from:\n> ${trigger.description}`,
                    ),
                    buildTextDisplay(`To:\n> ${newDescription}`),
                ),
            ],
        });
    } else if (newName) {
        if (withAnnouncement)
            fireAndForget(
                sendUpdate(
                    `Name of trigger **${trigger.name}** changed to **${newName}**`,
                    interaction.guild!,
                ),
            );

        return interaction.reply(
            containerDisplay({
                text: `Name of trigger successfully changed from **${trigger.name}** to **${newName}**`,
                color: 'primary',
            }),
        );
    } else {
        if (withAnnouncement)
            fireAndForget(
                sendUpdate(
                    `### Description of trigger *${trigger.name}* changed\nBefore:\n> ${trigger.description}\nAfter:\n> ${newDescription}`,
                    interaction.guild!,
                ),
            );

        return interaction.reply({
            components: [
                buildContainer({
                    text: `### Description of trigger **${trigger.name}** successfully changed`,
                    color: 'primary',
                }).addTextDisplayComponents(
                    buildTextDisplay(`Before:\n> ${trigger.description}`),
                    buildTextDisplay(`After:\n> ${newDescription}`),
                ),
            ],
        });
    }
}
