// The view folded shut: two black flaps hinged along its top and its bottom, swung down over it to
// meet across its middle (#fold; its look is in styles.css). What's on the HUD stays over it.
export class Fold {
  private readonly el = document.getElementById('fold')!;
  private shut = 0;

  // How far shut it is: 0 open, when nothing of it is drawn, to 1. Set every frame; the page is
  // touched only when it changes.
  set(shut: number): void {
    if (shut === this.shut) return;
    this.shut = shut;
    this.el.style.setProperty('--shut', String(shut));
    this.el.classList.toggle('on', shut > 0);
  }
}
