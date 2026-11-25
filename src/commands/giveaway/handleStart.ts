import {
    type APIRole,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    type ChatInputCommandInteraction,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    type ModalSubmitInteraction,
    type Role,
    RoleSelectMenuBuilder,
    SectionBuilder,
} from 'discord.js';
import { db } from '../../db/client.js';
import { eq } from 'drizzle-orm';
import { giveaways, keyValue } from '../../db/schema.js';
import {
    buildContainer,
    buildTextDisplay,
    containerDisplay,
    giveawayContainer,
} from '../../utils.js';

export async function handleStart(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
): Promise<unknown> {
    let uuid: string;
    let pingRole: Role | APIRole | null = null;

    if (interaction.isButton()) {
        const [, parsedUuid] = interaction.customId.split(':');

        uuid = parsedUuid!; // interactionCreate.ts is the only source that calls this with ButtonInteraction and already checks uuid
    } else {
        uuid = interaction.options.getString('id', true);
    }

    let activeInteraction:
        | ChatInputCommandInteraction
        | ButtonInteraction
        | ModalSubmitInteraction = interaction;

    const roles = (await db.query.giveawayPingRoles.findMany()).map(
        (i) => i.roleId,
    );
    // Make the user choose a ping role when there's multiple, automatically ping when there's only one, don't ping when there's none
    if (roles.length > 1) {
        const modalId = `giveaway-modal:${uuid}`;
        const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle('Choose a Role to Ping')
            .addLabelComponents(
                new LabelBuilder()
                    .setDescription(
                        'Choose the role that will be pinged for your giveaway',
                    )
                    .setRoleSelectMenuComponent(
                        new RoleSelectMenuBuilder()
                            .setCustomId('role')
                            .setDefaultRoles(roles)
                            .setMaxValues(1),
                    ),
            );

        await activeInteraction.showModal(modal);
        try {
            activeInteraction = await interaction.awaitModalSubmit({
                time: 120_000,
                filter: (i) =>
                    i.customId === modalId && i.user.id === interaction.user.id,
            });
        } catch {
            return;
        }

        pingRole =
            activeInteraction.fields.getSelectedRoles('role')?.first() ?? null;
    } else if (roles.length === 1) {
        pingRole =
            (await activeInteraction.guild?.roles.fetch(roles[0]!)) ?? null;
    }

    await activeInteraction.deferReply({ flags: MessageFlags.Ephemeral });

    const giveaway = await db.query.giveaways.findFirst({
        where: eq(giveaways.uuid, uuid),
    });

    if (!giveaway)
        return activeInteraction.editReply(
            containerDisplay(
                {
                    text: 'The giveaway with that UUID no longer exists',
                    color: 'error',
                },
                MessageFlags.Ephemeral,
            ),
        );

    const kv = await db.query.keyValue.findFirst({
        where: eq(keyValue.key, 'giveawayChannel'),
    });
    if (!kv)
        return activeInteraction.editReply(
            containerDisplay({
                text: 'There is no giveaway channel set. Go bother a Moderator about it',
                color: 'error',
            }),
        );
    const channel =
        (await activeInteraction.guild?.channels
            .fetch(kv.value)
            .catch(() => null)) ?? null;

    if (!channel || !channel.isSendable())
        return activeInteraction.editReply(
            containerDisplay({
                text: "The giveaway channel couldn't be found or is invalid. Please let a Moderator know",
            }),
        );

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + giveaway.duration);

    const message = await channel.send({
        components: [
            giveawayContainer({
                started: true,
                ended: false,
                title: giveaway.title,
                description: giveaway.description ?? null,
                imageUrls: giveaway.imageUrls?.split('\n') ?? null,
                creatorId: giveaway.creatorId,
                numberOfWinners: giveaway.numberOfWinners,
                uuid: giveaway.uuid,
                endTime: endDate.getTime(),
                entries: 0,
                pingRole,
            }),
        ],
    });

    await db
        .update(giveaways)
        .set({ startTime: Date.now(), announcementMessageId: message.id })
        .where(eq(giveaways.uuid, giveaway.uuid));

    return activeInteraction.editReply({
        components: [
            buildContainer({ color: 'primary' }).addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        buildTextDisplay('Giveaway successfully sent'),
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setStyle(ButtonStyle.Link)
                            .setLabel('Jump')
                            .setURL(message.url),
                    ),
            ),
        ],
    });
}
