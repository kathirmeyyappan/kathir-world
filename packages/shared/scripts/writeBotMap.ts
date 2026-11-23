// `npm run bot-map`: brings the Python bots' maps of the world up to date (src/sim/botMap/), each
// its own file: the ones built at once whenever what they hold has changed, and the ground and the
// moves, which the sim builds slowly, only when not already built from what is here by this sim
// code, the slow work of each on every core at once (botMapHands.ts); deploy.sh runs it too. With
// `--keys` it only prints, for each of those two, what one built here would be built from, as
// `map=key` lines: the names CI keeps built ones under.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { buildBodiesMap } from '../src/sim/botMap/bodies';
import {
  buildGroundMap,
  buildMovesMap,
  groundMapSource,
  movesMapSource,
  type GroundMap,
  type MovesMap,
} from '../src/sim/botMap/ground';
import { buildKartsMap } from '../src/sim/botMap/karts';
import { buildRoadsMap } from '../src/sim/botMap/roads';
import { buildSolidsMap } from '../src/sim/botMap/solids';
import { botMapCode } from './botMapCode';
import { THREADS, manyHands, rest } from './botMapHands';

const DIR = new URL('../../../modal-bots/common/map/', import.meta.url);
const code = botMapCode();

function read<T>(map: string): T | null {
  const file = new URL(`${map}.json.gz`, DIR);
  return existsSync(file) ? (JSON.parse(gunzipSync(readFileSync(file)).toString()) as T) : null;
}

function write(map: string, built: object, what: string, began: number): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(new URL(`${map}.json.gz`, DIR), gzipSync(JSON.stringify(built), { level: 9 }));
  console.log(`wrote the ${map}: ${what}, in ${Math.round((performance.now() - began) / 1000)} s`);
}

// A map built at once: written when the file isn't what's built here now.
function instant<T extends { source: number }>(map: string, build: () => T, what: (built: T) => string): void {
  const began = performance.now();
  const built = build();
  if (read<T>(map)?.source === built.source) console.log(`the ${map} are up to date`);
  else write(map, built, what(built), began);
}

if (process.argv.includes('--keys')) {
  console.log(`ground=${groundMapSource()}-${code}`);
  console.log(`moves=${movesMapSource()}-${code}`);
} else {
  instant('solids', buildSolidsMap, (m) => `${m.structures.length} structures on ${m.floor.length} parts of floor`);
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
  instant(
    'roads',
    buildRoadsMap,
    (m) => `${m.nodes.length} nodes, ${m.edges.length} stretches, ${m.gaps.length} gaps, ${m.tracks.length} tracks`,
  );
  instant('bodies', buildBodiesMap, (m) => `${Object.keys(m.hitboxes).length} avatars`);
  instant('karts', buildKartsMap, (m) => `${Object.keys(m.karts).length} karts`);
}
