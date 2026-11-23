import {
    type ChatInputCommandInteraction,
    FileUploadBuilder,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { randomUUIDv7 } from 'node:crypto';
import { db } from '../../db/client.js';
import { giveaways } from '../../db/schema.js';
import {
    buildContainer,
    containerDisplay,
    giveawayContainer,
} from '../../utils.js';

export async function handleCreate(
    interaction: ChatInputCommandInteraction,
): Promise<unknown> {
    let title = interaction.options.getString('title');
    let duration = interaction.options.getInteger('duration');
    let numberOfWinners = interaction.options.getInteger('number-of-winners');
    let description =
        interaction.options.getString('description')?.trim() || null;
    const image = interaction.options.getAttachment('image');
    let attachments = image ? [image] : null;

    const creatorId = interaction.user.id;
    const uuid = randomUUIDv7();

    const deferFlags = {
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    };
    let replyInteraction: ChatInputCommandInteraction | ModalSubmitInteraction =
        interaction;

    const replyHeader = buildContainer({
        text: '# Giveaway Successfully Created',
        color: 'primary',
    });

    if (title && duration && numberOfWinners) {
        await interaction.deferReply(deferFlags);
    } else {
        const modal = new ModalBuilder()
            .setCustomId(uuid)
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
                            .setPlaceholder('Free Nitro'),
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
                                        .setDefault(i === 0)
                                        .setLabel(
                                            `${i + 1} day${i > 0 ? 's' : ''}`,
                                        )
                                        .setValue(`${i + 1}`),
                                ),
                            ),
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
                            .setMaxLength(2),
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
            );

        await interaction.showModal(modal);
        try {
            const modalInteraction = await interaction.awaitModalSubmit({
                time: 300_000,
            });

            title = modalInteraction.fields.getTextInputValue('title');
            duration =
                +modalInteraction.fields.getStringSelectValues('duration')[0]!;
            numberOfWinners =
                +modalInteraction.fields.getTextInputValue('numberOfWinners');
            description =
                modalInteraction.fields
                    .getTextInputValue('description')
                    .trim() || null;
            attachments =
                modalInteraction.fields
                    .getUploadedFiles('images')
                    ?.map((a) => a) ?? null;

            if (isNaN(numberOfWinners) || numberOfWinners < 1)
                return modalInteraction.reply(
                    containerDisplay(
                        {
                            text: 'Number of winners must be a number between 1 and 99',
                            color: 'error',
                        },
                        MessageFlags.Ephemeral,
                    ),
                );

            await modalInteraction.deferReply(deferFlags);
            replyInteraction = modalInteraction;
        } catch {
            return;
        }
    }

    if (
        attachments &&
        attachments.some((a) => !a.contentType?.startsWith('image/'))
    ) {
        console.log(`3: ${description}`);
        return replyInteraction.editReply(
            containerDisplay({
                text: `**Only images are allowed as attachments.**\nIf you'd like to copy them, here are the title and description you entered:\n> ## ${title}\n> ${description ?? '[ no description ]'}`,
                color: 'error',
            }),
        );
    }

    const attachmentURLs = attachments ? attachments?.map((a) => a.url) : null;

    await db.insert(giveaways).values({
        uuid,
        title,
        duration,
        numberOfWinners,
        description: description,
        imageUrls: attachmentURLs?.join('\n'),
        creatorId,
        creationTime: Date.now(),
    });

    const giveaway = giveawayContainer({
        title,
        description,
        imageUrls: attachmentURLs,
        creatorId,
        numberOfWinners,
        uuid,
        started: false,
        ended: false,
        duration,
    });

    return replyInteraction.editReply({
        components: [replyHeader, giveaway],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    });
}
