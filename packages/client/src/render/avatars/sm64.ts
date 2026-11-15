// How Mario's family moves unless one of them says otherwise: Super Mario 64's own animations of
// Mario (sm64Clips.ts, made by scripts/sm64-clips.py) and the numbers round them. A character's
// style is this with its own over it: a number or two (Luigi's flutter, Wario's arms and waddle),
// or clips of its own wherever it moves its own way (Peach).
import type { Style } from './Jointed';
import { pose } from './motion';
import { SM64_CLIPS } from './sm64Clips';

export const SM64_STYLE: Style = {
  clips: SM64_CLIPS,
  landSpeed: 14,
  dead: pose({
    armL: { out: 1.2, elbow: 0.3 },
    armR: { out: 1.2, elbow: 0.3 },
    footL: { x: -0.1, yaw: -0.5 },
    footR: { x: 0.1, yaw: 0.5 },
  }),
  follow: 0.5,
  bank: 0.06,
  glance: 3,
};
