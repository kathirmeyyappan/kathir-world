// The track in play as the floor's shader reads it (shaders.ts): a picture of the world from above,
// a texel to every CELL metres round the track, each saying how far across the track that spot is,
// at the height the track runs at there, for up to two levels of it (a deck and the road it goes
// over). The shader blends the four texels round a pixel, each read at the pixel's own height, so
// the track's edge comes out a clean line however coarse the picture. What's on the track is the
// sim's to say (sim/tracks.ts `onTrack`, which a kart's rescue goes by); this draws the same strip.
import { ROAD_WIDTH, type Track, type TrackSpot } from '@world/shared';

export const CELL = 4; // metres to a texel
export const TRACK_HALF = ROAD_WIDTH / 2; // a texel's reading at the track's edge: less is on it
// What a texel's bytes are worth: a reading from 0 (the middle) to EDGE_FAR and beyond (nowhere
// near it), and the height the track runs at.
export const EDGE_STEP = 0.1;
export const HEIGHT_STEP = 0.2;
const EDGE_FAR = 255 * EDGE_STEP;
// Metres from a spot of the middle that texels read it: past the edge by more than the shader
// blends across.
const REACH = TRACK_HALF + 3 * CELL;
// Metres apart in height that two stretches of a track are different levels of it, as the sim
// tells a deck from the road under it.
export const LEVELS = 4;

export interface TrackMask {
  data: Uint8Array; // four bytes a texel: the lower level's reading and height, then the upper's
  width: number; // texels across (x) and deep (z)
  depth: number;
  x: number; // the world's x and z at its corner
  z: number;
}

// A spot's reading of (x, z): how far across the track from its middle, and past either end of the
// track, as far as that is beyond it.
function reading(track: Track, s: TrackSpot, x: number, z: number): number {
  const [fx, fz] = [Math.sin(s.yaw), Math.cos(s.yaw)];
  const [dx, dz] = [x - s.x, z - s.z];
  const at = s.at + dx * fx + dz * fz;
  const off = Math.abs(dx * fz - dz * fx);
  return Math.min(EDGE_FAR, Math.max(off, TRACK_HALF - at, TRACK_HALF + at - track.route.length));
}

export function trackMask(track: Track): TrackMask {
  const spots = track.spots;
  const x = Math.min(...spots.map((s) => s.x)) - REACH - CELL;
  const z = Math.min(...spots.map((s) => s.z)) - REACH - CELL;
  const width = Math.ceil((Math.max(...spots.map((s) => s.x)) + REACH + CELL - x) / CELL);
  const depth = Math.ceil((Math.max(...spots.map((s) => s.z)) + REACH + CELL - z) / CELL);
  // Each texel's nearest spot, and its nearest on another level than that one.
  const nearest = [new Int32Array(width * depth).fill(-1), new Int32Array(width * depth).fill(-1)];
  const distance = [new Float32Array(width * depth).fill(Infinity), new Float32Array(width * depth).fill(Infinity)];
  for (const level of [0, 1])
    spots.forEach((s, i) => {
      const [i0, i1] = [Math.floor((s.x - REACH - x) / CELL), Math.ceil((s.x + REACH - x) / CELL)];
      const [j0, j1] = [Math.floor((s.z - REACH - z) / CELL), Math.ceil((s.z + REACH - z) / CELL)];
      for (let tj = j0; tj < j1; tj++)
        for (let ti = i0; ti < i1; ti++) {
          const texel = tj * width + ti;
          const d = Math.hypot(x + (ti + 0.5) * CELL - s.x, z + (tj + 0.5) * CELL - s.z);
          if (d > REACH || d >= distance[level][texel]) continue;
          if (level === 1 && Math.abs(s.y - spots[nearest[0][texel]].y) <= LEVELS) continue;
          distance[level][texel] = d;
          nearest[level][texel] = i;
        }
    });
  const data = new Uint8Array(width * depth * 4);
  for (let texel = 0; texel < width * depth; texel++) {
    const [cx, cz] = [x + ((texel % width) + 0.5) * CELL, z + (Math.floor(texel / width) + 0.5) * CELL];
    const first = nearest[0][texel];
    for (const level of [0, 1]) {
      // A texel with one level reads it for both, and one with none reads as nowhere near.
      const spot = spots[nearest[level][texel] >= 0 ? nearest[level][texel] : first];
      data[texel * 4 + level * 2] = spot ? Math.round(reading(track, spot, cx, cz) / EDGE_STEP) : 255;
      data[texel * 4 + level * 2 + 1] = spot ? Math.round(spot.y / HEIGHT_STEP) : 0;
    }
  }
  return { data, width, depth, x, z };
}
