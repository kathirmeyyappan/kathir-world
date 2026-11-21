// `npm run bot-map`: brings the Python bots' map of the world up to date (src/sim/botMap.ts),
// building only the stages not already built from what is here, by this sim code; deploy.sh runs
// it too. With `--keys` it only prints, for each stage the sim builds, what one built here would be
// built from, as `stage=key` lines: the names CI keeps built stages under.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  bodiesMapSource,
  buildBodiesMap,
  buildGroundMap,
  buildMovesMap,
  buildOutlineMap,
  groundMapSource,
  movesMapSource,
  outlineMapSource,
  type BodiesMap,
  type GroundMap,
  type MovesMap,
  type OutlineMap,
} from '../src/sim/botMap';
import { botMapCode } from './botMapCode';

const DIR = new URL('../../../modal-bots/common/map/', import.meta.url);
const code = botMapCode();

function read<T>(stage: string): T | null {
  const file = new URL(`${stage}.json.gz`, DIR);
  return existsSync(file) ? (JSON.parse(gunzipSync(readFileSync(file)).toString()) as T) : null;
}

function write(stage: string, map: object, what: string): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(new URL(`${stage}.json.gz`, DIR), gzipSync(JSON.stringify(map), { level: 9 }));
  console.log(`wrote the ${stage}: ${what}`);
}

if (process.argv.includes('--keys')) {
  console.log(`ground=${groundMapSource()}-${code}`);
  console.log(`moves=${movesMapSource()}-${code}`);
} else {
  let ground = read<GroundMap>('ground');
  if (ground?.source === groundMapSource() && ground.code === code) console.log('the ground is up to date');
  else {
    ground = buildGroundMap(code);
    const walks = ground.edges.flat().length;
    const jumps = ground.jumps.flat().length;
    write(
      'ground',
      ground,
      `${ground.nodes.length} nodes, ${walks} walks, ${jumps} jumps, ${ground.lookouts.length} lookouts`,
    );
  }
  const kept = read<MovesMap>('moves');
  if (kept?.source === movesMapSource() && kept.code === code) console.log('the moves are up to date');
  else {
    const moves = buildMovesMap(ground, code, kept ?? undefined);
    write('moves', moves, `${Object.keys(moves.jumps).length} ways of moving`);
  }
  if (read<BodiesMap>('bodies')?.source === bodiesMapSource()) console.log('the bodies are up to date');
  else {
    const bodies = buildBodiesMap();
    write('bodies', bodies, `${Object.keys(bodies.hitboxes).length} avatars`);
  }
  if (read<OutlineMap>('outline')?.source === outlineMapSource()) console.log('the outline is up to date');
  else {
    const outline = buildOutlineMap();
    write('outline', outline, `${outline.parts.length} parts`);
  }
}
