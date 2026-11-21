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
    ContainerBuilder,
    Guild,
    MediaGalleryBuilder,
    type MediaGalleryItemBuilder,
    MessageFlags,
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
    else if (data.started) container.setAccentColor(0xffc333);
    else container.setAccentColor(ACCENT_COLORS.primary);

    container.addTextDisplayComponents(
        buildTextDisplay(
            `Giveaway${data.ended ? ' Ended' : ''} ✦ ${data.title}`,
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
            `**Host**: <@${data.creatorId}> ⸺ Up to ${data.numberOfWinners} winners ⸺ ${data.ended ? `Ended <t:${data.endTime}:R>` : data.started ? `Ends <t:${data.endTime}:R>` : `**Duration**: ${data.duration}`}`,
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
                              .setEmoji('gift')
                              .setStyle(ButtonStyle.Premium)
                              .setLabel('Enter'),
                      ]),
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel(`Participants: ${data.participants}`)
                    .setDisabled(),
            ),
        );
    container.addTextDisplayComponents(
        buildTextDisplay(`-# *UUID: ${data.uuid}*`),
    );
    if (data.ended)
        container
            .addSeparatorComponents()
            .addTextDisplayComponents(
                buildTextDisplay(
                    `**Winners: ${data.winners.map((id) => `<@${id}>`).join(' ')}**`,
                ),
            );

    return container;
}
