// The view closed down to a circle: black over all of it but a round hole on one spot, which
// closes in on that spot and opens out from it again (#iris; its look is in styles.css). What's on
// the HUD stays over it.
import { Matrix, Vector3, type Camera, type Scene } from '@babylonjs/core';

export class Iris {
  private readonly el = document.getElementById('iris')!;
  private on = false;

  // Closes the view `shut` of the way (0 open, when nothing of it is drawn, to 1, all black)
  // round where `at` in the world is seen, or round its middle where that's nowhere on it. Set
  // every frame; the page is touched only while it's closed at all.
  set(shut: number, at: Vector3 | null, scene: Scene, camera: Camera): void {
    if (shut <= 0) {
      if (this.on) this.el.classList.remove('on');
      this.on = false;
      return;
    }
    const [w, h] = [window.innerWidth, window.innerHeight];
    const seen =
      at && Vector3.TransformCoordinates(at, camera.getViewMatrix()).z > 0
        ? Vector3.Project(at, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(w, h))
        : null;
    const x = seen ? Math.max(0, Math.min(w, seen.x)) : w / 2;
    const y = seen ? Math.max(0, Math.min(h, seen.y)) : h / 2;
    // Open, the hole takes in the whole view, out to the corner furthest from its middle; shut, its
    // edge is inside its middle, so nothing of it is left.
    const reach = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
    this.el.style.setProperty('--x', `${x}px`);
    this.el.style.setProperty('--y', `${y}px`);
    this.el.style.setProperty('--r', `${reach * (1 - shut) - 1}px`);
    if (!this.on) this.el.classList.add('on');
    this.on = true;
  }
}
