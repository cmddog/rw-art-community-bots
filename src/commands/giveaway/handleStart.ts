import {
    type APIRole,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    type ChatInputCommandInteraction,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    type RepliableInteraction,
    type Role,
    SectionBuilder,
    StringSelectMenuBuilder,
} from 'discord.js';
import { db } from '../../db/client.js';
import { eq } from 'drizzle-orm';
import { giveawayPingRoles, giveaways, keyValue } from '../../db/schema.js';
import {
    buildContainer,
    buildTextDisplay,
    containerDisplay,
    daysToMillis,
    deferReply,
    fireAndForget,
    reply,
} from '../../utils.js';
import { giveawayContainer } from '../../giveaways.utils.js';
import { logger } from '../../logger.js';

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

    let activeInteraction: RepliableInteraction = interaction;

    // Make the user choose a ping role when there's multiple, automatically ping when there's only one, don't ping when there's none
    const roleIds = db.query.giveawayPingRoles
        .findMany()
        .sync()
        .map((i) => i.roleId);

    const roles = (
        await Promise.all(
            roleIds.map((id) => activeInteraction.guild?.roles.cache.get(id)),
        )
    )
        .map((role, i) => {
            if (!role)
                fireAndForget(
                    db
                        .delete(giveawayPingRoles)
                        .where(eq(giveawayPingRoles.roleId, roleIds[i]!)),
                );
            return role;
        })
        .filter((role): role is Role => role !== null && role !== undefined);
    if (roles.length > 1) {
        const modalId = `giveaway-modal:${uuid}`;
        const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle('Choose a Role to Ping')
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel('Role')
                    .setDescription(
                        'Choose the role that will be pinged for your giveaway',
                    )
                    .setStringSelectMenuComponent(
                        new StringSelectMenuBuilder()
                            .setCustomId('role')
                            .setMaxValues(1)
                            .addOptions(
                                roles.map((role) => ({
                                    label: role.name,
                                    value: role.id,
                                })),
                            ),
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

        const selectedRoleId =
            activeInteraction.fields.getStringSelectValues('role')?.[0] ?? null;
        pingRole = selectedRoleId
            ? (roles.find((role) => role.id === selectedRoleId) ?? null)
            : null;
    } else if (roles.length === 1) {
        pingRole = roles[0]!;
    }

    const giveaway = db.query.giveaways
        .findFirst({
            where: eq(giveaways.uuid, uuid),
        })
        .sync();

    if (!giveaway) {
        return reply(
            activeInteraction,
            containerDisplay({
                text: 'The giveaway with that UUID no longer exists',
                color: 'error',
            }),
        );
    }

    if (giveaway.startTime) {
        return reply(
            activeInteraction,
            containerDisplay({
                text: 'That giveaway has already started',
                color: 'error',
            }),
        );
    }

    const kv = db.query.keyValue
        .findFirst({
            where: eq(keyValue.key, 'giveawayChannelId'),
        })
        .sync();

    if (!kv) {
        return reply(
            activeInteraction,
            containerDisplay({
                text: 'There is no giveaway channel set. Go bother a Moderator about it',
                color: 'error',
            }),
        );
    }

    const channel =
        activeInteraction.guild?.channels.cache.get(kv.value) ?? null;

    if (!channel || !channel.isSendable()) {
        return reply(
            activeInteraction,
            containerDisplay({
                text: "The giveaway channel couldn't be found or is invalid. Please let a Moderator know",
            }),
        );
    }

    const endTime = Date.now() + daysToMillis(giveaway.duration);

    await deferReply(activeInteraction);

    const message = await channel.send({
        flags: MessageFlags.IsComponentsV2,
        components: [
            giveawayContainer({
                started: true,
                ended: false,
                title: giveaway.title,
                description: giveaway.description ?? null,
                imageUrls: giveaway.imageUrls
                    ? JSON.parse(giveaway.imageUrls)
                    : null,
                creatorId: giveaway.creatorId,
                numberOfWinners: giveaway.numberOfWinners,
                uuid: giveaway.uuid,
                endTime,
                entries: 0,
                pingRoleId: pingRole?.id,
            }),
        ],
    });

    logger.info(
        `Giveaway announcement sent for ${giveaway.title} (${giveaway.uuid})`,
    );

    db.update(giveaways)
        .set({
            startTime: Date.now(),
            endTime,
            status: 'active',
            announcementMessageId: message.id,
            pingRoleId: pingRole?.id,
        })
        .where(eq(giveaways.uuid, giveaway.uuid))
        .run();

    logger.info(`Database status updated for ${giveaway.title}`);

    return activeInteraction.editReply({
        components: [
            buildContainer({ color: 'primary' }).addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        buildTextDisplay('Giveaway successfully started'),
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setStyle(ButtonStyle.Link)
                            .setLabel('Jump')
                            .setURL(message.url),
                    ),
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
    });
}
