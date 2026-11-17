// Every line a character says in its own voice (VOICES, or a dragon's DRAGON_VOICES), as the
// guide's buttons name them: one per take, numbered where a line has more than one.
import type { AvatarId } from '@world/shared';
import { voiceOf, type SoundId } from '../audio/Sfx';
import { VOICES } from '../audio/voices';

export interface Line {
  label: string;
  id: SoundId;
}

// A jump's sound by where it falls in a chain of jumps (Voice.jump).
const JUMPS = ['Jump', 'Double jump', 'Triple jump'];

function takes(name: string, ids: readonly SoundId[] | undefined): Line[] {
  if (!ids) return [];
  return ids.map((id, i) => ({ label: ids.length > 1 ? `${name} ${i + 1}` : name, id }));
}

export function linesOf(avatar: AvatarId): Line[] {
  const voice = VOICES[avatar];
  const dragon = voiceOf(avatar);
  return [
    ...takes('Intro', voice.enter),
    ...(voice.jump ?? []).map((id, i) => ({ label: JUMPS[i] ?? `Jump ${i + 1}`, id })),
    ...takes('Long jump', voice.leap),
    ...takes('Ground pound', voice.twirl && [voice.twirl]),
    ...takes('Hurt', voice.hurt),
    ...takes('Kill', voice.kill),
    ...takes('Death', voice.death),
    ...(dragon
      ? [
          ...Object.values(dragon.roars).flatMap((call, i) => [
            { label: `Roar ${i + 1}`, id: call.near },
            ...(call.far ? [{ label: `Roar ${i + 1} (far)`, id: call.far }] : []),
          ]),
          { label: 'Rise', id: dragon.cry.near },
          ...(dragon.cry.far ? [{ label: 'Rise (far)', id: dragon.cry.far }] : []),
          { label: 'Theme', id: dragon.theme },
        ]
      : []),
  ];
}
