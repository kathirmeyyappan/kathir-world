// A health bar: a life's worth of pixel hearts in rows at the top of the screen, as many as the
// worn look has (classes.ts `lifeOf`), drawn as its life says: hearts, or the big crystals of a
// dragon with a crystal a segment; and under it, while they drive, the wrenches of their kart.
// Hearts you've lost turn grey and crack. Pure DOM, driven by the server's count; nothing here
// decides damage.
import { WALKER, type HeartSprite, type LifeSpec } from '@world/shared';
import { HEART as FULL, pixelSvg } from './pixelIcons';

// 9x8 pixel heart. '#' body, '+' highlight, '.' empty. The broken one has a crack down it; the
// half one is the broken one with everything left of the crack ('L') still red and the rest ('R')
// grey, so the crack is where the heart stops.
const BROKEN = ['.##...##.', '#+##.####', '###.#####', '####.####', '.####.##.', '..##.##..', '...#.#...', '....#....'];

const HALF = ['.LL...RR.', 'L+LL.RRRR', 'LLL.RRRRR', 'LLLL.RRRR', '.LLLL.RR.', '..LL.RR..', '...L.R...', '....L....'];

// 17x15 pixel crystal heart, cut like a gem: straight edges and sharp corners ('#'), the crown's
// facets catching the light from the upper left ('+' lit, '*' the glint) and falling into shade
// toward the lower right ('o' half-lit, 'O' dark), '=' the edges between facets. A lost one is
// shattered, a crack zigzagging down it and a shard gone from its rim; it is never half.
const CRYSTAL = [
  '..#####...#####..',
  '.#+*+++#.#++++O#.',
  '#++++++###+++OOO#',
  '#+++++=+++=+OOOO#',
  '#oo+++=+++=+OOOO#',
  '.#oo++=+++=+OOO#.',
  '.#ooo=+++++=OOO#.',
  '..#oo=+++++=OO#..',
  '..#ooo=+++=OOO#..',
  '...#oo=+++=OO#...',
  '....#oo=+=OO#....',
  '.....#oo=OO#.....',
  '......#oOO#......',
  '.......#O#.......',
  '........#........',
];
const CRYSTAL_BROKEN = [
  '..#####...##.#...',
  '.#+*+++#.#++.O#..',
  '#++++++##.++OOO#.',
  '#+++++=++.=+OOOO#',
  '#oo+++=+.+=+OOOO#',
  '.#oo++=+.+=+OOO#.',
  '.#ooo=++.++=OOO#.',
  '..#oo=+.+++=OO#..',
  '..#ooo=.++=OOO#..',
  '...#oo=+.+=OO#...',
  '....#oo=.=OO#....',
  '.....#oo.OO#.....',
  '......#o.O#......',
  '.......#.#.......',
  '........#........',
];

// 16x16 pixel wrench, an open-ended spanner lying aslant: its jaw up to the left, its handle down to
// a ring at the right, in a dark outline ('o') and lit along its upper edges ('+'). The broken one
// is snapped across the handle; the half one is that with the jaw's side of the snap gone grey ('R',
// and 'e' its outline).
const WRENCH = [
  '....ooo.........',
  '...o+++o........',
  '.o..o##+o.......',
  'o+o..o##+o......',
  'o#+o.o##+o......',
  'o##+o+##+o......',
  '.o##+####+o.....',
  '..o#######+o....',
  '...o#######+o...',
  '....ooo####+ooo.',
  '.......o####+++o',
  '........o#####+o',
  '.........o#+o#+o',
  '.........o##+#+o',
  '..........o##+o.',
  '...........ooo..',
];
const WRENCH_BROKEN = [
  '....ooo.........',
  '...o+++o........',
  '.o..o##+o.......',
  'o+o..o##+o......',
  'o#+o.o##+o......',
  'o##+o+##+o......',
  '.o##+####+o.....',
  '..o#####+ooo....',
  '...o###+oo++o...',
  '....ooooo+#+ooo.',
  '.......o+###+++o',
  '........o#####+o',
  '.........o#+o#+o',
  '.........o##+#+o',
  '..........o##+o.',
  '...........ooo..',
];
const WRENCH_HALF = [
  '....eee.........',
  '...eRRRe........',
  '.e..eRRRe.......',
  'eRe..eRRRe......',
  'eRRe.eRRRe......',
  'eRRReRRRRe......',
  '.eRRRRRRRRe.....',
  '..eRRRRRReoo....',
  '...eRRRReo++o...',
  '....eeeeo+#+ooo.',
  '.......o+###+++o',
  '........o#####+o',
  '.........o#+o#+o',
  '.........o##+#+o',
  '..........o##+o.',
  '...........ooo..',
];

const SPRITES: Record<HeartSprite, { full: string[]; broken: string[]; half: string[]; pix: Record<string, string> }> =
  {
    heart: { full: FULL, broken: BROKEN, half: HALF, pix: { '+': 'hi', R: 'grey' } },
    crystal: {
      full: CRYSTAL,
      broken: CRYSTAL_BROKEN,
      half: CRYSTAL_BROKEN,
      pix: { '+': 'hi', o: 'shade', O: 'dark', '=': 'facet', '*': 'glint' },
    },
    wrench: {
      full: WRENCH,
      broken: WRENCH_BROKEN,
      half: WRENCH_HALF,
      pix: { '+': 'hi', o: 'edge', R: 'grey', e: 'edge grey' },
    },
  };
// One whole heart of `sprite`, as the bar draws one: what a list of players marks a life with.
export function lifeIcon(sprite: HeartSprite): HTMLElement {
  const art = SPRITES[sprite];
  const icon = document.createElement('span');
  icon.className = `heart ${sprite}`;
  icon.append(pixelSvg(art.full, 'full', art.pix));
  return icon;
}

const FILL_MS = 70; // between one heart filling and the next as hearts come back
const RANK = { lost: 0, half: 1, full: 2 };
type State = keyof typeof RANK;

export class Hearts {
  private hearts: HTMLElement[] = [];
  private max = 0; // a full life for the worn look
  private sprite: HeartSprite | null = null;
  private shown = 0; // what the bar shows
  private target = 0; // what the server says, which a fill catches the bar up to
  private fills: number[] = [];

  constructor(
    private readonly root = document.getElementById('hearts')!,
    life: LifeSpec = WALKER.life,
  ) {
    this.setLife(life);
  }

  // Shows the bar, or hides it.
  show(shown: boolean): void {
    this.root.hidden = !shown;
  }

  get count(): number {
    return this.target;
  }

  // The bar for `life`'s hearts in its rows, drawn at `count` without animating when that changes
  // (a new look, which may keep a share of the last one's life).
  setLife(life: LifeSpec, count = life.hearts): void {
    if (life.hearts === this.max && life.sprite === this.sprite) return;
    for (const timer of this.fills) clearTimeout(timer);
    this.fills = [];
    const art = SPRITES[life.sprite];
    this.root.replaceChildren();
    this.root.style.setProperty('--heart-row', String(life.row));
    this.root.dataset.sprite = life.sprite;
    this.hearts = [];
    for (let i = 0; i < life.hearts; i++) {
      const heart = document.createElement('div');
      heart.className = `heart ${life.sprite}`;
      heart.append(
        pixelSvg(art.full, 'full', art.pix),
        pixelSvg(art.broken, 'broken', art.pix),
        pixelSvg(art.half, 'half', art.pix),
      );
      this.root.append(heart);
      this.hearts.push(heart);
    }
    this.max = life.hearts;
    this.sprite = life.sprite;
    const n = Math.max(0, Math.min(this.max, count));
    this.hearts.forEach((heart, i) => {
      const state = stateOf(n, i);
      heart.classList.toggle('half', state === 'half');
      heart.classList.toggle('lost', state === 'lost');
    });
    this.shown = this.target = n;
  }

  // A loss shows at once; hearts coming back fill one at a time, FILL_MS apart. Only the bar
  // takes its time: the health itself is already back.
  set(count: number): void {
    const n = Math.max(0, Math.min(this.max, count));
    if (n === this.target) return;
    this.target = n;
    for (const timer of this.fills) clearTimeout(timer);
    this.fills = [];
    if (n < this.shown) return this.draw(n);
    for (let v = this.shown, k = 0; v < n; k++) {
      v = Math.min(n, v + 1);
      const step = v;
      this.fills.push(window.setTimeout(() => this.draw(step), k * FILL_MS));
    }
  }

  // Hearts fill from the top-left (stateOf). A heart that just dropped a state gets the breaking
  // animation, one that just gained one the filling one.
  private draw(n: number): void {
    for (let i = 0; i < this.max; i++) {
      const heart = this.hearts[i];
      const state = stateOf(n, i);
      const was: State = heart.classList.contains('lost') ? 'lost' : heart.classList.contains('half') ? 'half' : 'full';
      if (state === was) continue;
      heart.classList.toggle('half', state === 'half');
      heart.classList.toggle('lost', state === 'lost');
      heart.classList.remove('breaking', 'filling');
      const animation = RANK[state] > RANK[was] ? 'filling' : state !== 'full' ? 'breaking' : null;
      if (animation) {
        void heart.offsetWidth; // restart the animation
        heart.classList.add(animation);
        heart.addEventListener('animationend', () => heart.classList.remove(animation), { once: true });
      }
    }
    this.shown = n;
  }
}

// Heart i (from 0) of a bar at `n`: full with all of it left, half with any part of it, lost with
// none. Damage comes in quarters, so a heart with a quarter left is drawn half: the bar reads empty
// only at 0.
function stateOf(n: number, i: number): State {
  return n >= i + 1 ? 'full' : n > i ? 'half' : 'lost';
}
