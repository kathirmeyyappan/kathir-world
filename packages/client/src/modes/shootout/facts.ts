// Shootout's numbers for the guide, read off what the game runs on.
import { CLOCK, FREEPLAY_DYING, MIN_TEAMS, POINTS, TEAMS } from '@world/shared';
import { BOT_FACTS } from '../bots';

export function shootoutFacts(): { label: string; value: string }[] {
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return [
    { label: 'Teams', value: `${MIN_TEAMS} to ${TEAMS.length}` },
    ...BOT_FACTS,
    { label: 'Clock', value: `${clock(CLOCK.seconds)} (${clock(CLOCK.min)} to ${clock(CLOCK.max)})` },
    { label: 'Kill', value: `+${POINTS.kill} points` },
    { label: 'Death', value: `-${POINTS.death} point` },
    { label: 'Respawn', value: `${FREEPLAY_DYING.seconds} s` },
  ];
}
