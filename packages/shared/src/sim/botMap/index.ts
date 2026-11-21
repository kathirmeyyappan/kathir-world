// The world as the Python bots (modal-bots/) see it. Bots run no sim of their own, so whatever one
// needs to know of the world is a map worked out here with the real sim, each a file of its own in
// modal-bots/common/map/ beside the module that reads it, and a bot reads only the ones it needs:
// - the solids (solids.ts): the floor's parts and every structure, for line of sight and for where
//   there's ground to stand on, anywhere in the world;
// - the ground and the moves (ground.ts): a graph of where a body walks over the floor the
//   buildings stand on, and each way of moving's jumps across it, for finding a way on foot;
// - the bodies (bodies.ts): every avatar's hitbox, eyes, walk and way of moving.
// `npm run bot-map` (scripts/writeBotMap.ts) builds them. Each carries a fingerprint of what it was
// built from (its `source`), so a change rebuilds only the maps it touches, and a test fails while
// a file's no longer matches. The ground and the moves, which take minutes, carry a hash of the sim
// code that built them as well (scripts/botMapCode.ts), which no test holds them to: a deploy
// builds either afresh when its source or its code is off (deploy.sh).
import { buildBodiesMap } from './bodies';
import { groundMapSource, movesMapSource } from './ground';
import { buildSolidsMap } from './solids';

// Every map by its file's name, with the source a file of it built here and now would carry.
export const MAP_SOURCES: Record<string, () => number> = {
  solids: () => buildSolidsMap().source,
  ground: groundMapSource,
  moves: movesMapSource,
  bodies: () => buildBodiesMap().source,
};
