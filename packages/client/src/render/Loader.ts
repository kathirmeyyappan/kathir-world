// Streams the world in. Everything heavy that stands somewhere (a region's structure meshes to
// build, a model to fetch) registers here with where it is, and the nearest things not yet begun are
// begun first, so the player is in the world at once and it fills in round them nearest first, the
// far side within a second or two. Nothing waits on distance: a scope sees the far side of the
// world as sharp as the near, so it all comes, only in the order it matters.
//
// No frame waits on loading. A job is a generator that yields between pieces of its work, or yields
// a promise (a fetch) to be woken when it settles (`wait`), and each frame the loader runs the jobs
// that are ready, a step at a time, only until BUDGET_MS of the frame is spent; the rest carry on
// the next frame. So a big build costs a few frames a little each rather than one frame a lot.
const IN_FLIGHT = 3; // jobs begun and not yet done at once
const BUDGET_MS = 4; // of each frame the loader's jobs may take

// What a job yields: nothing, to give the frame back if it's spent, or a promise to wait for.
export type Job = Generator<Promise<unknown> | void, void, unknown>;

export interface Loadable {
  x: number;
  z: number;
  load: () => Job;
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

interface Running {
  job: Job;
  waiting: boolean;
}

export class Loader {
  private readonly pending: Loadable[] = [];
  private readonly running: Running[] = [];

  add(item: Loadable): void {
    this.pending.push(item);
  }

  // Once a frame: begins the nearest pending things to (x, z) while there's room for them, then
  // steps the jobs that aren't waiting, round and round, until they're all waiting or done or the
  // frame's budget is spent.
  update(x: number, z: number): void {
    const start = performance.now();
    while (this.running.length < IN_FLIGHT && this.pending.length > 0)
      this.running.push({ job: this.nearest(x, z).load(), waiting: false });
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

  private step(run: Running): void {
    let next: IteratorResult<Promise<unknown> | void, void>;
    try {
      next = run.job.next();
    } catch (e: unknown) {
      console.error('loading', e);
      this.drop(run);
      return;
    }
    if (next.done) this.drop(run);
    else if (next.value) {
      run.waiting = true;
      const wake = () => void (run.waiting = false);
      next.value.then(wake, wake);
    }
  }

  private drop(run: Running): void {
    this.running.splice(this.running.indexOf(run), 1);
  }

  private nearest(x: number, z: number): Loadable {
    let best = 0;
    let bestD = Infinity;
    this.pending.forEach((item, i) => {
      const d = Math.hypot(item.x - x, item.z - z);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return this.pending.splice(best, 1)[0];
  }
}
