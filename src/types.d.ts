import {
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    Collection,
    type InteractionEditReplyOptions,
    type InteractionReplyOptions,
    type MessageCreateOptions,
    SlashCommandBuilder,
} from 'discord.js';

declare module 'discord.js' {
    interface Client {
        commands: Collection<string, Command>;
    }
}

type Command = {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

export type AccentColor = 'error' | 'primary';

type ContainerOptions = {
    text?: string;
    color?: AccentColor;
};

type PartialMessageOptions = Pick<
    InteractionReplyOptions &
        InteractionEditReplyOptions &
        MessageCreateOptions,
    'components' | 'flags'
>;

type GiveawayMessageBase = {
    title: string;
    description: string | null;
    imageUrls: string[] | null;
    creatorId: string;
    numberOfWinners: number;
    uuid: string;
};

export type GiveawayMessageData = GiveawayMessageBase &
    (
        | {
              started: false;
              ended: false;
              duration: number;
          }
        | ({
              started: true;
              endTime: number;
              entries: number;
              participants: number;
          } & (
              | {
                    ended: false;
                }
              | { ended: true; winners: string[] }
          ))
    );
