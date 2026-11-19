// The world as the sim knows it: the structures standing on the ground (ground.ts, outline.ts),
// indexed for the sim's queries (collision.ts). The Room keeps its own copy, since its doors swing
// and its frost lies apart from every other room's.
import { STRUCTURES } from '../content/structures';
import { Structures } from './collision';

export const WORLD_STRUCTURES = new Structures(STRUCTURES);
