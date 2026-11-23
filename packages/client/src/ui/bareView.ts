// The bare view (L): everything laid over the world put away, so the picture is the world as the
// player sees it, and brought back by the same key. The game plays on under it; what's part of
// seeing (the crosshair, the scope, the view frosted over, the iris, a hit's or a heal's flash) and
// what the player opens themselves (the menu, the commands, a cube's card, the chat while it's typed
// in, the death screen) are still shown while it's up, listed where the rest is hidden (#app.bare,
// styles.css).
// A mouse device's alone: a touch one is played by the buttons this would put away.
import { IS_TOUCH } from '../input/touch';

export function toggleBareView(): void {
  if (!IS_TOUCH) document.getElementById('app')!.classList.toggle('bare');
}
