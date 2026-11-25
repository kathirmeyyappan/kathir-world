// Room code, player roster, ping, and chat. Pure DOM; the Game feeds it events. A slash typed in
// the chat offers the commands it could be the start of (commands.ts), listed above the box with
// the best nearest it: Up picks from the bottom, Down comes back, Enter or Tab (or a click) puts
// the pick in the box, where Enter sends it as anything else.
import {
  MAX_CHAT_LENGTH,
  MAX_HEARTS,
  lifeOf,
  type Appearance,
  type AvatarId,
  type Element,
  type KillItem,
  type LifeSpec,
} from '@world/shared';
import { lifeIcon } from './Hearts';
import { CROWN, GHOST, KNIFE, ROBOT, SKULL, pixelSvg } from './pixelIcons';

import { IS_TOUCH } from '../input/touch';
import { roomLink } from '../net/lobby';
import { commandGroups, completionsOf, type Row } from './commands';
import type { Listed } from './emblem';
import type { LegendCell } from './legend';
import { nameColour } from '../render/liveries';

const CHAT_LINES = 8;
const CHAT_FADE_MS = 12_000;
// Lines sent from this tab, oldest first, that Up and Down step back through like a shell's history.
// Kept in sessionStorage, so a reload of the page keeps them.
const HISTORY_KEY = 'world.chat-history';
const HISTORY_LINES = 50;
// What a kill by a look's own move is said to be with (the kill's `item` on the wire): a strike is
// Tung Tung Tung Sahur's bat, the one strike there is.
const MOVE_KILLS = { pound: 'ground pound', strike: 'bat' };
const MOVE_HINT_MS = 15_000; // how long the move hint is up: its animation's length (#move-hint)
const HINT_GAP = 8; // CSS pixels between the move hint and what it stacks against
// The layout where the item hint is at the top of the screen, under the touch buttons (styles.css).
const COARSE = window.matchMedia('(pointer: coarse)');
// The roster reaches no further down the view than this share of its height: your own row stands
// first, in a cell apart, and everyone else's cells scroll under it, a row at a time on their own
// (the mouse is the view's while playing and can't scroll them), resting at each end, and by hand
// while the mouse is free.
const ROSTER_SHARE = 0.5;
const ROSTER_ROW = 29; // CSS pixels, a roster cell and the gap under it
const ROSTER_MIN_ROWS = 2; // two others, however short the view
const ROSTER_STEP_MS = 2_500; // between one row scrolling into view and the next
const ROSTER_REST_STEPS = 2; // steps it waits at either end before turning back
const ROSTER_HELD_MS = 8_000; // how long a hand on the list keeps it from scrolling itself

// A hint's words, with each key or touch button it names in square brackets drawn as one.
function keyed(text: string): (string | HTMLElement)[] {
  return text.split(/\[([^\]]+)\]/).map((part, i) => {
    if (i % 2 === 0) return part;
    const key = document.createElement('kbd');
    key.translate = false;
    key.textContent = part;
    return key;
  });
}

// The looks whose moves this tab has been given the hint of, by the hint's title.
const HINTED_LOOKS = 'world.moves-hinted';
function hintedLooks(): string[] {
  const kept: unknown = JSON.parse(sessionStorage.getItem(HINTED_LOOKS) ?? '[]');
  return Array.isArray(kept) ? kept.filter((look): look is string => typeof look === 'string') : [];
}

export class Hud {
  private readonly roomCode = document.getElementById('room-code') as HTMLButtonElement;
  private readonly panel = document.getElementById('room-panel')!;
  private readonly panelToggle = document.getElementById('panel-toggle') as HTMLButtonElement;
  private readonly playerMe = document.getElementById('player-me')!;
  private readonly playerList = document.getElementById('player-list')!;
  private readonly ping = document.getElementById('ping')!;
  private rosterRest = 0; // steps left to wait at the end the list has scrolled to
  private rosterHeld = 0; // performance.now() until which a hand on the list keeps it still
  private readonly chatLog = document.getElementById('chat-log')!;
  private readonly itemHint = document.getElementById('item-hint')!;
  private readonly itemHintMain = this.itemHint.querySelector('.main')!;
  private readonly itemHintStats = this.itemHint.querySelector('.stats')!;
  private readonly legend = document.getElementById('instructions')!;
  private readonly moveHint = document.getElementById('move-hint')!;
  private readonly moveHintTitle = this.moveHint.querySelector('.title')!;
  private readonly moveHintMoves = this.moveHint.querySelector('.moves')!;
  private readonly hearts = document.getElementById('hearts')!;
  private readonly condition = document.getElementById('condition')!;
  private readonly areaTitle = document.getElementById('area-title')!;
  private moveHintText = '';
  private moveHintTimer = 0;
  private moveHintBottom = 0; // CSS pixels down the view the move hint reaches, with its gap; 0 with none up
  private itemHintText = '';
  private itemHintItem = ''; // the item the hint is for, whose drawing starts its life over on touch
  private readonly chatInput = document.getElementById('chat-input') as HTMLInputElement;
  private readonly completionsEl = document.getElementById('chat-completions')!;
  private readonly rows = commandGroups().flatMap((g) => g.rows);
  private completions: Row[] = []; // as listed, top down: the best match last, nearest the box
  private picked = -1; // the completion the arrows are on, or none
  private readonly sent = loadHistory();
  private recalled = 0; // the line of `sent` in the box; sent.length is the one being typed
  private draft = ''; // what was being typed before stepping back
  private readonly crosshair = document.getElementById('crosshair')!;
  private players = new Map<string, RosterEntry>();
  private myId = '';
  private master: string | null = null; // the room master's id, if the room has one
  sided = false; // whether the room's game has sides right now: names in its kill lines are in theirs
  onChat: ((text: string) => void) | null = null;
  // Why the room's game refuses a row's command right now, or null (commands.ts `refusedBy`).
  refused: ((row: Row) => string | null) | null = null;
  onChatOpenChange: ((open: boolean) => void) | null = null;

  constructor(roomId: string) {
    // On a touch screen the hints stand in the middle of a small view, and take a tap there
    // (styles.css): one puts the hint away, until the next thing it has to say. On the click, the
    // last event of a tap: gone any sooner, the hint would leave the tap's click to the world under it.
    this.itemHint.addEventListener('click', () => this.itemHint.classList.add('hidden'));
    this.moveHint.addEventListener('click', () => {
      window.clearTimeout(this.moveHintTimer);
      this.moveHint.classList.add('hidden');
    });

    // The legend wraps onto more rows when it's too long for one, and what stacks up from the bottom
    // in the middle of the screen (the hints, the fuel bar, the gear panel) stands that much higher
    // to stay clear of it: --legend-rise, the height of its rows past the first (styles.css).
    new ResizeObserver(() => {
      const row = this.legend.querySelector<HTMLElement>('.key')?.offsetHeight ?? 0;
      const rise = Math.max(0, this.legend.clientHeight - row);
      document.documentElement.style.setProperty('--legend-rise', `${rise}px`);
    }).observe(this.legend);

    this.roomCode.textContent = roomId;
    this.roomCode.addEventListener('click', () => {
      navigator.clipboard?.writeText(roomLink(roomId)).then(() => this.tip(this.roomCode, 'copied'));
    });

    const hold = () => (this.rosterHeld = performance.now() + ROSTER_HELD_MS);
    for (const type of ['wheel', 'pointerdown', 'pointermove'] as const)
      this.playerList.addEventListener(type, hold, { passive: true });
    window.setInterval(() => this.scrollRoster(), ROSTER_STEP_MS);
    window.addEventListener('resize', () => this.fitRoster());

    this.setPanelCollapsed(window.matchMedia('(pointer: coarse)').matches);
    this.panelToggle.addEventListener('click', () =>
      this.setPanelCollapsed(!this.panel.classList.contains('collapsed')),
    );

    this.chatInput.classList.add('hidden');
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !this.isChatOpen() && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        this.openChat();
      }
    });
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const n = this.completions.length;
      if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Tab') && this.picked >= 0) {
        e.preventDefault();
        this.fill(this.completions[this.picked]);
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        const text = this.chatInput.value.trim().slice(0, MAX_CHAT_LENGTH);
        if (text) {
          this.remember(text);
          this.onChat?.(text);
        }
        this.closeChat();
      } else if (e.code === 'Escape') {
        this.closeChat();
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        const up = e.code === 'ArrowUp';
        // The completions first, from the bottom; off their bottom, or with none, the arrows step
        // through what was sent.
        if (n > 0 && (up || this.picked >= 0)) {
          this.picked = up
            ? this.picked < 0
              ? n - 1
              : Math.max(0, this.picked - 1)
            : this.picked + 1 < n
              ? this.picked + 1
              : -1;
          this.completionsEl.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === this.picked));
        } else this.recall(up ? -1 : 1);
      }
    });
    this.chatInput.addEventListener('input', () => this.complete());
    this.chatInput.addEventListener('blur', () => this.closeChat());
    // A press on the list leaves the box focused; a click takes the completion.
    this.completionsEl.addEventListener('pointerdown', (e) => e.preventDefault());
    this.completionsEl.addEventListener('click', (e) => {
      const li = e.target instanceof Element ? e.target.closest('li') : null;
      if (li) this.fill(this.completions[Number(li.dataset.n)]);
    });
  }

  private setPanelCollapsed(collapsed: boolean): void {
    this.panel.classList.toggle('collapsed', collapsed);
    this.panelToggle.textContent = collapsed ? '▸' : '▾';
    this.panelToggle.setAttribute('aria-expanded', String(!collapsed));
    if (!collapsed) this.renderPlayers();
  }

  isChatOpen(): boolean {
    return !this.chatInput.classList.contains('hidden');
  }

  openChat(text = ''): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.chatInput.classList.remove('hidden');
    this.chatInput.value = text;
    this.recalled = this.sent.length;
    this.chatInput.focus();
    this.complete();
    this.onChatOpenChange?.(true);
  }

  // The completions of what's in the box, listed above it with the best nearest, none picked.
  private complete(): void {
    this.completions = completionsOf(this.rows, this.chatInput.value).reverse();
    this.picked = -1;
    this.completionsEl.replaceChildren(
      ...this.completions.map((row, n) => {
        const li = document.createElement('li');
        li.dataset.n = String(n);
        li.classList.toggle('refused', !!this.refused?.(row));
        li.append(
          Object.assign(document.createElement('span'), {
            className: 'cmd',
            textContent: [row.name, ...row.shortcuts].join(', '),
          }),
          Object.assign(document.createElement('span'), { className: 'note', textContent: row.note }),
        );
        return li;
      }),
    );
  }

  // The command in the box, with a space after one that takes arguments, to go on typing.
  private fill(row: Row | undefined): void {
    if (!row) return;
    this.chatInput.value = row.tap;
    this.recalled = this.sent.length;
    this.complete();
  }

  // Puts the line `step` back (-1) or on (1) from the one shown in the box, keeping what was being
  // typed to come back to past the newest.
  private recall(step: number): void {
    const next = this.recalled + step;
    if (next < 0 || next > this.sent.length) return;
    if (this.recalled === this.sent.length) this.draft = this.chatInput.value;
    this.recalled = next;
    this.chatInput.value = next === this.sent.length ? this.draft : this.sent[next];
  }

  private remember(text: string): void {
    if (this.sent.at(-1) !== text) this.sent.push(text);
    this.sent.splice(0, this.sent.length - HISTORY_LINES);
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(this.sent));
    } catch {
      // Storage full or blocked: the history still lasts this page.
    }
  }

  private closeChat(): void {
    if (!this.isChatOpen()) return;
    this.chatInput.classList.add('hidden');
    this.chatInput.blur();
    this.completions = [];
    this.picked = -1;
    this.completionsEl.replaceChildren();
    this.onChatOpenChange?.(false);
  }

  setSelf(id: string): void {
    this.myId = id;
  }

  // The room master, who has a crown on the roster (the shared package's modes/game.ts); null: none.
  setMaster(id: string | null): void {
    if (id === this.master) return;
    this.master = id;
    this.renderPlayers();
  }

  setPlayers(list: RosterPlayer[]): void {
    this.players = new Map(list.map((p) => [p.id, entry(p)]));
    this.renderPlayers();
  }

  addPlayer(p: RosterPlayer): void {
    this.players.set(p.id, entry(p));
    this.renderPlayers();
    this.system(`${p.name} joined`);
  }

  // Once per snapshot: names (a rename shows here), hearts, kills and deaths on the roster.
  // Re-renders only when something moved.
  updateStats(
    list: {
      id: string;
      name: string;
      color: string;
      hearts: number;
      kills: number;
      deaths: number;
      dead: boolean;
      ghost: boolean;
      avatar: AvatarId;
      colour: string; // the one they go by as the room's game stands (sight.ts `colourOf`)
      side: string | null; // the side they're on in it, by name, if any: the roster keeps a side together
      kart: Wrenches | null; // the kart they drive, if they're in one
    }[],
  ): void {
    let changed = false;
    for (const p of list) {
      const e = this.players.get(p.id);
      if (!e) continue;
      e.appearance = { avatar: p.avatar, color: p.color };
      const life = lifeOf(p.avatar);
      const colour = p.colour;
      if (
        e.name !== p.name ||
        e.color !== colour ||
        e.hearts !== p.hearts ||
        e.life !== life ||
        e.kills !== p.kills ||
        e.deaths !== p.deaths ||
        e.dead !== p.dead ||
        e.ghost !== p.ghost ||
        e.side !== p.side ||
        e.kart?.wrenches !== p.kart?.wrenches ||
        e.kart?.full !== p.kart?.full
      ) {
        e.name = p.name;
        e.color = colour;
        e.hearts = p.hearts;
        e.life = life;
        e.kills = p.kills;
        e.deaths = p.deaths;
        e.dead = p.dead;
        e.ghost = p.ghost;
        e.side = p.side;
        e.kart = p.kart;
        changed = true;
      }
    }
    if (changed) this.renderPlayers();
  }

  removePlayer(id: string, name: string): void {
    this.players.delete(id);
    this.renderPlayers();
    this.system(`${name} left`);
  }

  setDead(id: string): void {
    const p = this.players.get(id);
    if (p) {
      p.dead = true;
      this.renderPlayers();
    }
  }

  playerName(id: string): string {
    return this.players.get(id)?.name ?? 'someone';
  }

  // A player as they're listed beside their emblem (emblem.ts).
  listed(id: string): Listed {
    return { id, name: this.playerName(id), appearance: this.players.get(id)?.appearance ?? null };
  }

  // Red crosshair while a shot from here would land.
  setCrosshairTarget(on: boolean): void {
    this.crosshair.classList.toggle('target', on);
  }

  // The key legend along the bottom (legend.ts), drawn again only when its cells change.
  setKeys(cells: LegendCell[]): void {
    const text = JSON.stringify(cells);
    if (text === this.legendText) return;
    this.legendText = text;
    this.legend.replaceChildren(...cells.map(({ keys, does }) => keyCell(keys, does)));
  }
  private legendText = '';

  // What you're holding and how to use it, or nothing.
  // `item` names what the hint is for: its text changes with the scope, but only a new item (or the
  // same one drawn again) starts the hint's time on touch over. An ice item's hint is frosted.
  setItemHint(text: string, stats = '', item = '', element: Element | null = null): void {
    const key = `${text}\n${stats}`;
    this.itemHint.classList.toggle('ice', element === 'ice');
    if (key === this.itemHintText) return;
    this.itemHintText = key;
    this.itemHintMain.replaceChildren(...keyed(text));
    this.itemHintStats.textContent = stats;
    this.itemHint.classList.toggle('hidden', !text);
    if (!IS_TOUCH || item === this.itemHintItem) return;
    this.itemHintItem = item;
    // On touch the hint lives out a CSS animation (#item-hint.timed) and is gone; restarting it takes
    // a reflow between taking the class off and putting it back.
    this.itemHint.classList.remove('timed');
    void this.itemHint.offsetWidth;
    this.itemHint.classList.add('timed');
  }

  // The moves the player's look has of its own: the look's name, then how each is done, a cell
  // each, stacked at the top; none hides it. A banner of its own, up for MOVE_HINT_MS from when
  // its words are first given (the look being taken), whatever is held meanwhile, and once a look
  // for as long as the tab lasts: a body taken again in a look already read about gets none.
  setMoveHint(title: string, moves: string[]): void {
    const text = moves.length > 0 ? [title, ...moves].join('\n') : '';
    if (text !== this.moveHintText) {
      this.moveHintText = text;
      this.moveHintTitle.textContent = title;
      this.moveHintMoves.replaceChildren(
        ...moves.map((move) => {
          const line = document.createElement('div');
          line.append(...keyed(move));
          return line;
        }),
      );
      window.clearTimeout(this.moveHintTimer);
      // Its life is a CSS animation (#move-hint), which starts over as the element is shown again.
      this.moveHint.classList.add('hidden');
      void this.moveHint.offsetWidth;
      const read = hintedLooks();
      const show = text !== '' && !read.includes(title);
      if (show) sessionStorage.setItem(HINTED_LOOKS, JSON.stringify([...read, title]));
      this.moveHint.classList.toggle('hidden', !show);
      if (show) this.moveHintTimer = window.setTimeout(() => this.moveHint.classList.add('hidden'), MOVE_HINT_MS);
    }
    const up = !this.moveHint.classList.contains('hidden');
    if (up) this.placeMoveHint();
    // The commands' banner stands under it (styles.css #command-hint).
    const bottom = up ? this.moveHint.getBoundingClientRect().bottom + HINT_GAP : 0;
    if (bottom !== this.moveHintBottom) {
      this.moveHintBottom = bottom;
      document.documentElement.style.setProperty('--move-hint-bottom', `${bottom}px`);
    }
  }

  // Stands the move hint clear of what it shares the top of the view with: under the hearts, the
  // condition's banner and, while it shows, the area's title; on a touch screen, where the
  // stylesheet has it under the HUD's buttons and the item hint is at the top too, under that when
  // it's up.
  private placeMoveHint(): void {
    // The title is there until it has faded right out, a moment after its class goes.
    const titled = Number(getComputedStyle(this.areaTitle).opacity) > 0;
    const over = (COARSE.matches ? [this.itemHint] : [this.hearts, this.condition, ...(titled ? [this.areaTitle] : [])])
      .map((el) => el.getBoundingClientRect())
      .filter((box) => box.height > 0);
    this.moveHint.style.top = over.length > 0 ? `${Math.max(...over.map((box) => box.bottom)) + HINT_GAP}px` : '';
  }

  // Brief red crosshair when one of your shots lands.
  hitMarker(): void {
    this.crosshair.classList.add('hit');
    setTimeout(() => this.crosshair.classList.remove('hit'), 150);
  }

  setPing(ms: number): void {
    this.ping.textContent = `${Math.round(ms)} ms`;
  }

  setCrosshairHot(hot: boolean): void {
    this.crosshair.classList.toggle('hot', hot);
  }

  // A line `id` said, their name in the colour the roster has them in.
  chat(id: string, name: string, text: string): void {
    const li = document.createElement('li');
    const who = document.createElement('span');
    who.className = 'who';
    who.style.color = this.players.get(id)?.color ?? '';
    who.textContent = `${name}: `;
    li.append(who, document.createTextNode(text));
    this.pushLine(li);
  }

  system(text: string): void {
    const li = document.createElement('li');
    li.className = 'system';
    li.textContent = text;
    this.pushLine(li);
  }

  // A small note beside the thing that was just done (the copied room code), gone in a moment.
  // Local feedback like this stays out of the chat log.
  tip(anchor: HTMLElement, text: string): void {
    anchor.parentElement?.querySelector('.tip')?.remove();
    const el = document.createElement('span');
    el.className = 'tip';
    el.textContent = text;
    anchor.insertAdjacentElement('afterend', el);
    setTimeout(() => el.classList.add('gone'), 1200);
    setTimeout(() => el.remove(), 1600);
  }

  // A kill, worded and coloured like an announcement: "ann killed bob with a sniper headshot", "ann
  // ran over bob and killed them".
  // `friendly`: the two are on one side of a game (the shared package's `Rules.side`).
  announceKill(shooter: string, victim: string, item: KillItem, headshot: boolean, friendly: boolean): void {
    const [a, b] = [this.who(shooter), this.who(victim)];
    if (friendly) return this.death(a, ' killed ', b, ' with friendly fire');
    if (item === 'kart') return this.death(a, ' ran over ', b, ' and killed them');
    if (item === 'explosion') return this.death(a, ' blew up ', b);
    const how = item === 'pound' || item === 'strike' ? MOVE_KILLS[item] : item;
    this.death(a, ' killed ', b, ` with a ${how}${headshot ? ' headshot' : ''}`);
  }

  announceCrash(victim: string): void {
    this.death(this.who(victim), ' drove into a wall and died');
  }

  announceFall(victim: string): void {
    this.death(this.who(victim), ' fell to their death');
  }

  announceOutOfBounds(victim: string): void {
    this.death(this.who(victim), ' died out of bounds');
  }

  // A line of the log saying who died and how.
  private death(...parts: (Node | string)[]): void {
    const li = document.createElement('li');
    li.className = 'kill';
    li.append(...parts);
    this.pushLine(li);
  }

  // A player's name for a line of the log, in the colour they go by where the game has sides.
  private who(id: string): HTMLSpanElement {
    const span = Object.assign(document.createElement('span'), { textContent: this.playerName(id) });
    if (this.sided) span.style.color = this.players.get(id)?.color ?? '';
    return span;
  }

  private pushLine(li: HTMLLIElement): void {
    this.chatLog.appendChild(li);
    while (this.chatLog.children.length > CHAT_LINES) this.chatLog.firstChild?.remove();
    setTimeout(() => li.classList.add('faded'), CHAT_FADE_MS);
  }

  // The list of everyone else as tall as fits between its top and ROSTER_SHARE of the way down the
  // view, and never under ROSTER_MIN_ROWS.
  private fitRoster(): void {
    const top = this.playerList.getBoundingClientRect().top;
    const room = Math.max(ROSTER_MIN_ROWS * ROSTER_ROW, window.innerHeight * ROSTER_SHARE - top);
    this.playerList.style.maxHeight = `${Math.floor(room / ROSTER_ROW) * ROSTER_ROW}px`;
  }

  // One step of the list scrolling itself: the next row up into view, or, having rested at the
  // bottom, back to the top. Not while it's put away, all fits, or a hand is on it.
  private scrollRoster(): void {
    const list = this.playerList;
    const more = list.scrollHeight - list.clientHeight;
    if (more <= 1 || this.panel.classList.contains('collapsed') || performance.now() < this.rosterHeld) return;
    if (this.rosterRest > 0) {
      this.rosterRest--;
      return;
    }
    const atEnd = list.scrollTop >= more - 1;
    const next = [...list.children].find((row) => (row as HTMLElement).offsetTop > list.scrollTop + 1);
    list.scrollTo({ top: atEnd ? 0 : ((next as HTMLElement | undefined)?.offsetTop ?? more), behavior: 'smooth' });
    const arrives = atEnd ? 0 : Math.min(more, (next as HTMLElement | undefined)?.offsetTop ?? more);
    if (atEnd || arrives >= more - 1) this.rosterRest = ROSTER_REST_STEPS;
  }

  private renderPlayers(): void {
    const me = this.players.get(this.myId);
    this.playerMe.replaceChildren(...(me ? [rosterRow(me, true, this.myId === this.master)] : []));
    // Everyone else, a side's players together (in the sides' order, those on none after them).
    const others = [...this.players]
      .filter(([id]) => id !== this.myId)
      .sort(([, a], [, b]) => (a.side ?? '~').localeCompare(b.side ?? '~'));
    this.playerList.replaceChildren(...others.map(([id, p]) => rosterRow(p, false, id === this.master)));
    this.fitRoster();
  }
}

// A kart's wrenches as its driver's row shows them: what's left of a full kart's.
export interface Wrenches {
  wrenches: number;
  full: number;
}

function rosterRow(p: RosterEntry, mine: boolean, master: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.classList.toggle('me', mine);
  li.classList.toggle('dead', p.dead); // dimmed, with no hearts to show
  li.classList.toggle('ghost', p.ghost); // a ghost's mark where its hearts would be: it has none
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = p.color;
  li.append(dot);
  if (p.bot) li.append(pixelSvg(ROBOT, 'robot'));
  if (master) li.append(pixelSvg(CROWN, 'crown'));
  li.append(document.createTextNode(p.name + (mine ? ' (you)' : '')));
  const stats = document.createElement('span');
  stats.className = 'stats';
  if (p.ghost) stats.append(pixelSvg(GHOST, 'ghost'));
  else if (!p.dead) stats.append(lifeIcon(p.life.sprite), text(`${fmt(p.hearts)}/${p.life.hearts}`));
  stats.append(pixelSvg(KNIFE, 'knife', { G: 'guard', H: 'hilt' }), text(String(p.kills)));
  stats.append(pixelSvg(SKULL, 'skull'), text(String(p.deaths)));
  li.append(stats);
  // What they have besides their own life, a line of its own under the rest: the kart they drive.
  if (p.kart && !p.dead) {
    const extra = document.createElement('span');
    extra.className = 'stats extra';
    extra.append(lifeIcon('wrench'), text(`${fmt(p.kart.wrenches)}/${p.kart.full}`));
    li.append(extra);
  }
  return li;
}

interface RosterPlayer {
  id: string;
  name: string;
  color: string;
  bot?: boolean;
  hearts?: number;
  avatar: AvatarId;
  kills?: number;
  deaths?: number;
  dead?: boolean;
  ghost?: boolean;
}

interface RosterEntry {
  name: string;
  appearance: Appearance; // the look they wear and their own colour
  color: string; // the one they go by (liveries.ts `nameColour`)
  bot: boolean;
  hearts: number;
  life: LifeSpec; // a full life for the look they wear, and how it's drawn
  kills: number;
  deaths: number;
  dead: boolean;
  ghost: boolean; // in the room and not in its game (the shared package's sim/types.ts)
  side: string | null; // the side they're on in the room's game, by name, if any
  kart: Wrenches | null; // the kart they drive, if they're in one
}

function entry(p: RosterPlayer): RosterEntry {
  return {
    name: p.name,
    appearance: { avatar: p.avatar, color: p.color },
    color: nameColour(p),
    bot: !!p.bot,
    hearts: p.hearts ?? MAX_HEARTS,
    life: lifeOf(p.avatar),
    kills: p.kills ?? 0,
    deaths: p.deaths ?? 0,
    dead: !!p.dead,
    ghost: !!p.ghost,
    side: null,
    kart: null,
  };
}

function text(s: string): Text {
  return document.createTextNode(s);
}

// 7.5 stays 7.5; 8 stays 8.
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function loadHistory(): string[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((line): line is string => typeof line === 'string') : [];
  } catch {
    return [];
  }
}

// A cell of the key legend: the keys, then what they do.
function keyCell(keys: string[], does: string): HTMLElement {
  const cell = Object.assign(document.createElement('span'), { className: 'key' });
  cell.append(
    ...keys.map((key) => Object.assign(document.createElement('kbd'), { textContent: key, translate: false })),
  );
  cell.append(keys.length > 0 ? ` ${does}` : does);
  return cell;
}
