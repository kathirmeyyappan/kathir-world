// The world waits behind one press: as the player first comes in, and again when they come back
// from the dead with no press behind them. It's what lets the browser start sound (Sfx unlocks on
// it; on a touchscreen only a tap does, never a drag), and with a mouse it takes the pointer, which
// a browser gives only to a press, so moving the mouse turns the view from then on. Pressing
// anywhere on it pushes the button in. No key gets past it: Enter would open the chat behind it,
// and the typing then holds the focus the press needs.
import { IS_TOUCH } from '../input/touch';

const FADE_MS = 200; // matches #start's transition

export class StartGate {
  private readonly gate = document.getElementById('start')!;
  private readonly keys = (e: KeyboardEvent) => e.stopPropagation();

  constructor(canvas: HTMLCanvasElement) {
    const gate = this.gate;
    gate.querySelector('.label')!.textContent = IS_TOUCH ? 'TAP TO PLAY' : 'CLICK TO PLAY';
    gate.addEventListener('pointerdown', () => gate.classList.add('pressed'));
    for (const up of ['pointerup', 'pointercancel', 'pointerleave'])
      gate.addEventListener(up, () => gate.classList.remove('pressed'));
    gate.addEventListener('click', () => {
      window.removeEventListener('keydown', this.keys, { capture: true });
      if (!IS_TOUCH) void canvas.requestPointerLock?.();
      // A phone or tablet plays fullscreen, out from under the browser's bars, where its browser
      // can take a page fullscreen (an iPhone's can't, so it's left as it is).
      else if (document.fullscreenEnabled)
        void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      gate.classList.add('gone');
      setTimeout(() => gate.classList.add('hidden'), FADE_MS);
    });
  }

  // Whether the world is waiting behind it.
  get up(): boolean {
    return !this.gate.classList.contains('hidden');
  }

  show(): void {
    this.gate.classList.remove('hidden', 'gone');
    window.addEventListener('keydown', this.keys, { capture: true });
  }
}
