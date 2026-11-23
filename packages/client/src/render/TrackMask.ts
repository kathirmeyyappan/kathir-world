// The track in play as the floor's shader reads it (shaders.ts): a picture of the world from above,
// a texel to every CELL metres round the track, each saying how far from the track's middle that
// spot is, at the height the track runs at there, for up to two levels of it (a deck and the road
// it goes over). The shader blends the four texels round a pixel, each read at the pixel's own
// height, so the track's edge comes out a clean line however coarse the picture. What's on the
// track is the sim's to say (sim/tracks.ts `onTrack`, which a kart's rescue goes by); this draws
// the same strip, from the same stretches of its middle.
import { LEVELS, ROAD_WIDTH, follows, shareNearest, type Track } from '@world/shared';

export const CELL = 4; // metres to a texel
export const TRACK_HALF = ROAD_WIDTH / 2; // a texel's reading at the track's edge: less is on it
// What a texel's bytes are worth: a reading from 0 (the middle) to EDGE_FAR and beyond (nowhere
// near it), and the height the track runs at.
export const EDGE_STEP = 0.1;
export const HEIGHT_STEP = 0.2;
const EDGE_FAR = 255 * EDGE_STEP;
// Metres from the middle that texels read it: past the edge by more than the shader blends across.
const REACH = TRACK_HALF + 3 * CELL;

export interface TrackMask {
  data: Uint8Array; // four bytes a texel: the nearest level's reading and height, then the other's
  width: number; // texels across (x) and deep (z)
  depth: number;
  x: number; // the world's x and z at its corner
  z: number;
}

export function trackMask(track: Track): TrackMask {
  const spots = track.spots;
  const x = Math.min(...spots.map((s) => s.x)) - REACH - CELL;
  const z = Math.min(...spots.map((s) => s.z)) - REACH - CELL;
  const width = Math.ceil((Math.max(...spots.map((s) => s.x)) + REACH + CELL - x) / CELL);
  const depth = Math.ceil((Math.max(...spots.map((s) => s.z)) + REACH + CELL - z) / CELL);
  // Each texel's nearest point of the middle, and its nearest on another level than that one: how
  // far off it is, and the track's height there.
  const off = [new Float32Array(width * depth).fill(Infinity), new Float32Array(width * depth).fill(Infinity)];
  const height = [new Float32Array(width * depth), new Float32Array(width * depth)];
  for (const level of [0, 1])
    for (let i = 0; i + 1 < spots.length; i++) {
      if (!follows(track, i)) continue;
      const [a, b] = [spots[i], spots[i + 1]];
      const [i0, i1] = [Math.min(a.x, b.x) - REACH, Math.max(a.x, b.x) + REACH].map((v) => Math.floor((v - x) / CELL));
      const [j0, j1] = [Math.min(a.z, b.z) - REACH, Math.max(a.z, b.z) + REACH].map((v) => Math.floor((v - z) / CELL));
      for (let tj = j0; tj <= j1; tj++)
        for (let ti = i0; ti <= i1; ti++) {
          const texel = tj * width + ti;
          const [cx, cz] = [x + (ti + 0.5) * CELL, z + (tj + 0.5) * CELL];
          const k = shareNearest(a, b, cx, cz);
          const d = Math.hypot(cx - (a.x + (b.x - a.x) * k), cz - (a.z + (b.z - a.z) * k));
          if (d > REACH || d >= off[level][texel]) continue;
          const y = a.y + (b.y - a.y) * k;
          if (level === 1 && Math.abs(y - height[0][texel]) <= LEVELS) continue;
          off[level][texel] = d;
          height[level][texel] = y;
        }
    }
  const data = new Uint8Array(width * depth * 4);
  for (let texel = 0; texel < width * depth; texel++)
    for (const level of [0, 1]) {
      // A texel with one level reads it for both, and one with none reads as nowhere near.
      const read = off[level][texel] < Infinity ? level : 0;
      data[texel * 4 + level * 2] = Math.round(Math.min(EDGE_FAR, off[read][texel]) / EDGE_STEP);
      data[texel * 4 + level * 2 + 1] = Math.round(height[read][texel] / HEIGHT_STEP);
    }
  return { data, width, depth, x, z };
}
