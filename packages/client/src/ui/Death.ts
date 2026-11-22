// The "you died" screen: a red wash over everything, who got you, and a countdown to the respawn.
// Coming back is the Room's to do (room.ts `respawn`): the count runs beside the Room's own clock,
// the button asks to come back now, and the Game takes the screen down once the player is alive.
import { RESPAWN_SECONDS } from '@world/shared';
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

  // `how`: "shot by kathir", "you fell".
  show(how: string): void {
    this.hide();
    this.by.textContent = how;
    this.root.classList.remove('hidden');
    document.exitPointerLock?.();
    let left = RESPAWN_SECONDS;
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
