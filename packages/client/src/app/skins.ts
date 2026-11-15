// The looks a person can pick from a dropdown, on the home screen before joining and in the menu
// while playing: each by the guide's name for it with its chat command beside it, then the standard
// body in each named color.
import { AVATARS, AVATAR_IDS, NAMED_COLORS, isAvatarId, type AvatarId } from '@world/shared';
import { CHARACTERS } from '../guide/content';
import type { Choice } from './Picker';

export const COLOR = 'color:'; // before a NAMED_COLORS name, a choice of the standard body in that color

// Every look a person can switch to by command, the standard body first; then, always last, the
// standard body in each named color. On foot alone unless `flying`: a join takes only those, while
// a command in the game takes a person into a dragon too.
export function skinChoices(flying = false): Choice[] {
  const choices: Choice[] = [];
  for (const id of AVATAR_IDS) {
    const command = AVATARS[id].command;
    if (command === null || (!flying && AVATARS[id].class !== 'walker')) continue;
    choices.push({ value: id, label: CHARACTERS[id].title, note: `/${command}` });
  }
  for (const name of Object.keys(NAMED_COLORS))
    choices.push({ value: COLOR + name, label: `${name[0].toUpperCase()}${name.slice(1)}`, note: `/${name}` });
  return choices;
}

// The choice a body is: its look, or for the standard body its color where that has a name.
export function skinChoice(avatar: AvatarId, color: string | null): string {
  return avatar !== 'standard' || !color ? avatar : COLOR + color;
}

// The chat command that makes a person the choice: a look's own, or a color's name.
export function skinCommand(value: string): string | null {
  if (value.startsWith(COLOR)) return value.slice(COLOR.length);
  return isAvatarId(value) ? AVATARS[value].command : null;
}
