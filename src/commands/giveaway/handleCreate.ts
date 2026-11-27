import {
    type ChatInputCommandInteraction,
    MessageFlags,
    ModalSubmitInteraction,
} from 'discord.js';
import { randomUUIDv7 } from 'node:crypto';
import { db } from '../../db/client.js';
import { giveaways } from '../../db/schema.js';
import { buildContainer, containerDisplay } from '../../utils.js';
import type { GiveawayInput } from '../../types.js';
import {
    giveawayContainer,
    handleGiveawayModal,
} from '../../giveaways.utils.js';

export async function handleCreate(
    interaction: ChatInputCommandInteraction,
): Promise<unknown> {
    const attachment = interaction.options.getAttachment('image');
    const input: GiveawayInput = {
        title: interaction.options.getString('title'),
        duration: interaction.options.getInteger('duration'),
        numberOfWinners: interaction.options.getInteger('number-of-winners'),
        description: interaction.options.getString('description'),
        attachments: attachment ? [attachment] : null,
    };

    const creatorId = interaction.user.id;
    const uuid = randomUUIDv7();
    let replyInteraction: ChatInputCommandInteraction | ModalSubmitInteraction =
        interaction;

    if (input.title && input.duration && input.numberOfWinners) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } else {
        const modalResult = await handleGiveawayModal(interaction, input, uuid);
        if (!modalResult || !(modalResult instanceof ModalSubmitInteraction))
            return;
        replyInteraction = modalResult;
        await replyInteraction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    if (
        input.attachments &&
        input.attachments.some((a) => !a.contentType?.startsWith('image/'))
    ) {
        return replyInteraction.editReply(
            containerDisplay({
                text: `**Only images are allowed as attachments.**\nIf you'd like to copy them, here are the title and description you entered:\n> ## ${input.title}\n> ${input.description ?? '[ no description ]'}`,
                color: 'error',
            }),
        );
    }

    const attachmentURLs = input.attachments?.map((a) => a.url) ?? null;

    await db.insert(giveaways).values({
        uuid,
        title: input.title,
        duration: input.duration,
        numberOfWinners: input.numberOfWinners,
        description: input.description,
        imageUrls: attachmentURLs?.join('\n'),
        creatorId,
        creationTime: Date.now(),
    });

    const giveaway = giveawayContainer({
        title: input.title,
        description: input.description ?? null,
        imageUrls: attachmentURLs,
        creatorId,
        numberOfWinners: input.numberOfWinners,
        uuid,
        started: false,
        ended: false,
        duration: input.duration,
    });

    return replyInteraction.editReply({
        components: [
            buildContainer({
                text: '# Giveaway Successfully Created',
                color: 'primary',
            }),
            giveaway,
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    });
}
