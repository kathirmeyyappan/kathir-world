// One of the threads the bots' map's shares are done on (botMapHands.ts): it's given the stage's
// nodes as it starts, and then a share at a time, and sends back what each comes to.
import { parentPort, workerData } from 'node:worker_threads';
import { doShare } from '../src/sim/botMap';
import type { Vec3 } from '../src/sim/types';
import type { Given } from './botMapHands';

const { flat, spots } = workerData as { flat: Float64Array; spots: number };
const nodes: Vec3[] = Array.from({ length: flat.length / 3 }, (_, i) => ({
  x: flat[3 * i],
  y: flat[3 * i + 1],
  z: flat[3 * i + 2],
}));
parentPort!.on('message', ({ k, share }: Given) =>
  parentPort!.postMessage({ k, shared: doShare(nodes, spots, share) }),
);
