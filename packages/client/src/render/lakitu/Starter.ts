// Lakitu starting a race (docs/game-modes.md), as it's seen: over the road ahead of the grid,
// facing it, the starting lights hanging from his rod. He comes down from up behind where he
// stands, bobs there on his cloud while the lamps light, and goes back up the way he came. Where
// he stands, how far he's come and what's lit are the game's to say (`Start`); his files and the
// lights' are sent for as he's first wanted, and until they're here he isn't drawn.
import type { Vec3 } from '@world/shared';
import type { Engine } from '../Engine';
import { Lakitu, wantLakitu } from './Lakitu';
import { StartLights, wantStartLights } from './StartLights';

export interface Start {
  at: Vec3; // where the top of the lights hangs once he's there
  yaw: number; // the way he faces: back at the grid
  here: number; // how far he's come: 0 up where he comes from and goes to, 1 there
  red: number; // how many of the three lamps are lit red
  green: boolean; // all three green: go
}

const SIZE = 2.6; // times his own size: he's read from the back of a grid
const LINE = 4; // metres of line from the tip of his rod down to the lights, which hang under his cloud
const AWAY = { up: 16, back: 10 }; // metres up and back from where he stands that he comes from and goes to
const BOB = { height: 0.12, rate: 4.5 }; // metres he bobs either way on his cloud, and radians a second of it

export class Starter {
  onLamp: ((at: Vec3) => void) | null = null; // another lamp lit red there: for what's heard of it
  onGo: ((at: Vec3) => void) | null = null; // the lamps turned green
  private lakitu: Lakitu | null = null;
  private lights: StartLights | null = null;
  private lit = { red: 0, green: false }; // as last shown, to say what's newly lit
  private clock = 0; // seconds, for his bobbing

  constructor(private readonly engine: Engine) {}

  // Draws him as `start` has him this frame; null: he's not there.
  update(start: Start | null, dt: number): void {
    this.clock += dt;
    if (!start) {
      this.lakitu?.dispose();
      this.lakitu = this.lights = null;
      this.lit = { red: 0, green: false };
      return;
    }
    wantLakitu(this.engine.scene);
    wantStartLights(this.engine.scene);
    this.lakitu ??= new Lakitu(this.engine.scene, false);
    this.lights ??= new StartLights(this.engine, this.lakitu.end);
    const away = 1 - eased(start.here);
    const [sin, cos] = [Math.sin(start.yaw), Math.cos(start.yaw)];
    const eye = {
      x: start.at.x - sin * AWAY.back * away,
      y: start.at.y + AWAY.up * away,
      z: start.at.z - cos * AWAY.back * away,
    };
    this.lakitu.fish(eye, start.yaw, LINE + BOB.height * Math.sin(this.clock * BOB.rate), SIZE);
    this.lights.show(start.red, start.green);
    if (start.red > this.lit.red) this.onLamp?.(start.at);
    if (start.green && !this.lit.green) this.onGo?.(start.at);
    this.lit = { red: start.red, green: start.green };
  }
}

// From 0 to 1 as `u` goes from 0 to 1, starting and stopping gently.
function eased(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}
