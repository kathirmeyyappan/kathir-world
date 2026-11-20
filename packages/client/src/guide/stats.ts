// The guide's numbers, read off the registries the game runs on (AVATARS, ITEMS, GEAR, KARTS,
// PICKUPS and the constants), so a change to the game is a change here with no one remembering to
// make it. Everything is worked out the way the sim does it: a spray's damage a second from its
// damage a tick and how often it ticks.
import {
  AVATARS,
  BOT_DEFAULT_SECONDS,
  BOT_FLAGS,
  botFlags,
  BOT_MAX_SECONDS,
  CHILL_SECONDS,
  CHILLED_SPEED_MULTIPLIER,
  DRIFT_FROM,
  FUEL_REFILL_RATE,
  GEAR,
  GRAVITY,
  HEADSHOT_MULTIPLIER,
  ITEMS,
  JUMP_RISE,
  KARTS,
  PICKUPS,
  PICKUP_AREAS,
  REGEN_RATE,
  RUN_MULTIPLIER,
  SCOPED_SPEED_MULTIPLIER,
  SPARKS,
  SPEEDY_MULTIPLIER,
  SPEEDY_SECONDS,
  TICK_RATE,
  TURBO,
  climbSpeedOf,
  dragonShape,
  jumpVelocityOf,
  chainOf,
  leapOf,
  lifeOf,
  poundOf,
  strikeOf,
  crouchOf,
  floatOf,
  walkSpeedOf,
  type AvatarId,
  type BotFlag,
  type BotId,
  type GearId,
  type ItemId,
  type KartId,
  type PickupKind,
} from '@world/shared';

export interface Stat {
  label: string;
  value: string;
}

// A number as the guide shows it: at most two decimals, none when it's whole.
export function num(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

// A key as a person reads it: KeyF is F.
function keyName(code: string): string {
  return code.startsWith('Key') ? code.slice(3) : code;
}

export function characterStats(id: AvatarId): Stat[] {
  const look = AVATARS[id];
  const life = lifeOf(id);
  const rows: Stat[] = [];
  if (look.command) rows.push({ label: 'Equip', value: `/${look.command}` });
  rows.push({ label: life.sprite === 'crystal' ? 'Crystals' : 'Hearts', value: num(life.hearts) });
  if (look.regen) rows.push({ label: 'Regen', value: `${num(REGEN_RATE)} hearts/s` });
  if (look.class === 'walker') {
    rows.push(
      { label: 'Height', value: `${num(look.hitbox.top)} m` },
      { label: 'Walk', value: `${num(walkSpeedOf(id))} m/s` },
      { label: 'Jump power', value: num(look.jump) },
      { label: 'Ladder climb', value: `${num(climbSpeedOf(id))} m/s` },
      { label: 'Hitbox width', value: `${num(2 * look.hitbox.radius)} m` },
    );
  } else {
    const shape = dragonShape(id);
    rows.push(
      { label: 'Length', value: `${num(shape.links.reduce((a, b) => a + b, 0))} m` },
      { label: 'Speed', value: `${num(shape.cruise)} m/s` },
      { label: 'Turning radius', value: `${num(shape.turnRadius)} m` },
    );
  }
  return rows;
}

// What a character can do that the rest can't, each with its own numbers.
export type AbilityId = 'leap' | 'pound' | 'chain' | 'crouch' | 'backflip' | 'strike' | 'float';

// A special ability: which it is, the keys that do it (for its heading), and its numbers.
export interface Ability {
  id: AbilityId;
  use: string;
  stats: Stat[];
}

// A character's special abilities, read off its row: none for most.
export function abilityStats(id: AvatarId): Ability[] {
  return [
    ...leapStats(id),
    ...chainStats(id),
    ...floatStats(id),
    ...poundStats(id),
    ...crouchStats(id),
    ...strikeStats(id),
  ];
}

function strikeStats(id: AvatarId): Ability[] {
  const strike = strikeOf(id);
  if (!strike) return [];
  return [
    {
      id: 'strike',
      use: 'X',
      stats: [
        { label: 'Damage', value: `${num(strike.damage)} hearts` },
        { label: 'Reach', value: `${num(strike.reach)} m` },
        { label: 'Knockback', value: `${num(strike.knock.speed)} m/s` },
        { label: 'Time between swings', value: `${num(strike.windup + strike.recover)} s` },
      ],
    },
  ];
}

function chainStats(id: AvatarId): Ability[] {
  const chain = chainOf(id);
  const look = AVATARS[id];
  if (!chain || look.class !== 'walker') return [];
  const heights = Array.from({ length: chain.jumps }, (_, n) => JUMP_RISE * look.jump * chain.rise ** n);
  return [
    {
      id: 'chain',
      use: 'Space as you land',
      stats: [
        { label: 'Heights', value: `${heights.map(num).join(', ')} m` },
        { label: 'Time to jump again', value: `${num(chain.gap)} s` },
      ],
    },
  ];
}

function floatStats(id: AvatarId): Ability[] {
  const float = floatOf(id);
  if (!float) return [];
  return [
    {
      id: 'float',
      use: 'hold Space in the air',
      stats: [
        { label: 'Time', value: `${num(float.seconds)} s` },
        { label: 'Sink speed', value: `${num(float.sink)} m/s` },
      ],
    },
  ];
}

function crouchStats(id: AvatarId): Ability[] {
  const crouch = crouchOf(id);
  const look = AVATARS[id];
  if (!crouch || look.class !== 'walker') return [];
  return [
    {
      id: 'crouch',
      use: 'hold X',
      stats: [{ label: 'Crawl speed', value: `${num(look.walk * crouch.crawl)} m/s` }],
    },
    {
      id: 'backflip',
      use: 'Space while crouched',
      stats: [{ label: 'Height', value: `${num(JUMP_RISE * look.jump * crouch.flip)} m` }],
    },
  ];
}

function poundStats(id: AvatarId): Ability[] {
  const pound = poundOf(id);
  if (!pound) return [];
  return [
    {
      id: 'pound',
      use: 'X in the air',
      stats: [
        { label: 'Ground pound damage', value: `${num(pound.damage)} hearts` },
        { label: 'Reach', value: `${num(pound.reach)} m` },
        { label: 'Knockback', value: `${num(pound.knock.speed)} m/s` },
        { label: 'Drop speed', value: `${num(pound.speed)} m/s` },
      ],
    },
  ];
}

function leapStats(id: AvatarId): Ability[] {
  const leap = leapOf(id);
  if (!leap) return [];
  // The long jump as walker.ts flies it: up at a share of the jump under a share of gravity, across
  // at a multiple of the run, for as long as that keeps it in the air.
  const speed = walkSpeedOf(id) * RUN_MULTIPLIER * leap.speed;
  const up = jumpVelocityOf(id) * Math.sqrt(leap.rise * leap.float);
  const seconds = (2 * up) / (GRAVITY * leap.float);
  const jump = AVATARS[id];
  return [
    {
      id: 'leap',
      use: 'Shift + Space',
      stats: [
        { label: 'Distance', value: `${num(speed * seconds)} m` },
        { label: 'Height', value: `${num(JUMP_RISE * (jump.class === 'walker' ? jump.jump : 1) * leap.rise)} m` },
        { label: 'Speed', value: `${num(speed)} m/s` },
      ],
    },
  ];
}

export function itemStats(id: ItemId): Stat[] {
  const spec = ITEMS[id];
  const perSecond = TICK_RATE / spec.cooldownTicks;
  const rows: Stat[] = [];
  // A dragon's breath comes with its look, and that look's command is how to get it.
  const owner = (Object.keys(AVATARS) as AvatarId[]).find((a) => AVATARS[a].item === id);
  const command = spec.own && owner ? AVATARS[owner].command : id;
  if (command) rows.push({ label: 'Equip', value: `/${command}` });
  if (spec.actions.scope?.key)
    rows.push(
      { label: 'Scope key', value: keyName(spec.actions.scope.key) },
      { label: 'Scoped walk', value: `${num(SCOPED_SPEED_MULTIPLIER * 100)}%` },
    );
  if (spec.actions.shoot?.mode === 'hold') {
    rows.push({ label: 'DPS', value: num(spec.damage * perSecond) });
  } else {
    rows.push(
      { label: 'Damage', value: num(spec.damage) },
      { label: 'Headshot', value: num(spec.damage * HEADSHOT_MULTIPLIER) },
      { label: 'Fire rate', value: `${num(perSecond)}/s` },
      { label: 'DPS', value: num(spec.damage * perSecond) },
    );
  }
  rows.push({ label: 'Range', value: `${num(spec.range)} m` });
  if (spec.fire.kind === 'cone')
    rows.push({ label: 'Spray cone', value: `${num((2 * spec.fire.halfAngle * 180) / Math.PI)}°` });
  if (spec.fuelSeconds !== null)
    rows.push(
      { label: 'Fuel', value: `${num(spec.fuelSeconds)} s` },
      { label: 'Refill', value: `${num(spec.fuelSeconds / FUEL_REFILL_RATE)} s` },
    );
  if (spec.element === 'ice')
    rows.push(
      { label: 'Chill duration', value: `${num(CHILL_SECONDS)} s` },
      { label: 'Chilled walk', value: `${num(CHILLED_SPEED_MULTIPLIER * 100)}%` },
    );
  return rows;
}

export function gearStats(id: GearId): Stat[] {
  const spec = GEAR[id];
  const thrust = spec.actions.thrust?.key;
  return [
    { label: 'Equip', value: `/${id}` },
    ...(thrust ? [{ label: 'Thrust key', value: keyName(thrust) }] : []),
    { label: 'Duration', value: `${num(spec.seconds)} s` },
    { label: 'Fuel', value: `${num(spec.fuelSeconds)} s` },
    { label: 'Lift', value: `${num(spec.lift - GRAVITY)} m/s²` },
    { label: 'Max rise', value: `${num(spec.maxRise)} m/s` },
    { label: 'Brake', value: `${num(spec.brake - GRAVITY)} m/s²` },
  ];
}

export function kartStats(id: KartId): Stat[] {
  const spec = KARTS[id];
  return [
    { label: 'Drop', value: `/${spec.command}` },
    { label: 'Top speed', value: `${num(spec.speed)} m/s` },
    { label: 'Boosted speed', value: `${num(spec.speed * TURBO.boost)} m/s` },
    { label: 'Acceleration', value: `${num(spec.acceleration)} s` },
    { label: 'Turning circle', value: `${num(spec.handling)} m` },
    { label: 'Weight', value: num(spec.weight) },
    { label: 'Wrenches', value: num(spec.wrenches) },
  ];
}

const SPARK_NAMES = ['Blue', 'Yellow', 'Purple'];

// What a drift comes to in a kart, as kart.ts works it out: only what its row in KARTS changes,
// since what every kart shares is no help choosing one.
export function kartMoves(id: KartId): { title: string; stats: Stat[] }[] {
  const spec = KARTS[id];
  return [
    {
      title: 'Drift',
      stats: [
        { label: 'Least speed', value: `${num(DRIFT_FROM * spec.speed)} m/s` },
        ...SPARKS.map(({ after }, i) => ({
          label: `${SPARK_NAMES[i]} spark`,
          value: `${num(after * spec.miniTurboTime)} s`,
        })),
      ],
    },
  ];
}

export function pickupStats(kind: PickupKind): Stat[] {
  const heals = PICKUPS[kind].heals;
  // A full life's worth, on foot, where a pickup heals everything.
  const hearts = heals === Infinity ? lifeOf('standard').hearts : heals;
  const rows: Stat[] = [{ label: 'Heals', value: num(hearts) }];
  const areas = PICKUP_AREAS.filter((a) => a.kind === kind);
  if (areas.length > 0)
    rows.push(
      { label: 'Count', value: `${areas.reduce((n, a) => n + a.count, 0)}` },
      { label: 'Respawn', value: `${num(Math.max(...areas.map((a) => a.respawnSeconds)))} s` },
    );
  return rows;
}

export function speedyStats(): Stat[] {
  return [
    { label: 'Equip', value: '/speedy' },
    { label: 'Speed', value: `×${num(SPEEDY_MULTIPLIER)}` },
    { label: 'Duration', value: `${num(SPEEDY_SECONDS)} s` },
  ];
}

// The flags a bot takes, each with what it does and the defaults the parser applies.
export function botFlagRows(bot: BotId, text: Record<BotFlag, string>): Stat[] {
  return botFlags(bot).map((f) => {
    const flag = BOT_FLAGS[f];
    const forms = [flag.short, flag.long].filter((s) => s !== null).join(', ');
    const extra = f === 'time' ? `; ${num(BOT_DEFAULT_SECONDS)} unless given, up to ${num(BOT_MAX_SECONDS)}` : '';
    return { label: `${forms} [${flag.value}]`, value: `${text[f]}${extra}` };
  });
}
