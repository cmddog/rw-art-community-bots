import {
    ButtonBuilder,
    ButtonStyle,
    type ChatInputCommandInteraction,
    MessageFlags,
    ModalSubmitInteraction,
    PermissionFlagsBits,
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
    showModConfirmModal,
} from '../../giveaways.utils.js';

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

    if (!giveaway)
        return interaction.reply(
            containerDisplay(
                {
                    text: 'There is no giveaway with that ID',
                    color: 'error',
                },
                MessageFlags.Ephemeral,
            ),
        );

    const isMod = interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageMessages,
    );

    if (giveaway.status !== 'pending' && !isMod)
        return interaction.reply(
            containerDisplay({
                text: "Can't edit a giveaway that's already started. If you need to do so anyway, please ask a Moderator",
                color: 'error',
            }),
        );

    let replyInteraction: ChatInputCommandInteraction | ModalSubmitInteraction =
        interaction;

    if (giveaway.creatorId !== interaction.user.id) {
        if (!isMod) {
            return interaction.reply(
                containerDisplay({
                    text: 'You can only edit your own giveaways',
                    color: 'error',
                }),
            );
        } else {
            const confirmInteraction = await showModConfirmModal(
                interaction,
                'edit',
            );
            if (!confirmInteraction) return;
            else replyInteraction = confirmInteraction;
        }
    }

    const noEdits = (): boolean =>
        Object.values(input).every((value) => value == null);

    if (noEdits()) {
        const modalResult = await handleGiveawayModal(
            interaction,
            input,
            uuid,
            true,
        );
        if (!modalResult || !(modalResult instanceof ModalSubmitInteraction))
            return;
        replyInteraction = modalResult;
    }

    if (noEdits())
        return reply(
            replyInteraction,
            containerDisplay({ text: 'No edits were made' }),
        );

    if (
        input.attachments &&
        input.attachments.some((a) => !a.contentType?.startsWith('image/'))
    ) {
        return replyInteraction.reply(
            containerDisplay(
                {
                    text: `Only images are allowed as attachments`,
                    color: 'error',
                },
                MessageFlags.Ephemeral,
            ),
        );
    }

    const { attachments, ...fields } = input;

    const values = {
        ...fields,
        ...(fields.duration &&
            giveaway.status !== 'pending' && {
                endTime: giveaway.startTime! + daysToMillis(fields.duration),
            }),
        imageUrls: attachments ? attachments.map((a) => a.url) : null,
    };

    const updates = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value != null),
    ) as Partial<typeof values>;

    db.update(giveaways).set(updates).where(eq(giveaways.uuid, uuid)).run();

    const updatedGiveaway: typeof giveaways.$inferSelect = db.query.giveaways
        .findFirst({
            where: eq(giveaways.uuid, uuid),
        })
        .sync()!;
    const imageUrls = updatedGiveaway.imageUrls?.split('\n') ?? null;

    if (updatedGiveaway.status !== 'pending') {
        const kv = db.query.keyValue
            .findFirst({ where: eq(keyValue.key, 'giveawayChannelId') })
            .sync();
        if (!kv)
            return reply(
                replyInteraction,
                containerDisplay({
                    text: 'The database entry was edited, but the giveaway announcement remains untouched, because the giveaway channel is not set',
                    color: 'error',
                }),
            );
        await replyInteraction.deferReply();
        let message;
        try {
            const channel = await replyInteraction.guild?.channels.fetch(
                kv.value,
            );
            if (!channel || !channel.isTextBased())
                return replyInteraction.editReply(
                    containerDisplay({
                        text: "The database entry was edited, but the giveaway announcement remains untouched, because the giveaway channel couldn't be found or doesn't support messages",
                        color: 'error',
                    }),
                );
            const winners = db
                .select({ userId: giveawayWinners.userId })
                .from(giveawayWinners)
                .where(eq(giveawayWinners.giveawayId, giveaway.uuid))
                .all()
                .map((row) => row.userId);

            const outcome =
                updatedGiveaway.status === 'ending' ||
                updatedGiveaway.status === 'complete'
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
            console.error('Failed to update giveaway announcement: ', error);

            return replyInteraction.editReply(
                containerDisplay({
                    text: 'The database entry was edited, but the giveaway announcement could not be updated',
                    color: 'error',
                }),
            );
        }

        return replyInteraction.editReply({
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

    return reply(replyInteraction, {
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
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
}
