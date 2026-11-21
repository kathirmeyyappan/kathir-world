// Chat commands: a message starting with "/" is parsed here and handled by the Room instead of
// being broadcast. Anyone seated can run them, bots included. Add a command by extending the
// union and the switch in Room.
import { avatarForCommand, type AvatarId } from './sim/avatars';
import {
  BOT_DEFAULT_SECONDS,
  BOT_MAX_SECONDS,
  botFlagFor,
  botFlags,
  botIdFor,
  type BotFlag,
  type BotId,
} from './sim/bots';
import { isGearId, type GearId } from './sim/gear';
import { NAMED_COLORS } from './sim/constants';
import { ITEMS, isItemId, type ItemId } from './sim/items';
import type { Vec3 } from './sim/types';
import { KARTS, KART_IDS, type KartId } from './sim/vehicles/karts';

export type Command =
  | { name: 'speedy' }
  | { name: 'equip'; item: ItemId }
  | { name: 'wear'; gear: GearId }
  | { name: 'unequip' }
  | { name: 'avatar'; avatar: AvatarId }
  | { name: 'color'; color: string } // one of NAMED_COLORS' names
  | { name: 'bot'; bot: BotId; call: BotCallArgs | null } // null: the flags didn't parse
  | { name: 'kill-bots' }
  | { name: 'kart'; kart: KartId } // drops one in front of them (sim/vehicles/garage.ts)
  // Puts their feet at a spot (a walker's alone). null: the coordinates didn't parse.
  | { name: 'teleport'; feet: Vec3 | null }
  | { name: 'unknown'; raw: string };

export const COMMAND_SHORTCUTS: Readonly<Partial<Record<string, ItemId | GearId | AvatarId | 'speedy'>>> = {
  g: 'gun',
  ft: 'flamethrower',
  ib: 'ice-blower',
  j: 'jetpack',
  s: 'speedy',
  wazowski: 'mike',
};

// The command a word stands for: itself unless it's a shortcut.
export function commandFor(word: string): string {
  return (Object.hasOwn(COMMAND_SHORTCUTS, word) && COMMAND_SHORTCUTS[word]) || word;
}

export function parseCommand(text: string): Command | null {
  if (!text.startsWith('/')) return null;

  const [raw, ...args] = text.slice(1).trim().split(/\s+/);
  const normalized = commandFor(raw.toLowerCase());

  if (normalized === 'speedy') return { name: 'speedy' };
  if (isItemId(normalized) && !ITEMS[normalized].own) return { name: 'equip', item: normalized };
  if (isGearId(normalized)) return { name: 'wear', gear: normalized };
  if (normalized === 'unequip') return { name: 'unequip' };
  const avatar = avatarForCommand(normalized);
  if (avatar) return { name: 'avatar', avatar };
  if (Object.hasOwn(NAMED_COLORS, normalized)) return { name: 'color', color: normalized };
  if (normalized === 'kill-bots') return { name: 'kill-bots' };
  if (normalized === 'teleport') return { name: 'teleport', feet: teleportTo(args) };
  const kart = KART_IDS.find((id) => KARTS[id].command === normalized);
  if (kart) return { name: 'kart', kart };
  const bot = botIdFor(normalized);
  if (bot) return botCommand(bot, args);
  return { name: 'unknown', raw };
}

export const TELEPORT_USAGE = 'usage: /teleport x y z (metres, y where your feet go)';

// "/teleport 120 0 -40": three numbers, nothing else.
function teleportTo(args: string[]): Vec3 | null {
  const n = args.map(Number);
  return n.length === 3 && n.every(Number.isFinite) ? { x: n[0], y: n[1], z: n[2] } : null;
}

// What a bot command asked for: how long the bot stays, what it's called (null: its own name), how
// it looks (null: its own look), and, for a combat bot, the name substrings it goes after.
export interface BotCallArgs {
  seconds: number;
  botName: string | null;
  avatar: AvatarId | null;
  targets: string[];
}

// "/sniper-bot -t 60 -n hunter -s tung --target kat bob": the flags in BOT_FLAGS (short or long
// form), in any order, each at most once, and only those the bot takes (botFlags). Anything else (a
// bare word, an unknown or repeated flag, a flag with no value or a bad one) makes it null, and the
// room answers with the usage line.
function botCommand(bot: BotId, args: string[]): Command {
  const bad: Command = { name: 'bot', bot, call: null };
  const call: BotCallArgs = { seconds: BOT_DEFAULT_SECONDS, botName: null, avatar: null, targets: [] };
  const given = new Set<BotFlag>();
  for (let i = 0; i < args.length; i++) {
    const flag = botFlagFor(args[i]);
    if (flag === null || given.has(flag) || !botFlags(bot).includes(flag)) return bad;
    given.add(flag);
    const value = (): string | null => (i + 1 < args.length && !args[i + 1].startsWith('-') ? args[++i] : null);
    switch (flag) {
      case 'time': {
        const n = Number(value());
        if (!Number.isFinite(n) || n <= 0) return bad;
        call.seconds = Math.min(BOT_MAX_SECONDS, Math.round(n));
        break;
      }
      case 'name':
        call.botName = value();
        if (call.botName === null) return bad;
        break;
      case 'skin':
        call.avatar = avatarForCommand(commandFor(value() ?? ''));
        if (call.avatar === null) return bad;
        break;
      case 'target':
        for (let word = value(); word !== null; word = value()) call.targets.push(word);
        if (call.targets.length === 0) return bad;
        break;
    }
  }
  return { name: 'bot', bot, call };
}
