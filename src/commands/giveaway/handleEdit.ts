import {
    ButtonBuilder,
    ButtonStyle,
    type ChatInputCommandInteraction,
    MessageFlags,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    type RepliableInteraction,
    SectionBuilder,
} from 'discord.js';
import type { GiveawayInput } from '../../types.js';
import { db } from '../../db/client.js';
import { eq } from 'drizzle-orm';
import { giveaways, giveawayWinners, keyValue } from '../../db/schema.js';
import {
    buildContainer,
    buildTextDisplay,
    containerDisplay,
    daysToMillis,
    reply,
} from '../../utils.js';
import {
    fetchEntries,
    giveawayContainer,
    handleGiveawayModal,
    showModConfirmButtons,
} from '../../giveaways.utils.js';
import { logger } from '../../logger.js';

export async function handleEdit(
    interaction: ChatInputCommandInteraction,
): Promise<unknown> {
    const uuid = interaction.options.getString('id', true);
    const attachment = interaction.options.getAttachment('image');
    const input: GiveawayInput = {
        title: interaction.options.getString('title'),
        duration: interaction.options.getInteger('duration'),
        numberOfWinners: interaction.options.getInteger('number-of-winners'),
        description: interaction.options.getString('description'),
        attachments: attachment ? [attachment] : null,
    };

    const giveaway = db.query.giveaways
        .findFirst({
            where: eq(giveaways.uuid, uuid),
        })
        .sync();

    if (!giveaway) {
        return reply(
            interaction,
            containerDisplay({
                text: 'There is no giveaway with that ID',
                color: 'error',
            }),
        );
    }

    const isMod = interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageMessages,
    );

    if (giveaway.status !== 'pending' && !isMod) {
        return reply(
            interaction,
            containerDisplay({
                text: "Can't edit a giveaway that's already started. If you need to do so anyway, please ask a Moderator",
                color: 'error',
            }),
        );
    }

    let activeInteraction: RepliableInteraction = interaction;

    if (giveaway.creatorId !== interaction.user.id) {
        if (!isMod) {
            return reply(
                interaction,
                containerDisplay({
                    text: 'You can only edit your own giveaways',
                    color: 'error',
                }),
            );
        } else {
            const confirmInteraction = await showModConfirmButtons(
                interaction,
                'edit',
            );
            if (!confirmInteraction) return;
            else activeInteraction = confirmInteraction;
        }
    }

    const noEdits = (): boolean =>
        Object.values(input).every((value) => value == null);

    if (noEdits()) {
        const modalResult = await handleGiveawayModal(
            activeInteraction,
            input,
            uuid,
            true,
        );
        if (!modalResult || !(modalResult instanceof ModalSubmitInteraction))
            return;
        activeInteraction = modalResult;
    }

    if (noEdits()) {
        return reply(
            activeInteraction,
            containerDisplay({ text: 'No edits were made' }),
        );
    }

    if (
        input.attachments &&
        input.attachments.some((a) => !a.contentType?.startsWith('image/'))
    ) {
        return reply(
            activeInteraction,
            containerDisplay({
                text: `Only images are allowed as attachments`,
                color: 'error',
            }),
        );
    }

    const { attachments, ...fields } = input;

    const values: Partial<typeof giveaways.$inferInsert> = {
        ...fields,
        ...(fields.duration &&
            giveaway.status !== 'pending' && {
                endTime: giveaway.startTime! + daysToMillis(fields.duration),
            }),
        imageUrls: attachments
            ? JSON.stringify(attachments.map((a) => a.url))
            : null,
    };

    const updates = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value != null),
    ) as Partial<typeof values>;

    db.update(giveaways).set(updates).where(eq(giveaways.uuid, uuid)).run();

    const updatedGiveaway = db.query.giveaways
        .findFirst({
            where: eq(giveaways.uuid, uuid),
        })
        .sync();

    if (!updatedGiveaway) {
        logger.warn(
            `Updated giveaway ${uuid}, but failed to fetch it afterwards`,
        );
        return reply(
            activeInteraction,
            containerDisplay({
                text: 'Something went wrong while updating the giveaway. Tell Shiru to look at my logs',
                color: 'error',
            }),
        );
    }

    logger.info(
        `Fields {${Object.keys(updates)}} updated in giveaway '${updatedGiveaway.title}' (${uuid})${interaction.user.id !== giveaway.creatorId ? ` by ${interaction.user.username} (${interaction.user.id})` : ''}`,
    );

    const imageUrls = updatedGiveaway.imageUrls
        ? JSON.parse(updatedGiveaway.imageUrls)
        : null;

    if (updatedGiveaway.status !== 'pending') {
        const kv = db.query.keyValue
            .findFirst({ where: eq(keyValue.key, 'giveawayChannelId') })
            .sync();

        if (!kv) {
            return reply(
                activeInteraction,
                containerDisplay({
                    text: 'The database entry was edited, but the giveaway announcement was not, because the giveaway channel is not set',
                    color: 'error',
                }),
            );
        }

        await activeInteraction.deferReply();
        let message;
        try {
            const channel = await activeInteraction.guild?.channels.fetch(
                kv.value,
            );

            if (!channel || !channel.isTextBased()) {
                return activeInteraction.editReply(
                    containerDisplay({
                        text: "The database entry was edited, but the giveaway announcement was not, because the giveaway channel couldn't be found or doesn't support messages",
                        color: 'error',
                    }),
                );
            }

            const winners = db
                .select({ userId: giveawayWinners.userId })
                .from(giveawayWinners)
                .where(eq(giveawayWinners.giveawayId, giveaway.uuid))
                .all()
                .map((row) => row.userId);

            const outcome =
                updatedGiveaway.status === 'ending' ||
                updatedGiveaway.status === 'completed'
                    ? { ended: true as const, winners }
                    : { ended: false as const };

            message = await channel.messages.fetch(
                updatedGiveaway.announcementMessageId!,
            );
            await message.edit({
                components: [
                    giveawayContainer({
                        ...updatedGiveaway,
                        ...outcome,
                        started: true,
                        imageUrls,
                        entries: fetchEntries(updatedGiveaway.uuid),
                        endTime: updatedGiveaway.endTime!,
                    }),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (error) {
            logger.error('Failed to update giveaway announcement: ', error);

            return activeInteraction.editReply(
                containerDisplay({
                    text: 'The database entry was edited, but something went wrong while updating the giveaway announcement. Tell Shiru to look at my logs',
                    color: 'error',
                }),
            );
        }

        return activeInteraction.editReply({
            components: [
                buildContainer({ color: 'primary' }).addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            buildTextDisplay(
                                'Giveaway successfully updated and announcement message edited',
                            ),
                        )
                        .setButtonAccessory(
                            new ButtonBuilder()
                                .setStyle(ButtonStyle.Link)
                                .setLabel('Jump to announcement')
                                .setURL(message.url),
                        ),
                ),
            ],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    return reply(activeInteraction, {
        components: [
            buildContainer({
                text: '## Giveaway successfully updated:',
                color: 'primary',
            }),
            giveawayContainer({
                ...updatedGiveaway,
                started: false,
                ended: false,
                imageUrls,
            }),
        ],
        flags: MessageFlags.IsComponentsV2,
    });
}
