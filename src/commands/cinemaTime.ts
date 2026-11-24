import type { SlashCommand } from '../discord/types.ts';
import { createRetimePickupCommand } from './retimePickup.ts';

export const cinemaTimeCommand: SlashCommand = createRetimePickupCommand(
  {
    name: 'cinema-time',
    description: 'Change the showtime of the last movie night in this channel',
    descriptionDe: 'Ändere die Startzeit des letzten Filmabends in diesem Kanal',
  },
  'cinema',
);
