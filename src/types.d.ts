import {
    APIRole,
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    Collection,
    type InteractionEditReplyOptions,
    type InteractionReplyOptions,
    type MessageCreateOptions,
    SlashCommandBuilder,
    Snowflake,
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
    description: string | undefined | null;
    imageUrls: string[] | undefined | null;
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
              pingRoleId: Snowflake | undefined | null;
          } & (
              | {
                    ended: false;
                }
              | { ended: true; winners: string[] }
          ))
    );

export type GiveawayInput = Pick<
    typeof giveaways.$inferInsert,
    'title' | 'duration' | 'numberOfWinners' | 'description'
> & {
    attachments: Attachment[] | null;
};

export type GiveawayStatus = 'pending' | 'active' | 'ending' | 'complete';
