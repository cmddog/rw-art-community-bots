import {
    type ChatInputCommandInteraction,
    FileUploadBuilder,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { randomUUIDv7 } from 'node:crypto';
import { db } from '../../db/client.js';
import { giveaways } from '../../db/schema.js';
import { containerDisplay } from '../../utils.js';

export async function handleCreate(
    interaction: ChatInputCommandInteraction,
): Promise<unknown> {
    const title = interaction.options.getString('title');
    const duration = interaction.options.getInteger('duration');
    const numberOfWinners = interaction.options.getInteger('number-of-winners');
    const description = interaction.options.getString('description');
    const image = interaction.options.getAttachment('image');

    const uuid = randomUUIDv7();

    if (title && duration && numberOfWinners) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });

        await db.insert(giveaways).values({
            uuid,
            title,
            duration,
            numberOfWinners,
            description,
            imageUrls: image?.url,
            creatorId: interaction.user.id,
            creationTime: Date.now(),
        });
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
                    .setLabel('Max number of winners')
                    .setDescription(
                        'Must be a number between 1 and 100. Defines the amount of users that will be able to win this giveaway',
                    )
                    .setTextInputComponent(
                        new TextInputBuilder()
                            .setCustomId('numberOfWinners')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('1')
                            .setMaxLength(3),
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
                                            `${i + 1} day${i > 1 ? 's' : ''}`,
                                        )
                                        .setValue(`${i + 1}`),
                                ),
                            ),
                    ),
            )
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel('Description')
                    .setDescription(
                        'Optional description for your giveaway to list more info, up to 1000 characters. Allows markdown formatting',
                    )
                    .setTextInputComponent(
                        new TextInputBuilder()
                            .setCustomId('description')
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
                            .setRequired(false),
                    ),
            );

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.showModal(modal);
        const res = interaction
            .awaitModalSubmit({ time: 300_000 })
            .then((interaction) =>
                interaction.editReply('Thank you for your submission!'),
            )
            .catch(
                (err) =>
                    console.log(
                        'No modal submit interaction was collected: ',
                        err,
                    ),
                interaction.editReply(
                    containerDisplay({
                        text: "The modal wasn't submitted successfully",
                        color: 'error',
                    }),
                ),
            );
    }

    return interaction.editReply(containerDisplay({ text: '' }));
}
