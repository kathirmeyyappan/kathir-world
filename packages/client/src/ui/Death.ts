// The "you died" screen: a red wash over everything, who got you, and a countdown to the respawn.
// Coming back is the Room's to do (room.ts `respawn`): the count runs beside the Room's own clock,
// the button asks to come back now, and the Game takes the screen down once the player is alive.
import { RESPAWN_SECONDS } from '@world/shared';
import { leaveRoom } from '../net/lobby';

export class Death {
  private readonly root = document.getElementById('death')!;
  private readonly by = document.getElementById('death-by')!;
  private readonly count = document.getElementById('death-count')!;
  private timer: number | null = null;

  constructor(respawn: () => void) {
    document.getElementById('death-respawn')!.addEventListener('click', respawn);
    document.getElementById('death-exit')!.addEventListener('click', leaveRoom);
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
