// Touch controls: a square pad on the left that acts as a joystick, and a jump button on the
// right; a dragon, which only flies forward, has a throttle in the pad's place, slid up for the
// speed and left where it's put, and no jump; and a kart's driver steers with the pad, has GAS and
// BRAKE beside the jump button, and the jump button drifts. All plain DOM styled like the rest of
// the HUD. Only mounted on touch devices.
import type { PlayerClass } from '@world/shared';
import type { InputManager } from './InputManager';
import { IS_TOUCH } from './touch';

const RADIUS = 34;
// The throttle's thumb: px up from the track's bottom edge to its middle at a stop, and px it
// slides up from there to flat out (styles.css sizes the track to fit).
const THROTTLE_REST = 20;
const THROTTLE_TRAVEL = 100;

export class MobileControls {
  private readonly pad = document.getElementById('pad');
  private readonly thumb = document.getElementById('pad-thumb');
  private readonly jump = document.getElementById('jump-button');
  private readonly throttle = document.getElementById('throttle');
  private readonly throttleThumb = document.getElementById('throttle-thumb');
  private readonly gas = document.getElementById('gas-button');
  private readonly brake = document.getElementById('brake-button');
  private driving = false; // the pad only steers
  private touchId: number | null = null;
  private throttleTouch: number | null = null;
  private originX = 0;
  private originY = 0;

  constructor(private readonly input: InputManager) {
    if (!IS_TOUCH) return;
    const pad = this.pad;
    if (pad) {
      pad.addEventListener(
        'touchstart',
        (e) => {
          if (this.touchId !== null) return;
          const t = e.changedTouches[0];
          const r = pad.getBoundingClientRect();
          this.touchId = t.identifier;
          this.originX = r.left + r.width / 2;
          this.originY = r.top + r.height / 2;
          pad.classList.add('active');
          this.move(t.clientX, t.clientY);
          e.preventDefault();
        },
        { passive: false },
      );
      pad.addEventListener(
        'touchmove',
        (e) => {
          for (const t of Array.from(e.changedTouches))
            if (t.identifier === this.touchId) this.move(t.clientX, t.clientY);
          e.preventDefault();
        },
        { passive: false },
      );
      const end = (e: TouchEvent) => {
        for (const t of Array.from(e.changedTouches)) if (t.identifier === this.touchId) this.release();
      };
      pad.addEventListener('touchend', end);
      pad.addEventListener('touchcancel', end);
    }
    const jump = this.jump;
    jump?.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        jump.classList.add('active');
        input.requestJump();
        input.hold('Space', true);
      },
      { passive: false },
    );
    const release = () => {
      jump?.classList.remove('active');
      input.hold('Space', false);
    };
    jump?.addEventListener('touchend', release);
    jump?.addEventListener('touchcancel', release);
    holding(this.gas, input, 'KeyW');
    holding(this.brake, input, 'KeyS');
    const throttle = this.throttle;
    if (throttle) {
      throttle.addEventListener(
        'touchstart',
        (e) => {
          if (this.throttleTouch !== null) return;
          const t = e.changedTouches[0];
          this.throttleTouch = t.identifier;
          throttle.classList.add('active');
          this.slide(throttle, t.clientY);
          e.preventDefault();
        },
        { passive: false },
      );
      throttle.addEventListener(
        'touchmove',
        (e) => {
          for (const t of Array.from(e.changedTouches))
            if (t.identifier === this.throttleTouch) this.slide(throttle, t.clientY);
          e.preventDefault();
        },
        { passive: false },
      );
      const leave = (e: TouchEvent) => {
        for (const t of Array.from(e.changedTouches)) if (t.identifier === this.throttleTouch) this.leave();
      };
      throttle.addEventListener('touchend', leave);
      throttle.addEventListener('touchcancel', leave);
    }
  }

  // A walker has the pad and JUMP; a dragon the throttle in the pad's place, and nothing to jump
  // with. Either starts still.
  setClass(cls: PlayerClass): void {
    if (!IS_TOUCH) return;
    const flies = cls === 'asian-dragon';
    this.release();
    this.leave();
    this.setThrottle(0);
    this.pad?.classList.toggle('hidden', flies);
    this.jump?.classList.toggle('hidden', flies);
    this.throttle?.classList.toggle('hidden', !flies);
  }

  // Driving a kart or not: the pad steering alone, GAS and BRAKE out, and the jump button DRIFT.
  setDriving(driving: boolean): void {
    if (!IS_TOUCH || driving === this.driving) return;
    this.driving = driving;
    this.release();
    this.gas?.classList.toggle('hidden', !driving);
    this.brake?.classList.toggle('hidden', !driving);
    const word = this.jump?.querySelector('span:last-child');
    if (word) word.textContent = driving ? 'DRIFT' : 'JUMP';
  }

  private move(x: number, y: number): void {
    let dx = x - this.originX;
    let dy = y - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx *= RADIUS / len;
      dy *= RADIUS / len;
    }
    if (this.thumb) this.thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    this.input.joystick = { x: dx / RADIUS, y: this.driving ? 0 : -dy / RADIUS };
  }

  private release(): void {
    this.touchId = null;
    this.pad?.classList.remove('active');
    if (this.thumb) this.thumb.style.transform = '';
    this.input.joystick = { x: 0, y: 0 };
  }

  // The thumb to the finger's height on the track, and the speed with it.
  private slide(track: HTMLElement, y: number): void {
    const bottom = track.getBoundingClientRect().bottom;
    this.setThrottle(Math.max(0, Math.min(1, (bottom - THROTTLE_REST - y) / THROTTLE_TRAVEL)));
  }

  private setThrottle(level: number): void {
    if (this.throttleThumb) this.throttleThumb.style.transform = `translateY(${-level * THROTTLE_TRAVEL}px)`;
    this.input.joystick = { x: 0, y: level };
  }

  // The finger off the throttle: the thumb stays where it was left.
  private leave(): void {
    this.throttleTouch = null;
    this.throttle?.classList.remove('active');
  }

  dispose(): void {
    this.release();
    this.leave();
    this.setThrottle(0);
  }
}

// A button holding `code` down while a finger's on it.
function holding(button: HTMLElement | null, input: InputManager, code: string): void {
  button?.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      button.classList.add('active');
      input.hold(code, true);
    },
    { passive: false },
  );
  const up = () => {
    button?.classList.remove('active');
    input.hold(code, false);
  };
  button?.addEventListener('touchend', up);
  button?.addEventListener('touchcancel', up);
}
