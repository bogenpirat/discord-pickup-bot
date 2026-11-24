import type { SlashCommand } from '../discord/types.ts';
import { createRetimePickupCommand } from './retimePickup.ts';

export const valoTimeCommand: SlashCommand = createRetimePickupCommand(
  {
    name: 'valo-time',
    description: 'Change the start time of the last pickup game in this channel',
    descriptionDe: 'Ändere die Startzeit der letzten Valorant-Runde in diesem Kanal',
  },
  'game',
);
