// `npm run bot-map`: rebuilds the Python bots' map of the world (src/sim/botMap.ts). With
// `--if-stale` it leaves alone a map already built from this world by this sim code, which is how
// a deploy runs it; with `--key` it only prints what a map built here would be built from, the
// name CI keeps a built map under.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { botMapSource, buildBotMap, type BotMap } from '../src/sim/botMap';
import { botMapCode } from './botMapCode';

const out = new URL('../../../modal-bots/common/world_map.json.gz', import.meta.url);
const source = botMapSource();
const code = botMapCode();

function upToDate(): boolean {
  if (!existsSync(out)) return false;
  const map = JSON.parse(gunzipSync(readFileSync(out)).toString()) as BotMap;
  return map.source === source && map.code === code;
}

if (process.argv.includes('--key')) {
  console.log(`${source}-${code}`);
} else if (process.argv.includes('--if-stale') && upToDate()) {
  console.log(`the bot map at ${out.pathname} is up to date`);
} else {
  const map = buildBotMap(code);
  writeFileSync(out, gzipSync(JSON.stringify(map), { level: 9 }));
  console.log(
    `wrote ${map.nodes.length} nodes, ${map.edges.flat().length} walks, ${map.jumps.flat().length} jumps and ${map.lookouts.length} lookouts to ${out.pathname}`,
  );
}
