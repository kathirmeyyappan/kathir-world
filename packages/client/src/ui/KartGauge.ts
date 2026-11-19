// A driver's gauge, under their kart's wrenches on a mouse device: how fast the kart is going along
// its nose and how fast that's changing. Set every frame from the predicted kart; the page is
// touched only when a shown figure changes.
import type { KartPace } from '../net/Prediction';

// A figure to a tenth, a zero never signed.
function tenth(v: number, signed: boolean): string {
  const shown = (Math.round(v * 10) / 10 || 0).toFixed(1);
  return signed && !shown.startsWith('-') ? `+${shown}` : shown;
}

export class KartGauge {
  private readonly el = document.getElementById('kart-gauge')!;
  private readonly speed = this.el.querySelector('.speed')!;
  private readonly accel = this.el.querySelector('.accel')!;
  private shown: { speed: string; accel: string } | null = null;

  // The kart's pace, or none to put the gauge away.
  set(pace: KartPace | null): void {
    const next = pace && { speed: `${tenth(pace.speed, false)} m/s`, accel: `${tenth(pace.accel, true)} m/s²` };
    if (next?.speed !== this.shown?.speed) this.speed.textContent = next?.speed ?? '';
    if (next?.accel !== this.shown?.accel) this.accel.textContent = next?.accel ?? '';
    if (!next !== !this.shown) this.el.classList.toggle('hidden', !next);
    this.shown = next;
  }
}
