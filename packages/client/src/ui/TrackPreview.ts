// A track shown whole over the view before it's raced (docs/game-modes.md): the map framed on the
// track alone, north up, as every map draws a track in play (MapCanvas.ts: all else dulled, the
// track lit, its finish line marked, everyone on it), with a line under it. When it's up is the
// room's game's to say (the client's `MODE_HUD`).
import type { Track } from '@world/shared';
import { MapCanvas, type Framing, type MinimapFrame } from './MapCanvas';

const MARGIN = 30; // metres of the world shown round the track

export class TrackPreview {
  private readonly root = document.getElementById('track-preview')!;
  private readonly caption = this.root.querySelector<HTMLElement>('.caption')!;
  private readonly map = new MapCanvas(this.root.querySelector('canvas')!);
  private framed: { track: Track; framing: Framing } | null = null; // the track last framed, and how

  // The map as `frame` has it, framed on its track, over `caption`; null, or a frame with no track
  // in play: away.
  set(frame: MinimapFrame | null, caption = ''): void {
    const track = frame?.track ?? null;
    this.root.classList.toggle('on', !!track);
    if (!frame || !track) return;
    if (this.caption.textContent !== caption) this.caption.textContent = caption;
    if (this.framed?.track !== track) {
      // Its road, and all of the disc it ends on.
      const { end } = track.route;
      const [xs, zs] = [track.spots.map((s) => s.x), track.spots.map((s) => s.z)];
      const box = {
        minX: Math.min(...xs, end.x - end.r),
        maxX: Math.max(...xs, end.x + end.r),
        minZ: Math.min(...zs, end.z - end.r),
        maxZ: Math.max(...zs, end.z + end.r),
      };
      this.framed = { track, framing: this.map.framingOf(box, MARGIN) };
    }
    this.map.draw(frame, 'world', this.framed.framing);
  }
}
