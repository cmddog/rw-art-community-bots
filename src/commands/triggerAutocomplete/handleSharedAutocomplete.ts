import type { AutocompleteInteraction } from 'discord.js';
import { db } from '../../db/client.js';
import { triggers } from '../../db/schema.js';
import { like } from 'drizzle-orm';

export async function triggerAutocomplete(
    interaction: AutocompleteInteraction,
): Promise<void> {
    const focused = interaction.options.getFocused();
    return interaction.respond(
        db
            .select({ name: triggers.name })
            .from(triggers)
            .where(like(triggers.name, `%${focused}%`))
            .limit(100)
            .all()
            .map((r) => ({ name: r.name, value: r.name })),
    );
}
