import type {
    GiveawayInput,
    GiveawayMessageData,
    PartialMessageOptions,
} from './types.js';
import {
    ActionRowBuilder,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    type ChatInputCommandInteraction,
    ComponentType,
    ContainerBuilder,
    FileUploadBuilder,
    LabelBuilder,
    MediaGalleryBuilder,
    type MediaGalleryItemBuilder,
    MessageFlags,
    ModalBuilder,
    type ModalSubmitInteraction,
    type RepliableInteraction,
    SectionBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import {
    ACCENT_COLORS,
    buildTextDisplay,
    containerDisplay,
    fireAndForget,
} from './utils.js';
import { db } from './db/client.js';
import { giveawayParticipants } from './db/schema.js';
import { count, eq } from 'drizzle-orm';

export function giveawayContainer(data: GiveawayMessageData): ContainerBuilder {
    const container = new ContainerBuilder();

    if (data.ended) container.setAccentColor(ACCENT_COLORS.error);
    else container.setAccentColor(0xce8100);

    const title =
        data.started && data.pingRoleId && !data.ended
            ? `## <@&${data.pingRoleId}> ✦ ${data.title}`
            : `## Giveaway${data.ended ? ' Ended' : ''} ✦ ${data.title}`;
    if (data.started)
        container.addTextDisplayComponents(buildTextDisplay(title));
    else
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(buildTextDisplay(title))
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(`giveaway:${data.uuid}:start`)
                        .setLabel('Start')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji({ name: '📢' }),
                ),
        );

    if (data.description)
        container.addTextDisplayComponents(buildTextDisplay(data.description));

    if (data.imageUrls && data.imageUrls.length > 0)
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                data.imageUrls.map(
                    (url) => (item: MediaGalleryItemBuilder) =>
                        item.setURL(url),
                ),
            ),
        );

    container.addTextDisplayComponents(
        buildTextDisplay(
            `**Host**: <@${data.creatorId}> ⸺ Up to **${data.numberOfWinners}** winner${data.numberOfWinners > 1 ? 's' : ''} ⸺ ${data.ended ? `Ended <t:${Math.floor(data.endTime / 1000)}:R>` : data.started ? `Ends <t:${Math.floor(data.endTime / 1000)}:R>` : `**Duration**: ${data.duration} day${data.duration > 1 ? 's' : ''}`}`,
        ),
    );

    if (data.started)
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().setComponents(
                ...(data.ended
                    ? []
                    : [
                          new ButtonBuilder()
                              .setCustomId(`giveaway:${data.uuid}:enter`)
                              .setEmoji({ name: '🎁' })
                              .setStyle(ButtonStyle.Primary)
                              .setLabel('Enter'),
                      ]),
                new ButtonBuilder()
                    .setCustomId(`giveaway:${data.uuid}:entries`)
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel(`Entries: ${data.entries}`)
                    .setDisabled(),
            ),
        );

    if (data.ended)
        container
            .addSeparatorComponents()
            .addTextDisplayComponents(
                buildTextDisplay(
                    `**Winners: ${data.winners.map((id) => `<@${id}>`).join(' ')}**`,
                ),
            );

    container.addTextDisplayComponents(
        buildTextDisplay(`-# *UUID: ${data.uuid}*`),
    );

    return container;
}

export async function handleGiveawayModal(
    interaction: Exclude<RepliableInteraction, ModalSubmitInteraction>,
    input: GiveawayInput,
    uuid: string,
    allOptional: boolean = false,
) {
    const modalId = `giveaway-modal:${uuid}`;

    await interaction.showModal(
        new ModalBuilder()
            .setCustomId(modalId)
            .setTitle('Create Giveaway')
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel('Title')
                    .setDescription(
                        'Displayed in the header of the message, up to 20 characters',
                    )
                    .setTextInputComponent(
                        new TextInputBuilder()
                            .setCustomId('title')
                            .setMinLength(1)
                            .setMaxLength(20)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Free Nitro')
                            .setRequired(!allOptional),
                    ),
            )
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel('Duration')
                    .setDescription(
                        'How long people will be able to enter the giveaway before it concludes',
                    )
                    .setStringSelectMenuComponent(
                        new StringSelectMenuBuilder()
                            .setCustomId('duration')
                            .setPlaceholder('1-3 days')
                            .setOptions(
                                ...[...Array(3).keys()].map((i) =>
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel(
                                            `${i + 1} day${i > 0 ? 's' : ''}`,
                                        )
                                        .setValue(`${i + 1}`),
                                ),
                            )
                            .setRequired(!allOptional),
                    ),
            )
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel('Max number of winners')
                    .setDescription(
                        'Must be a number between 1 and 99. Defines the amount of users that can win this giveaway',
                    )
                    .setTextInputComponent(
                        new TextInputBuilder()
                            .setCustomId('numberOfWinners')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('1')
                            .setMinLength(1)
                            .setMaxLength(2)
                            .setRequired(!allOptional),
                    ),
            )
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel('Description')
                    .setDescription(
                        'Optional description to list more info, up to 1000 characters. Allows markdown formatting',
                    )
                    .setTextInputComponent(
                        new TextInputBuilder()
                            .setCustomId('description')
                            .setMinLength(3)
                            .setMaxLength(1000)
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder(
                                'Every winner will receive 100 years of free nitro no strings attached',
                            )
                            .setRequired(false),
                    ),
            )
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel('Images')
                    .setDescription(
                        'Up to 10 images to add under your title/description',
                    )
                    .setFileUploadComponent(
                        new FileUploadBuilder()
                            .setCustomId('images')
                            .setMaxValues(10)
                            .setRequired(false),
                    ),
            ),
    );
    try {
        const modalInteraction = await interaction.awaitModalSubmit({
            time: 300_000,
            filter: (i) =>
                i.customId === modalId && i.user.id === interaction.user.id,
        });

        Object.assign(input, {
            title:
                modalInteraction.fields.getTextInputValue('title').trim() ||
                null,
            duration:
                +modalInteraction.fields.getStringSelectValues(
                    'duration',
                )[0]! || null,
            numberOfWinners:
                +modalInteraction.fields.getTextInputValue('numberOfWinners'),
            description:
                modalInteraction.fields
                    .getTextInputValue('description')
                    .trim() || null,
            attachments:
                modalInteraction.fields
                    .getUploadedFiles('images')
                    ?.map((a) => a) ?? null,
        });

        const invalid =
            isNaN(input.numberOfWinners) || input.numberOfWinners < 1;
        if (invalid) {
            if (allOptional) input.numberOfWinners = null;
            else
                return modalInteraction.reply(
                    containerDisplay(
                        {
                            text: 'Number of winners must be a number between 1 and 99',
                            color: 'error',
                        },
                        MessageFlags.Ephemeral,
                    ),
                );
        }

        return modalInteraction;
    } catch {
        return;
    }
}

export async function showModConfirmButtons(
    interaction: ChatInputCommandInteraction,
    action: string,
): Promise<ButtonInteraction | undefined> {
    const messageContent = (
        confirmed: boolean = false,
    ): PartialMessageOptions => {
        return {
            components: [
                new ContainerBuilder()
                    .addTextDisplayComponents(
                        buildTextDisplay(
                            `## This giveaway isn't yours\nAre you sure you want to ${action} it? Click Confirm to continue`,
                        ),
                    )
                    .addActionRowComponents(
                        new ActionRowBuilder<ButtonBuilder>().setComponents(
                            new ButtonBuilder()
                                .setLabel('Cancel')
                                .setCustomId('cancel')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(confirmed),
                            new ButtonBuilder()
                                .setLabel(confirmed ? 'Confirmed' : 'Confirm')
                                .setCustomId('confirm')
                                .setStyle(ButtonStyle.Danger)
                                .setDisabled(confirmed),
                        ),
                    ),
            ],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        };
    };

    const message = await interaction.reply(messageContent());

    return new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({
            time: 60_000,
            componentType: ComponentType.Button,
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'confirm') {
                await interaction.editReply(messageContent(true));
                collector.stop('confirmed');
                resolve(i);
            } else {
                await i.update(containerDisplay({ text: 'Cancelled' }));
                collector.stop('cancelled');
                resolve(undefined);
            }
        });

        collector.on('end', (_, reason) => {
            if (reason !== 'confirmed' && reason !== 'cancelled') {
                fireAndForget(
                    interaction.editReply(
                        containerDisplay({ text: 'Interaction timed out' }),
                    ),
                );
                resolve(undefined);
            }
        });
    });
}

export function fetchEntries(uuid: string) {
    return (
        db
            .select({ entries: count() })
            .from(giveawayParticipants)
            .where(eq(giveawayParticipants.giveawayId, uuid))
            .get()!.entries ?? 0
    );
}
