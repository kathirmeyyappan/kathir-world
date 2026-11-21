// GLSL for the environment. Kept in one place so the ground and sky share helpers.
import { OUTSIDE_HEIGHT } from '@world/shared';
import { BASE_FOG_DENSITY } from './Engine';
import { KERB_HEIGHT, KERB_WIDTH } from './Floor';

// The floor's fog: 1 - exp(-d² × GROUND_FOG × fogScale) at d metres from the camera, the scene's
// own EXP2 fog, so the floor under anything far off fades exactly as much as it does.
export const GROUND_FOG = BASE_FOG_DENSITY ** 2;

// The sky's colour in a direction: at the horizon and under it the haze the ground past the edge
// fades to (the sky's `fogColor`), so the two meet as one, the glow above that, and the dark
// overhead. Needs fogColor declared first.
const SKY_GRADIENT = `
uniform vec3 zenithColor;
uniform vec3 horizonColor;

vec3 skyColor(vec3 dir) {
  vec3 col = mix(horizonColor, zenithColor, pow(clamp(dir.y, 0.0, 1.0), 0.6));
  return mix(fogColor, col, smoothstep(-0.02, 0.12, dir.y));
}
`;

// How bright a surface bent out of the level is, from its normal: 1 level, darker as it tips, and
// lighter on the slopes facing RELIEF_LIGHT than on those facing away, so a ridge reads as one.
// GroundRipple.ts shades a structure's top the same way on the CPU (reliefShade there).
export const RELIEF_LIGHT = { x: 0.6, z: -0.8 }; // level, unit length
export const RELIEF_TILT = 0.9; // darkening from level to a slope of 45 degrees, about
export const RELIEF_SIDE = 0.9; // the difference between a slope facing the light and one facing away
// How much of a ripple's glow it shines with (reliefLight): RELIEF_POOL in the middle, falling off
// to nothing at the rim as (1 - out)^RELIEF_FALLOFF with `out` its share of the radius, and
// RELIEF_CREST more at a crest's full height.
export const RELIEF_POOL = 0.8;
export const RELIEF_FALLOFF = 1.4;
export const RELIEF_CREST = 0.3;
const RELIEF_SHADE = `
float reliefLight(float out_, float crest, float strength) {
  return strength * ${RELIEF_POOL.toFixed(2)} * pow(max(0.0, 1.0 - out_), ${RELIEF_FALLOFF.toFixed(2)}) + ${RELIEF_CREST.toFixed(2)} * crest;
}

float reliefShade(vec3 n) {
  return max(0.0, 1.0 - ${RELIEF_TILT.toFixed(2)} * (1.0 - n.y) + ${RELIEF_SIDE.toFixed(2)} * dot(n.xz, vec2(${RELIEF_LIGHT.x.toFixed(2)}, ${RELIEF_LIGHT.z.toFixed(2)})));
}
`;

export const GROUND_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vRim;
varying float vSide;
void main() {
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = mat3(world) * normal;
  vRim = uv.x;
  vSide = uv.y;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

// Two-scale grid, anti-aliased with screen-space derivatives, fading with distance: the floor
// itself, with its kerb and its risen roads, to the fog's colour, as all that stands on it does,
// and the ground past the edge to a grey haze of its own (hazeColor), a little lighter, which the
// sky takes up at the horizon. So far off the world is one dark shape lying on ground that still
// reads as ground, out to where the sky begins. It's drawn on
// four parts (side): the floor, the ground past the edge OUTSIDE_HEIGHT down, the kerb along
// the edge between them (Floor.ts), and a road risen off the floor (RaisedGround.ts); past the edge
// the grid dims and turns grey, and the kerb is
// drawn as a bold line of the grid along the top of the drop (green on its top, grey down the face)
// and along its toe at the foot (grey), so where the floor ends reads from afar, its inner face
// (vRim) the grid's own colour. The kerb's face down the drop carries the grid on down from the
// floor to the ground below (surfaceGridLine). A risen road is the same again up off the floor: the
// floor's grid on what faces up, a bold green line down each side of it, and its walls the drop's
// grey face with a bold line along their top.
export const GROUND_FRAGMENT = `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vRim;
varying float vSide;
// 0 the floor, 1 the ground past the edge, 2 the kerb, 3 a risen road; below 0 each vertex's own
// (vSide, the slab's meshes carrying the floor and the kerb both, Floor.ts).
uniform float sideOf;
uniform vec3 cameraPos;
uniform vec3 lineColor;
uniform vec3 majorColor;
uniform vec3 floorColor;
uniform vec3 fogColor;
uniform vec3 hazeColor;
uniform float fogScale; // 1 normally, small while scoped so the far end is visible
uniform float time;
// A patch of the floor bent into ripples (render/GroundRipple.ts): shaded by its slope, as if lit
// low from one side, and glowing reliefGlow as a pool round reliefCentre (at reliefStrength,
// brightest in the middle and gone at reliefRadius) and a little more on its crests, reliefHeight
// over reliefBase. 0 everywhere else, where the floor is flat.
uniform float relief;
uniform float reliefBase;
uniform float reliefHeight;
uniform vec3 reliefGlow;
uniform vec2 reliefCentre;
uniform float reliefRadius;
uniform float reliefStrength;

float gridLine1(float v, float spacing, float width) {
  float g = abs(fract(v / spacing - 0.5) - 0.5) * spacing;
  float fw = fwidth(v) * 1.2;
  return 1.0 - smoothstep(width - fw, width + fw, g);
}

float gridLine(vec2 p, float spacing, float width) {
  return max(gridLine1(p.x, spacing, width), gridLine1(p.y, spacing, width));
}

// The grid on any surface, from its world position and its mesh's normal there (interpolated, so
// it turns smoothly over a curve and the family switches along one clean line): of the three axes,
// the one the normal lies nearest picks the grid (a level surface the floor's lines across x and z;
// one facing most along x the lines across z and up; along z, across x and up), so one family of
// lines runs over each face and a curve switches family where it turns past halfway rather than
// showing two at once. All three axes' lines are worked out everywhere and only then chosen between:
// a line's anti-aliasing reads how fast its coordinate changes from pixel to pixel, and fed a
// different coordinate on either side of the switch it would read a jump there and smear a strip of
// broken line along it.
float surfaceGridLine(vec3 w, vec3 normal, float spacing, float width) {
  float gx = gridLine1(w.x, spacing, width);
  float gy = gridLine1(w.y, spacing, width);
  float gz = gridLine1(w.z, spacing, width);
  vec3 n = abs(normalize(normal));
  return n.y >= max(n.x, n.z) ? max(gx, gz) : n.x >= n.z ? max(gz, gy) : max(gx, gy);
}

${RELIEF_SHADE}

void main() {
  float side = sideOf < -0.5 ? floor(vSide + 0.5) : sideOf;
  vec2 p = vWorld.xz;
  float dist = length(p - cameraPos.xz);
  // On the kerb: lit along both rims of the drop, the top with the band of the face under it and
  // the toe with the band over it, so the border reads as bold seen from above or from the drop;
  // its inner face the grid's colour; and the drop between them gridded.
  float lit = 0.0;
  float rim = 0.0;
  // Risen floor (RaisedGround.ts): what faces up is the floor and the rest the drop's face, with a
  // bold line within a kerb's width of the edge its uv measures from.
  bool risen = side > 2.5;
  bool top = risen && normalize(vNormal).y > 0.7;
  if (risen) {
    float edge = (1.0 - abs(vRim)) * vSide;
    float soft = fwidth(edge);
    lit = 1.0 - smoothstep(${KERB_WIDTH.toFixed(3)} - soft, ${KERB_WIDTH.toFixed(3)} + soft, edge);
  } else if (side > 1.5) {
    rim = vRim;
    lit = (1.0 - rim) * max(step(${-KERB_WIDTH / 2}, vWorld.y), step(vWorld.y, ${(OUTSIDE_HEIGHT + KERB_HEIGHT + KERB_WIDTH / 2).toFixed(3)}));
  }
  float minor;
  float major;
  if (side > 1.5) {
    // The lit parts are drawn as a bold line of the grid, so they're its colour exactly.
    float drop = (1.0 - lit) * (1.0 - rim);
    minor = max(surfaceGridLine(vWorld, vNormal, 2.0, 0.045) * drop, lit);
    major = max(surfaceGridLine(vWorld, vNormal, 10.0, 0.09) * drop, lit);
  } else {
    minor = gridLine(p, 2.0, 0.045);
    major = gridLine(p, 10.0, 0.09);
  }
  // How bright the grid is: all of it on the floor, dim on the ground past the edge, and between on the kerb.
  float inside = side < 0.5 || top ? 1.0 : side < 1.5 ? 0.0 : 0.8;
  float pulse = 0.85 + 0.15 * sin(time * 1.5 - length(p) * 0.15);
  vec3 col = floorColor;
  col = mix(col, lineColor * pulse, minor * 0.55 * (0.4 + 0.6 * inside));
  col = mix(col, majorColor * pulse, major * 0.9 * (0.5 + 0.5 * inside));
  // Grey past the edge: the ground there and all of the kerb but its top, at the floor's edge.
  float outside = risen ? 1.0 - float(top) : side > 1.5 ? 1.0 - step(${(KERB_HEIGHT - 0.001).toFixed(3)}, vWorld.y) : side > 0.5 ? 1.0 : 0.0;
  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), outside);
  col = mix(col, lineColor * 0.45, rim);
  if (relief > 0.5) {
    vec3 n = normalize(vNormal);
    col *= reliefShade(n);
    float out_ = length(vWorld.xz - reliefCentre) / reliefRadius;
    float crest = clamp((vWorld.y - reliefBase) / reliefHeight, 0.0, 1.0);
    col += reliefGlow * reliefLight(out_, crest, reliefStrength);
  }
  float fog = 1.0 - exp(-dist * dist * ${GROUND_FOG} * fogScale);
  bool past = side > 0.5 && side < 1.5;
  col = mix(col, past ? hazeColor : fogColor, fog);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SKY_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

// Vertical gradient with a horizon glow and a sparse field of stars from a hash.
export const SKY_FRAGMENT = `
precision highp float;
varying vec3 vDir;
uniform vec3 fogColor;
uniform float time;
${SKY_GRADIENT}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// A star cell for a direction: the direction projected onto the face of a cube around the camera
// that it points through, cut into 400 × 400 cells per face (a few pixels each), so stars are spread evenly down to
// the horizon.
vec2 starCell(vec3 d) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.y >= a.x && a.y >= a.z) {
    uv = d.xz / a.y;
    face = d.y > 0.0 ? 0.0 : 1.0;
  } else if (a.x >= a.z) {
    uv = d.zy / a.x;
    face = d.x > 0.0 ? 2.0 : 3.0;
  } else {
    uv = d.xy / a.z;
    face = d.z > 0.0 ? 4.0 : 5.0;
  }
  return floor(uv * 200.0) + vec2(face * 500.0, 0.0);
}

void main() {
  vec3 col = skyColor(vDir);
  vec2 cell = starCell(vDir);
  float star = step(0.995, hash(cell)) * smoothstep(0.08, 0.35, vDir.y);
  float twinkle = 0.6 + 0.4 * sin(time * 2.0 + hash(cell + 1.0) * 6.28);
  col += vec3(0.9, 0.95, 1.0) * star * twinkle * 0.8;
  gl_FragColor = vec4(col, 1.0);
}
`;
