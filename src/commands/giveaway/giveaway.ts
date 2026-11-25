import {
    type AutocompleteInteraction,
    ChatInputCommandInteraction,
    SlashCommandAttachmentOption,
    SlashCommandBuilder,
    SlashCommandIntegerOption,
    SlashCommandStringOption,
} from 'discord.js';
import { handleCreate } from './handleCreate.js';
import { handleStart } from './handleStart.js';
import { handleEdit } from './handleEdit.js';
import { handleDelete } from './handleDelete.js';
import { handleList } from './handleList.js';
import { db } from '../../db/client.js';
import { and, eq, like, or } from 'drizzle-orm';
import { giveaways } from '../../db/schema.js';

const titleOption = new SlashCommandStringOption()
    .setName('title')
    .setDescription('Title of this giveaway')
    .setMinLength(1)
    .setMaxLength(20);

const numberOfWinnersOption = new SlashCommandIntegerOption()
    .setName('number-of-winners')
    .setDescription('The number of people that can win this giveaway')
    .setMinValue(1)
    .setMaxValue(99);

const durationOption = new SlashCommandIntegerOption()
    .setName('duration')
    .setDescription('Duration of the giveaway once started')
    .setChoices(
        { name: '1 day', value: 1 },
        { name: '2 days', value: 2 },
        { name: '3 days', value: 3 },
    );

const descriptionOption = new SlashCommandStringOption()
    .setName('description')
    .setDescription('Description for this giveaway')
    .setMinLength(3)
    .setMaxLength(1000);

const imageOption = new SlashCommandAttachmentOption()
    .setName('image')
    .setDescription('An image to be attached below the description');

export const data = new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway commands')
    // ⎯⎯⎯⎯⎯ CREATE ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ CREATE ⎯⎯⎯⎯⎯
    .addSubcommand((s) =>
        s
            .setName('create')
            .setDescription(
                "Creates a giveaway. Opens a modal if run without the first 3 arguments. Doesn't start the giveaway",
            )
            .addStringOption(titleOption)
            .addIntegerOption(durationOption)
            .addIntegerOption(numberOfWinnersOption)
            .addStringOption(descriptionOption)
            .addAttachmentOption(imageOption),
    )
    // ⎯⎯⎯⎯⎯ START ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ START ⎯⎯⎯⎯⎯
    .addSubcommand((s) =>
        s
            .setName('start')
            .setDescription(
                'Start a giveaway, sending the announcement message in the giveaways channel',
            )
            .addStringOption((o) =>
                o
                    .setName('id')
                    .setDescription('ID of the giveaway to start')
                    .setAutocomplete(true)
                    .setRequired(true),
            ),
    )
    // ⎯⎯⎯⎯⎯ EDIT ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ EDIT ⎯⎯⎯⎯⎯
    .addSubcommand((s) =>
        s
            .setName('edit')
            .setDescription('Edit a giveaway')
            .addStringOption((o) =>
                o
                    .setName('id')
                    .setDescription('ID of the giveaway to edit')
                    .setAutocomplete(true)
                    .setRequired(true),
            )
            .addStringOption(titleOption)
            .addIntegerOption(durationOption)
            .addIntegerOption(numberOfWinnersOption)
            .addStringOption(descriptionOption)
            .addAttachmentOption(imageOption),
    )
    // ⎯⎯⎯⎯⎯ DELETE ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ DELETE ⎯⎯⎯⎯⎯
    .addSubcommand((s) =>
        s
            .setName('delete')
            .setDescription(
                'Delete a giveaway. Cannot delete giveaways after started unless moderator',
            )
            .addStringOption((o) =>
                o
                    .setName('id')
                    .setDescription('ID of the giveaway to delete')
                    .setAutocomplete(true)
                    .setRequired(true),
            ),
    )
    // ⎯⎯⎯⎯⎯ REROLL ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ REROLL ⎯⎯⎯⎯⎯
    .addSubcommand((s) =>
        s
            .setName('reroll')
            .setDescription(
                'Rerolls all (unclaimed) winners of a giveaway or only the specified users',
            )
            .addStringOption((o) =>
                o
                    .setName('id')
                    .setDescription('ID of the giveaway to reroll')
                    .setAutocomplete(true)
                    .setRequired(true),
            )
            .addStringOption((o) =>
                o
                    .setName('users')
                    .setDescription(
                        'A list of comma separated user IDs to reroll',
                    ),
            ),
    )
    // ⎯⎯⎯⎯⎯ LIST ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ LIST ⎯⎯⎯⎯⎯
    .addSubcommand((s) =>
        s
            .setName('list')
            .setDescription('List all currently running giveaways'),
    );

const handlers: Record<
    string,
    (interaction: ChatInputCommandInteraction) => unknown
> = {
    create: handleCreate,
    start: handleStart,
    edit: handleEdit,
    delete: handleDelete,
    list: handleList,
};

export async function execute(
    interaction: ChatInputCommandInteraction,
): Promise<unknown> {
    return handlers[interaction.options.getSubcommand()]?.(interaction);
}

export async function autocomplete(
    interaction: AutocompleteInteraction,
): Promise<unknown> {
    const focused = interaction.options.getFocused();
    const userId = interaction.user.id;
    const results = await db.query.giveaways.findMany({
        where: and(
            or(
                like(giveaways.uuid, `%${focused}%`),
                like(giveaways.title, `%${focused}%`),
            ),
            eq(giveaways.creatorId, userId),
        ),
    });
    return interaction.respond(
        results.map((r) => ({ name: r.title, value: r.uuid })).slice(0, 25),
    );
}
