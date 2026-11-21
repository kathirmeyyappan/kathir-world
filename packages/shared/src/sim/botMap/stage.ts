// What every one of the bots' maps (index.ts) carries: a fingerprint of what it was built from, so
// its file can be told from one that's out of date.
import { hashSeed } from '../rng';

// A map the sim builds slowly: what it was built from, and the code that built it
// (scripts/botMapCode.ts).
export interface Simulated {
  source: number;
  code: number;
}

// A map built at once, stamped with a hash of all it holds: its file is up to date exactly when
// it's what would be built now.
export function stamped<T extends object>(map: T): T & { source: number } {
  return { source: hashSeed(JSON.stringify(map)), ...map };
}
