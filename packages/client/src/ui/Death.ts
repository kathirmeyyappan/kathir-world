// The "you died" screen: a red wash over everything, who got you, and a countdown to the respawn.
// Coming back is the Room's to do (room.ts `respawn`): the count runs beside the Room's own clock,
// the button asks to come back now, and the Game takes the screen down once the player is alive.
// Whether a death has the screen over it at all is the room's game's to say (the shared package's
// modes/rules.ts `Dying`).
import { leaveRoom } from '../net/lobby';
import { pressTwice } from './pressTwice';

export class Death {
  private readonly root = document.getElementById('death')!;
  private readonly by = document.getElementById('death-by')!;
  private readonly count = document.getElementById('death-count')!;
  private timer: number | null = null;

  // `leaving`: what leaving the room does besides, to warn of before the way out (the menu's own
  // ways out warn of the same, ui/menu/tabs.ts).
  constructor(respawn: () => void, leaving: () => string | null) {
    document.getElementById('death-respawn')!.addEventListener('click', respawn);
    const warning = document.getElementById('death-warning')!;
    pressTwice(document.getElementById('death-exit')!, leaving, (text) => (warning.textContent = text), leaveRoom);
  }

  get up(): boolean {
    return !this.root.classList.contains('hidden');
  }

  // `how`: "shot by kathir", "you fell". `seconds`: until the Room brings the player back.
  show(how: string, seconds: number): void {
    this.hide();
    this.by.textContent = how;
    this.root.classList.remove('hidden');
    document.exitPointerLock?.();
    let left = seconds;
    const tick = () => (this.count.textContent = `respawning in ${Math.max(0, left--)}`);
    tick();
    this.timer = window.setInterval(tick, 1000);
  }

  hide(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.root.classList.add('hidden');
  }
}
