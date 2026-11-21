// `npm run bot-map`: brings the Python bots' map of the world up to date (src/sim/botMap.ts),
// building only the stages not already built from what is here, by this sim code, the slow work
// of each on every core at once (botMapHands.ts); deploy.sh runs it too. With `--keys` it only prints, for each stage the sim builds, what one built here would be
// built from, as `stage=key` lines: the names CI keeps built stages under.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  bodiesMapSource,
  buildBodiesMap,
  buildGroundMap,
  buildMovesMap,
  groundMapSource,
  movesMapSource,
  type BodiesMap,
  type GroundMap,
  type MovesMap,
} from '../src/sim/botMap';
import { botMapCode } from './botMapCode';
import { THREADS, manyHands, rest } from './botMapHands';

const DIR = new URL('../../../modal-bots/common/map/', import.meta.url);
const code = botMapCode();

function read<T>(stage: string): T | null {
  const file = new URL(`${stage}.json.gz`, DIR);
  return existsSync(file) ? (JSON.parse(gunzipSync(readFileSync(file)).toString()) as T) : null;
}

function write(stage: string, map: object, what: string, began: number): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(new URL(`${stage}.json.gz`, DIR), gzipSync(JSON.stringify(map), { level: 9 }));
  console.log(`wrote the ${stage}: ${what}, in ${Math.round((performance.now() - began) / 1000)} s`);
}

if (process.argv.includes('--keys')) {
  console.log(`ground=${groundMapSource()}-${code}`);
  console.log(`moves=${movesMapSource()}-${code}`);
} else {
  let ground = read<GroundMap>('ground');
  if (ground?.source === groundMapSource() && ground.code === code) console.log('the ground is up to date');
  else {
    const began = performance.now();
    ground = await buildGroundMap(code, manyHands);
    const walks = ground.edges.flat().length;
    const jumps = ground.jumps.flat().length;
    write(
      'ground',
      ground,
      `${ground.nodes.length} nodes, ${walks} walks, ${jumps} jumps, ${ground.lookouts.length} lookouts, on ${THREADS} threads`,
      began,
    );
  }
  const kept = read<MovesMap>('moves');
  if (kept?.source === movesMapSource() && kept.code === code) console.log('the moves are up to date');
  else {
    const began = performance.now();
    const moves = await buildMovesMap(ground, code, kept ?? undefined, manyHands);
    write('moves', moves, `${Object.keys(moves.jumps).length} ways of moving, on ${THREADS} threads`, began);
  }
  await rest();
  if (read<BodiesMap>('bodies')?.source === bodiesMapSource()) console.log('the bodies are up to date');
  else {
    const began = performance.now();
    const bodies = buildBodiesMap();
    write('bodies', bodies, `${Object.keys(bodies.hitboxes).length} avatars`, began);
  }
}
