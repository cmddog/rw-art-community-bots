import type {
    AccentColor,
    Command,
    ContainerOptions,
    PartialMessageOptions,
} from './types.js';
import { db } from './db/client.js';
import { keyValue, pseudonyms } from './db/schema.js';
import {
    ActionRowBuilder,
    ButtonBuilder,
    type ChatInputCommandInteraction,
    ContainerBuilder,
    Guild,
    type GuildTextBasedChannel,
    type InteractionReplyOptions,
    MessageFlags,
    PermissionFlagsBits,
    type RepliableInteraction,
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
import { logger } from './logger.js';

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

    db.insert(pseudonyms).values({ userId, pseudonym }).run();
    logger.info(`New pseudonym "${pseudonym}" created for ${userId}`);
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

export async function serverLog(
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
    promise.catch(logger.error);
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

/**
 * Shorthand for ephemerally replying to an interaction
 */
export function reply(
    interaction: RepliableInteraction,
    options: InteractionReplyOptions,
) {
    return interaction.reply({
        ...options,
        flags:
            (typeof options.flags === 'number' ? options.flags : 0) |
            MessageFlags.Ephemeral,
    });
}

/**
 * Shorthand for interaction.deferReply({ flags: MessageFlags.Ephemeral })
 */
export function deferReply(interaction: RepliableInteraction) {
    return interaction.deferReply({
        flags: MessageFlags.Ephemeral,
    });
}

export function daysToMillis(days: number) {
    return 1000 * 60 * 60 * 24 * days;
}
