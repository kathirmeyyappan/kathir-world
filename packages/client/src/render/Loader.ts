// Streams the world in round the player. Everything heavy that stands somewhere (a chunk of the
// ground's slab, a region's structure meshes, a model's part) registers here with where it is, and
// of those not yet begun the nearest to the player is begun first, so the player is in the world at
// once and it fills in round them nearest first. What can be let go again (it has an `unload`) is
// kept only while it's within REACH of the player, let go past REACH + SLACK and begun again as it
// comes back within reach, so the world costs what's round the player however big it grows, and
// walking back and forth across one line can't load and unload it over and over. REACH is past
// SCOPED_SIGHT, where even a scope sees all but nothing through the fog, so nothing is seen go.
// What can't (a building's rooms, which Interiors.ts lets go by its own rule) is begun once.
// These distances are set against the rest of the client's (CLAUDE.md, Client loading): audit
// them together.
//
// No frame waits on loading. A job is a generator that yields between pieces of its work, or yields
// a promise (a fetch) to be woken when it settles (`wait`), and each frame the loader runs the jobs
// that are ready, a step at a time, only until BUDGET_MS of the frame is spent; the rest carry on
// the next frame. So a big build costs a few frames a little each rather than one frame a lot, and
// one thing is let go a frame at most.
import { SCOPED_SIGHT } from '@world/shared';

const IN_FLIGHT = 3; // jobs begun and not yet done at once
const BUDGET_MS = 4; // of each frame the loader's jobs may take
const REACH = SCOPED_SIGHT + 40; // metres from a thing's edge within which it's wanted
const SLACK = 100; // metres further out past which it's let go
const CHECKS = 64; // things whose distance a frame looks at, round them all in turn

// What a job yields: nothing, to give the frame back if it's spent, or a promise to wait for.
export type Job = Generator<Promise<unknown> | void, void, unknown>;

export interface Loadable {
  x: number;
  z: number;
  r?: number; // metres round (x, z) it stands over: it's as far off as the nearest of it
  reach?: number; // metres within which it's wanted, where that's further than the loader's own: what's seen from further off
  load: () => Job;
  unload?: () => void;
}

// A circle on the floor: where a thing stands, and how far round that.
export interface Circle {
  x: number;
  z: number;
  r: number;
}

// The circle round several, for one thing made of whatever stands in each.
export function around(circles: readonly Circle[]): Circle {
  const middle = (low: number[], high: number[]) => (Math.min(...low) + Math.max(...high)) / 2;
  const x = middle(
    circles.map((c) => c.x - c.r),
    circles.map((c) => c.x + c.r),
  );
  const z = middle(
    circles.map((c) => c.z - c.r),
    circles.map((c) => c.z + c.r),
  );
  return { x, z, r: Math.max(...circles.map((c) => Math.hypot(c.x - x, c.z - z) + c.r)) };
}

// Waits for a promise inside a job and hands back what it came to: `const x = yield* wait(p)`. A
// promise that fails throws in the job, where it was waited on.
export function* wait<T>(promise: Promise<T>): Generator<Promise<unknown>, T, unknown> {
  const got: { settled?: { value: T } | { error: unknown } } = {};
  yield promise.then(
    (value) => void (got.settled = { value }),
    (error: unknown) => void (got.settled = { error }),
  );
  if (!got.settled) throw new Error('woken before its promise settled');
  if ('error' in got.settled) throw got.settled.error;
  return got.settled.value;
}

// A thing and where it has got to: waiting its turn, being loaded (its job), here, or let go and
// out of reach.
interface Thing {
  item: Loadable;
  status: 'pending' | 'loading' | 'here' | 'gone';
}

interface Running {
  thing: Thing;
  job: Job;
  waiting: boolean;
}

export class Loader {
  // Metres within which what can be let go is wanted: REACH, but for checking the streaming closer to.
  reach = REACH;
  private readonly things: Thing[] = [];
  private readonly running: Running[] = [];
  private next = 0; // where this frame's distance checks start, round `things`

  add(item: Loadable): void {
    this.things.push({ item, status: 'pending' });
  }

  // Once a frame, with the player at (x, z): lets one far thing go and brings back what's come within
  // reach, CHECKS things a frame; begins the nearest pending things while there's room for them;
  // then steps the jobs that aren't waiting, round and round, until they're all waiting or done or
  // the frame's budget is spent.
  update(x: number, z: number): void {
    const start = performance.now();
    let letGo = false;
    for (let k = 0; k < Math.min(CHECKS, this.things.length); k++) {
      const thing = this.things[(this.next + k) % this.things.length];
      if (!thing.item.unload) continue;
      const off = distance(thing.item, x, z);
      const reach = thing.item.reach ?? this.reach;
      if (thing.status === 'gone' && off <= reach) thing.status = 'pending';
      else if (thing.status === 'pending' && off > reach) thing.status = 'gone';
      else if (thing.status === 'here' && off > reach + SLACK && !letGo) {
        thing.item.unload();
        thing.status = 'gone';
        letGo = true;
      }
    }
    this.next = (this.next + CHECKS) % Math.max(1, this.things.length);
    while (this.running.length < IN_FLIGHT) {
      const thing = this.nearest(x, z);
      if (!thing) break;
      thing.status = 'loading';
      this.running.push({ thing, job: thing.item.load(), waiting: false });
    }
    let stepped = true;
    while (stepped && performance.now() - start < BUDGET_MS) {
      stepped = false;
      for (const run of [...this.running]) {
        if (run.waiting) continue;
        stepped = true;
        this.step(run);
        if (performance.now() - start >= BUDGET_MS) break;
      }
    }
  }

  // Whether nothing is waiting to be begun or being loaded.
  get settled(): boolean {
    return this.running.length === 0 && this.things.every((t) => t.status !== 'pending');
  }

  private step(run: Running): void {
    let next: IteratorResult<Promise<unknown> | void, void>;
    try {
      next = run.job.next();
    } catch (e: unknown) {
      console.error('loading', e);
      run.thing.status = 'gone'; // tried again as it next comes within reach, if it can be
      this.drop(run);
      return;
    }
    if (next.done) {
      run.thing.status = 'here';
      this.drop(run);
    } else if (next.value) {
      run.waiting = true;
      const wake = () => void (run.waiting = false);
      next.value.then(wake, wake);
    }
  }

  private drop(run: Running): void {
    this.running.splice(this.running.indexOf(run), 1);
  }

  private nearest(x: number, z: number): Thing | null {
    let best: Thing | null = null;
    let bestD = Infinity;
    for (const thing of this.things) {
      if (thing.status !== 'pending') continue;
      const d = distance(thing.item, x, z);
      if (d < bestD) {
        best = thing;
        bestD = d;
      }
    }
    return best;
  }
}

// Metres from (x, z) to the nearest of a thing.
function distance(item: Loadable, x: number, z: number): number {
  return Math.max(0, Math.hypot(item.x - x, item.z - z) - (item.r ?? 0));
}
