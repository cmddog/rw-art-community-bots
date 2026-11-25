import {
    integer,
    primaryKey,
    sqliteTable,
    text,
} from 'drizzle-orm/sqlite-core';

export const triggers = sqliteTable('triggers', {
    name: text().primaryKey(),
    description: text().notNull(),
});

export const triggerSubscribers = sqliteTable(
    'trigger_subscribers',
    {
        triggerName: text('trigger_name')
            .notNull()
            .references(() => triggers.name, {
                onDelete: 'cascade',
                onUpdate: 'cascade',
            }),
        userId: text('user_id').notNull(),
    },
    (t) => [primaryKey({ columns: [t.triggerName, t.userId] })],
);

export const pseudonyms = sqliteTable('pseudonyms', {
    userId: text('user_id').primaryKey(),
    pseudonym: text().unique().notNull(),
});

export const keyValue = sqliteTable('key-value', {
    key: text().primaryKey(),
    value: text().notNull(),
});

export const giveaways = sqliteTable('giveaways', {
    uuid: text().primaryKey(),
    title: text().notNull(),
    duration: integer().notNull(),
    numberOfWinners: integer('number_of_winners').notNull(),
    description: text(),
    imageUrls: text(),
    creatorId: text().notNull(),
    creationTime: integer().notNull(),
    startTime: integer(),
    announcementMessageId: text(),
    winnersMessageId: text(),
    fullyCompletedTime: integer(),
});

export const giveawayParticipants = sqliteTable('giveaway_participants', {
    giveawayId: text('giveaway_id')
        .notNull()
        .references(() => giveaways.uuid, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
        }),
    userId: text('user_id').notNull(),
});

export const giveawayPingRoles = sqliteTable('giveaway_ping_roles', {
    roleId: text().primaryKey(),
});
