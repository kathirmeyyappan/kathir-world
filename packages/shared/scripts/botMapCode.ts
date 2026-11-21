// A hash of the sim code the bots' ground and moves are built by (`Simulated.code`): the text of
// botMap/ground.ts and of every file it imports to run, directly or through another, so a change
// to how a body walks, jumps or collides shows up here. Content files are followed but left out of
// the hash, since what they build is in the maps' sources by value, and so are imports of types
// alone, which run nothing.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashSeed } from '../src/sim/rng';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

// An import or re-export of something that runs, from another file of the package.
const IMPORT = /^(?:import|export)\s(?!type\s)[^;]*?from\s+'(\.[^']+)'/gm;

export function botMapCode(): number {
  const texts = new Map<string, string>();
  const queue = [join(SRC, 'sim/botMap/ground.ts')];
  for (let file = queue.pop(); file; file = queue.pop()) {
    if (texts.has(file)) continue;
    const text = readFileSync(file, 'utf8');
    texts.set(file, text);
    for (const [, path] of text.matchAll(IMPORT)) {
      const to = resolve(dirname(file), path);
      queue.push(existsSync(`${to}.ts`) ? `${to}.ts` : join(to, 'index.ts'));
    }
  }
  const code = [...texts]
    .map(([file, text]) => [relative(SRC, file).replaceAll('\\', '/'), text])
    .filter(([file]) => !file.startsWith('content/'))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return hashSeed(JSON.stringify(code));
}
