import { Logger } from 'tslog';

export const logger = new Logger({
    name: process.env.BOT_INSTANCE ?? 'bot',
    type: 'pretty',
    minLevel: 3,
});
