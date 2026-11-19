// The window at the top of the menu's PLAY tab: the player's own body (BodyView.ts), and the map
// (Map.ts) in a square in its corner, the two swapping places at a click on the small one. On touch,
// where the HUD has no minimap, the map starts big.
import { IS_TOUCH } from '../../input/touch';
import { BodyView } from '../../render/BodyView';
import type { Minimap } from '../Minimap';
import { MenuMap } from './Map';
import type { Me } from './tabs';

export class Preview {
  readonly el = document.createElement('div');
  private readonly body = document.createElement('div'); // the view of the body
  private readonly view = new BodyView();
  private readonly map: MenuMap;
  private mapBig = IS_TOUCH; // the map fills the window and the body is in the corner

  constructor(minimap: Minimap) {
    this.el.className = 'preview';
    this.map = new MenuMap(minimap);
    this.body.className = 'view player';
    this.body.append(this.view.canvas);
    // Each view is named by a caption under its square while it's small, where it's a button to bring
    // it up (the button covers the square, so no drag reaches it). Filling the window, the body has a
    // title across its top; the map needs none, its view buttons standing there.
    for (const [view, name] of [
      [this.body, 'PLAYER VIEW'],
      [this.map.el, 'MAP'],
    ] as const) {
      const swap = Object.assign(document.createElement('button'), { className: 'swap' });
      swap.append(Object.assign(document.createElement('span'), { className: 'caption', textContent: name }));
      swap.addEventListener('click', () => this.swap());
      view.append(swap);
    }
    this.body.prepend(
      Object.assign(document.createElement('span'), { className: 'title', textContent: 'PLAYER VIEW' }),
    );
    this.el.append(this.body, this.map.el);
    this.place();
  }

  // Once a frame: drawn while `visible`, as `me` is.
  sync(me: Me, visible: boolean): void {
    this.view.sync(me, visible);
    if (visible) this.map.sync();
  }

  private swap(): void {
    this.mapBig = !this.mapBig;
    this.place();
    this.view.resize(); // the canvas is another size
  }

  private place(): void {
    this.body.classList.toggle('big', !this.mapBig);
    this.body.classList.toggle('small', this.mapBig);
    this.map.el.classList.toggle('big', this.mapBig);
    this.map.el.classList.toggle('small', !this.mapBig);
  }
}
