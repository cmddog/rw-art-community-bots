import {
    check,
    integer,
    primaryKey,
    sqliteTable,
    text,
} from 'drizzle-orm/sqlite-core';
import type { GiveawayStatus } from '../types.js';
import { sql } from 'drizzle-orm';

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

export const giveaways = sqliteTable(
    'giveaways',
    {
        uuid: text().primaryKey(),
        title: text().notNull(),
        duration: integer().notNull(),
        numberOfWinners: integer('number_of_winners').notNull(),
        description: text(),
        imageUrls: text(),
        status: text().$type<GiveawayStatus>().notNull().default('pending'),
        creatorId: text().notNull(),
        pingRoleId: text(),
        creationTime: integer().notNull(),
        startTime: integer(),
        endTime: integer(),
        announcementMessageId: text(),
        winnersMessageId: text(),
        fullyCompletedTime: integer(),
    },
    (table) => [
        check(
            'valid_giveaway_status',
            sql`${table.status} IN ('pending', 'active', 'ending', 'completed')`,
        ),
        check(
            'started_requires_announcement_start_time_end_time',
            sql`${table.status} NOT IN ('active', 'ending', 'completed') OR (${table.announcementMessageId} IS NOT NULL AND ${table.startTime} IS NOT NULL AND ${table.endTime} IS NOT NULL)`,
        ),
        check(
            'ending_requires_winners',
            sql`${table.status} <> 'ending' OR ${table.winnersMessageId} IS NOT NULL`,
        ),
        check(
            'completed_requires_time',
            sql`${table.status} <> 'completed' OR ${table.fullyCompletedTime} IS NOT NULL`,
        ),
        check(
            'title_description_images_must_not_be_empty',
            sql`trim(${table.title}) <> '' AND trim(${table.description}) <> '' AND trim(${table.imageUrls}) <> ''`,
        ),
    ],
);

export const giveawayParticipants = sqliteTable('giveaway_participants', {
    giveawayId: text('giveaway_id')
        .notNull()
        .references(() => giveaways.uuid, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
        }),
    userId: text('user_id').notNull(),
});

export const giveawayWinners = sqliteTable(
    'giveaway_winners',
    {
        giveawayId: text('giveaway_id')
            .notNull()
            .references(() => giveaways.uuid, {
                onDelete: 'cascade',
                onUpdate: 'cascade',
            }),
        userId: text('user_id').notNull(),
        claimedAt: integer('claimed_at'),
    },
    (table) => [
        primaryKey({
            columns: [table.giveawayId, table.userId],
        }),
    ],
);

export const giveawayPingRoles = sqliteTable('giveaway_ping_roles', {
    roleId: text().primaryKey(),
});
