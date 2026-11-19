// Every sound a character makes that not every look makes alike, as the guide's buttons name them:
// one per take, numbered where a line has more than one. That is all it says (VOICES), the sounds
// of the moves it has (voices.ts `MoveSound` and the rest, the same the game plays), footsteps of
// its own (GAITS), a dragon's roars and rise (DRAGON_VOICES), and its theme. What every look makes the
// same (the jump's swoosh, the thuds of a step, the hurt sound) is left out. A new look's sound,
// or a new move's, is listed here too.
import type { AvatarId } from '@world/shared';
import { voiceOf, type SoundId } from '../audio/Sfx';
import { shimmerOf, swingOf, twirlOf, VOICES } from '../audio/voices';
import { GAITS } from '../render/avatars/gaits';

export interface Line {
  label: string;
  id: SoundId;
  rate?: number; // speed and pitch together, as the game plays it
}

const SWOOSH: SoundId = 'jump'; // every look's jump, unless its voice has one of its own

// A jump's sound by where it falls in a chain of jumps (Voice.jump).
const JUMPS = ['Jump', 'Double jump', 'Triple jump'];

function takes(name: string, ids: readonly SoundId[] | undefined, rate?: number): Line[] {
  if (!ids) return [];
  return ids.map((id, i) => ({ label: ids.length > 1 ? `${name} ${i + 1}` : name, id, rate }));
}

export function linesOf(avatar: AvatarId): Line[] {
  const voice = VOICES[avatar];
  const dragon = voiceOf(avatar);
  const twirl = twirlOf(avatar);
  const shimmer = shimmerOf(avatar);
  const swing = swingOf(avatar);
  const steps = GAITS[avatar]?.steps;
  return [
    ...takes('Intro', voice.enter),
    ...(voice.jump ?? [])
      .map((id, i) => ({ label: JUMPS[i] ?? `Jump ${i + 1}`, id }))
      .filter((line) => line.id !== SWOOSH),
    ...takes('Long jump', voice.leap),
    ...takes('Ground pound', twirl ? [twirl] : undefined),
    ...takes('Float', shimmer ? [shimmer] : undefined),
    ...(swing ? [{ label: 'Bat swing', id: swing.sound, rate: swing.rate }] : []),
    ...(typeof steps === 'object'
      ? 'bar' in steps
        ? takes('Footstep', steps.bar, GAITS[avatar]?.pitch)
        : takes('Footsteps', [steps.loop])
      : []),
    ...takes('Hurt', voice.hurt),
    ...takes('Kill', voice.kill),
    ...takes('Kart trick', voice.trick),
    ...takes('Death', voice.death),
    ...(dragon
      ? [
          ...Object.values(dragon.roars).flatMap((call, i) => [
            { label: `Roar ${i + 1}`, id: call.near },
            ...(call.far ? [{ label: `Roar ${i + 1} (far)`, id: call.far }] : []),
          ]),
          { label: 'Rise', id: dragon.cry.near },
          ...(dragon.cry.far ? [{ label: 'Rise (far)', id: dragon.cry.far }] : []),
        ]
      : []),
    ...takes('Theme', voice.theme ? [voice.theme.sound] : undefined),
  ];
}
