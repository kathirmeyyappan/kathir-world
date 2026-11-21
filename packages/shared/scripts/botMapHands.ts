// The bots' map's shares (src/sim/botMap.ts `Share`) done on every core at once: a worker thread a
// core (botMapHand.ts), each with the stage's nodes, taking the next share as it finishes its last,
// so no core waits on a slow one. The threads of one stage are kept for the next that has the same
// nodes (each way of moving's jumps are a stage of their own over one ground), and `rest` lets
// them go.
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { Hands, Share, Shared } from '../src/sim/botMap';
import type { Vec3 } from '../src/sim/types';

export const THREADS = availableParallelism();

let kept: { nodes: Vec3[]; workers: Worker[] } | null = null;

export const manyHands: Hands = (nodes, spots, shares) => {
  if (kept?.nodes !== nodes) {
    void rest();
    // Three numbers a node, as they are: a worker makes its own nodes of them.
    const flat = Float64Array.from(nodes.flatMap((n) => [n.x, n.y, n.z]));
    const hand = new URL('./botMapHand.ts', import.meta.url);
    kept = { nodes, workers: Array.from({ length: THREADS }, () => new Worker(hand, { workerData: { flat, spots } })) };
  }
  const { workers } = kept;
  return new Promise((resolve, reject) => {
    const done: Shared[] = new Array(shares.length);
    let [next, left] = [0, shares.length];
    if (left === 0) resolve(done);
    for (const worker of workers) {
      const give = () => {
        if (next < shares.length) worker.postMessage({ k: next, share: shares[next++] } satisfies Given);
      };
      worker.removeAllListeners();
      worker.on('error', reject);
      worker.on('message', ({ k, shared }: { k: number; shared: Shared }) => {
        done[k] = shared;
        if (--left === 0) resolve(done);
        else give();
      });
      give();
    }
  });
};

// A share handed to a worker, and where its result goes.
export interface Given {
  k: number;
  share: Share;
}

// Lets the threads go, so the process can end.
export async function rest(): Promise<void> {
  const workers = kept?.workers ?? [];
  kept = null;
  await Promise.all(workers.map((worker) => worker.terminate()));
}
