import type {
    AccentColor,
    Command,
    ContainerOptions,
    GiveawayMessageData,
    PartialMessageOptions,
} from './types.js';
import { db } from './db/client.js';
import { keyValue, pseudonyms } from './db/schema.js';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type ChatInputCommandInteraction,
    ContainerBuilder,
    Guild,
    type GuildTextBasedChannel,
    MediaGalleryBuilder,
    type MediaGalleryItemBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SectionBuilder,
    type TextChannel,
    TextDisplayBuilder,
} from 'discord.js';
import { eq } from 'drizzle-orm';
import {
    adjectives,
    animals,
    colors,
    uniqueNamesGenerator,
} from 'unique-names-generator';

export function isCommand(value: unknown): value is Command {
    return (
        typeof value === 'object' &&
        value !== null &&
        'data' in value &&
        'execute' in value
    );
}

export function isAutocompleteCommand(
    cmd: Command,
): cmd is Command & Required<Pick<Command, 'autocomplete'>> {
    return typeof cmd.autocomplete === 'function';
}

export async function getOrCreatePseudonym(userId: string) {
    const existing = await db.query.pseudonyms.findFirst({
        where: eq(pseudonyms.userId, userId),
    });

    if (existing) return existing.pseudonym;

    const all = await db.select().from(pseudonyms);
    let pseudonym: string;
    do {
        pseudonym = uniqueNamesGenerator({
            dictionaries: [colors, adjectives, animals],
            separator: '-',
            style: 'lowerCase',
        });
    } while (all.some((row) => row.pseudonym === pseudonym));

    await db.insert(pseudonyms).values({ userId, pseudonym });
    return pseudonym;
}

export const ACCENT_COLORS: Record<AccentColor, number> = {
    error: 0xea5d5c,
    primary: 0x5865f2,
};

export function buildContainer({
    text,
    color,
}: ContainerOptions = {}): ContainerBuilder {
    const container = new ContainerBuilder();

    if (text) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(text),
        );
    }

    if (color) {
        container.setAccentColor(ACCENT_COLORS[color]);
    }

    return container;
}

export function buildTextDisplay(content: string) {
    return new TextDisplayBuilder().setContent(content);
}

export function toReplyOptions(
    components: (ContainerBuilder | ActionRowBuilder<ButtonBuilder>)[],
    flags?: MessageFlags,
): PartialMessageOptions {
    return {
        components,
        flags: MessageFlags.IsComponentsV2 | (flags ?? 0),
    };
}

export function containerDisplay(
    options?: ContainerOptions,
    flags?: MessageFlags,
): PartialMessageOptions {
    return toReplyOptions([buildContainer(options)], flags);
}

export async function log(
    guild: Guild,
    components: (ContainerBuilder | ActionRowBuilder<ButtonBuilder>)[],
) {
    const row = await db.query.keyValue.findFirst({
        where: eq(keyValue.key, 'loggingChannelId'),
    });

    if (!row) return;

    const channel = await guild.channels.fetch(row.value);
    if (!channel?.isTextBased()) return;

    await channel.send({
        components,
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    });
}

export function fireAndForget(promise: Promise<unknown>) {
    promise.catch(console.error);
}

export function giveawayContainer(data: GiveawayMessageData): ContainerBuilder {
    const container = new ContainerBuilder();

    if (data.ended) container.setAccentColor(ACCENT_COLORS.error);
    else container.setAccentColor(0xce8100);

    const title =
        data.started && data.pingRole && !data.ended
            ? `## <@&${data.pingRole.id}> ✦ ${data.title}`
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

export async function verifyChannelSendPermission(
    interaction: ChatInputCommandInteraction,
    channel: GuildTextBasedChannel | TextChannel,
) {
    if (
        !channel
            .permissionsFor(interaction.client.user)
            ?.has(PermissionFlagsBits.SendMessages)
    ) {
        await interaction.reply(
            containerDisplay(
                {
                    text: `I don't have permission to send messages in ${channel}`,
                    color: 'error',
                },
                MessageFlags.Ephemeral,
            ),
        );
        return false;
    }
    return true;
}
