// Racing's numbers for the guide, read off what the game runs on.
import { MIN_RACERS, RACE, RACES, TRACK_LENGTH } from '@world/shared';

export function racingFacts(): { label: string; value: string }[] {
  return [
    { label: 'Races', value: `${RACES.count} (${RACES.min} to ${RACES.max})` },
    { label: 'Racers', value: `${MIN_RACERS} or more` },
    { label: 'Track', value: `${TRACK_LENGTH.min / 1000} to ${TRACK_LENGTH.max / 1000} km` },
    { label: 'On the grid', value: `${RACE.grid} s` },
    { label: 'After the first finish', value: `${RACE.close} s` },
    { label: 'First place', value: '1 point a racer' },
    { label: 'Each place behind', value: '-1 point' },
  ];
}
