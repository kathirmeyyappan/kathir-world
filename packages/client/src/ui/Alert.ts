// The red box over the view: the one way the game says something's wrong or can't be done. A line
// flashed stands for FLASH_MS, a newer one taking its place (a command refused, a commands button
// that needs more typed); a line held stands for as long as it's true (a kart driven off the
// map), under any flash meanwhile. Its text is plain, a "\n" in it a new line, and it never takes
// the mouse.
const FLASH_MS = 3000;

export class Alert {
  private readonly el = document.getElementById('alert')!;
  private held: string | null = null;
  private flashed: string | null = null;
  private timer = 0;

  flash(text: string): void {
    this.flashed = text;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.flashed = null;
      this.show();
    }, FLASH_MS);
    this.show();
  }

  // What the box says while it holds, or null once it doesn't. Set every frame; the page is
  // touched only when it changes.
  hold(text: string | null): void {
    if (text === this.held) return;
    this.held = text;
    this.show();
  }

  private show(): void {
    const text = this.flashed ?? this.held;
    if (text !== null) this.el.textContent = text; // kept as the box fades out
    this.el.classList.toggle('on', text !== null);
  }
}
