import { type Logger, pino } from 'pino';

export const createLogger = (level: string, pretty: boolean): Logger =>
  pino({
    level,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  });

export type { Logger };
