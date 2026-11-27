import {
    ButtonInteraction,
    Events,
    type Interaction,
    MessageFlags,
} from 'discord.js';
import { containerDisplay, isAutocompleteCommand, reply } from '../utils.js';
import { handleStart } from '../commands/giveaway/handleStart.js';
import { logger } from '../logger.js';

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction) {
    if (
        !interaction.isChatInputCommand() &&
        !interaction.isAutocomplete() &&
        !interaction.isButton()
    )
        return;

    if (interaction.isButton()) {
        if (interaction.customId.startsWith('giveaway')) {
            try {
                await handleGiveawayButton(interaction);
            } catch (error) {
                console.error(error);
                const errorResponse = containerDisplay(
                    {
                        text: 'There was an error while handling this button.',
                        color: 'error',
                    },
                    MessageFlags.Ephemeral,
                );
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorResponse);
                } else {
                    await interaction.reply(errorResponse);
                }
            }
            return;
        } else return;
    }

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        logger.error(
            `No command matching ${interaction.commandName} was found.`,
        );
        return;
    }

    if (interaction.isChatInputCommand()) {
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            const errorResponse = containerDisplay(
                {
                    text: 'There was an error while executing this command.',
                    color: 'error',
                },
                MessageFlags.Ephemeral,
            );
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorResponse);
            } else {
                await interaction.reply(errorResponse);
            }
        }
    } else if (interaction.isAutocomplete()) {
        try {
            if (isAutocompleteCommand(command)) {
                await command.autocomplete(interaction);
            } else {
                logger.error(
                    `Missing autocomplete handler for ${interaction.commandName}`,
                );
                await interaction.respond([]);
            }
        } catch (error) {
            console.error(error);
        }
    }
}

async function handleGiveawayButton(interaction: ButtonInteraction) {
    const [, uuid, action] = interaction.customId.split(':');
    if (!uuid || !action) throw new Error('Invalid customId');

    switch (action) {
        case 'start': {
            return handleStart(interaction);
        }
        default:
            return reply(
                interaction,
                containerDisplay({ text: 'Unknown action', color: 'error' }),
            );
    }
}
