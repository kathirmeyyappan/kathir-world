// Room code, player roster, ping, and chat. Pure DOM; the Game feeds it events. A slash typed in
// the chat offers the commands it could be the start of (commands.ts), listed above the box with
// the best nearest it: Up picks from the bottom, Down comes back, Enter or Tab (or a click) puts
// the pick in the box, where Enter sends it as anything else.
import {
  MAX_CHAT_LENGTH,
  MAX_HEARTS,
  heartsOf,
  type AvatarId,
  type Element,
  type ItemId,
  type PlayerClass,
} from '@world/shared';
import { HEART, KNIFE, ROBOT, SKULL, pixelSvg } from './pixelIcons';

import { IS_TOUCH } from '../input/touch';
import { roomLink } from '../net/lobby';
import { commandGroups, completionsOf, type Row } from './commands';

const CHAT_LINES = 8;
const CHAT_FADE_MS = 12_000;
// Lines sent from this tab, oldest first, that Up and Down step back through like a shell's history.
// Kept in sessionStorage, since dying reloads the page.
const HISTORY_KEY = 'world.chat-history';
const HISTORY_LINES = 50;
const MOVE_HINT_MS = 20_000; // how long the move hint is up: its animation's length (#move-hint)
const HINT_GAP = 8; // CSS pixels between the move hint and what it stacks against
// The layout where the item hint is at the top of the screen, under the touch buttons (styles.css).
const COARSE = window.matchMedia('(pointer: coarse)');

export class Hud {
  private readonly roomCode = document.getElementById('room-code') as HTMLButtonElement;
  private readonly panel = document.getElementById('room-panel')!;
  private readonly panelToggle = document.getElementById('panel-toggle') as HTMLButtonElement;
  private readonly playerList = document.getElementById('player-list')!;
  private readonly ping = document.getElementById('ping')!;
  private readonly chatLog = document.getElementById('chat-log')!;
  private readonly itemHint = document.getElementById('item-hint')!;
  private readonly itemHintMain = this.itemHint.querySelector('.main')!;
  private readonly itemHintStats = this.itemHint.querySelector('.stats')!;
  private readonly moveHint = document.getElementById('move-hint')!;
  private readonly fuel = document.getElementById('fuel')!;
  private readonly gear = document.getElementById('gear')!;
  private moveHintText = '';
  private moveHintTimer = 0;
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
  onChat: ((text: string) => void) | null = null;
  onChatOpenChange: ((open: boolean) => void) | null = null;

  constructor(roomId: string) {
    this.roomCode.textContent = roomId;
    this.roomCode.addEventListener('click', () => {
      navigator.clipboard?.writeText(roomLink(roomId)).then(() => this.tip(this.roomCode, 'copied'));
    });

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
        li.append(
          Object.assign(document.createElement('span'), { className: 'cmd', textContent: row.label }),
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

  setPlayers(list: RosterPlayer[]): void {
    this.players = new Map(list.map((p) => [p.id, entry(p)]));
    this.renderPlayers();
  }

  addPlayer(p: RosterPlayer): void {
    this.players.set(p.id, entry(p));
    this.renderPlayers();
    this.system(`${p.name} joined`);
  }

  // Once per snapshot: names (a rename shows here), hearts and kills on the roster. Re-renders only
  // when something moved.
  updateStats(
    list: {
      id: string;
      name: string;
      color: string;
      hearts: number;
      kills: number;
      dead: boolean;
      avatar: AvatarId;
    }[],
  ): void {
    let changed = false;
    for (const p of list) {
      const e = this.players.get(p.id);
      if (!e) continue;
      const life = heartsOf(p.avatar);
      if (
        e.name !== p.name ||
        e.color !== p.color ||
        e.hearts !== p.hearts ||
        e.life !== life ||
        e.kills !== p.kills ||
        e.dead !== p.dead
      ) {
        e.name = p.name;
        e.color = p.color;
        e.hearts = p.hearts;
        e.life = life;
        e.kills = p.kills;
        e.dead = p.dead;
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

  // Red crosshair while a shot from here would land.
  setCrosshairTarget(on: boolean): void {
    this.crosshair.classList.toggle('target', on);
  }

  // What you're holding and how to use it, or nothing.
  // The key legend along the bottom: the walker's is the page's own; a dragon flies forward and roars.
  setKeys(cls: PlayerClass): void {
    const el = document.getElementById('instructions')!;
    this.walkerKeys ??= el.innerHTML;
    el.innerHTML =
      cls === 'walker'
        ? this.walkerKeys
        : `<kbd translate="no">W</kbd> fly forward &nbsp;|&nbsp; <kbd translate="no">A</kbd><kbd translate="no">S</kbd><kbd translate="no">D</kbd> roar &nbsp;|&nbsp;
           Click select &nbsp;|&nbsp; <kbd translate="no">Z</kbd> toggle perspective &nbsp;|&nbsp; <kbd translate="no">O</kbd> fullscreen &nbsp;|&nbsp; <kbd translate="no">Esc</kbd> mouse`;
  }
  private walkerKeys: string | null = null;

  // `item` names what the hint is for: its text changes with the scope, but only a new item (or the
  // same one drawn again) starts the hint's time on touch over. An ice item's hint is frosted.
  setItemHint(text: string, stats = '', item = '', element: Element | null = null): void {
    const key = `${text}\n${stats}`;
    this.itemHint.classList.toggle('ice', element === 'ice');
    if (key === this.itemHintText) return;
    this.itemHintText = key;
    this.itemHintMain.textContent = text;
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

  // The moves the player's look has of its own and how each is done, or '' for none: a banner of
  // its own, up for MOVE_HINT_MS from when its text is first given (the look being taken), whatever
  // is held meanwhile.
  setMoveHint(text: string): void {
    if (text !== this.moveHintText) {
      this.moveHintText = text;
      this.moveHint.textContent = text;
      window.clearTimeout(this.moveHintTimer);
      // Its life is a CSS animation (#move-hint), which starts over as the element is shown again.
      this.moveHint.classList.add('hidden');
      void this.moveHint.offsetWidth;
      this.moveHint.classList.toggle('hidden', !text);
      if (text) this.moveHintTimer = window.setTimeout(() => this.moveHint.classList.add('hidden'), MOVE_HINT_MS);
    }
    if (!this.moveHint.classList.contains('hidden')) this.placeMoveHint();
  }

  // Stands the move hint clear of what it shares its place with: under the item hint where that is
  // at the top (a touch screen), over the item hint, the fuel bar and the gear panel where they
  // stack up from the bottom; in the item hint's own place (the stylesheet's) with none of them up.
  private placeMoveHint(): void {
    const up = (el: HTMLElement) => el.getBoundingClientRect().height > 0;
    const style = this.moveHint.style;
    style.top = style.bottom = '';
    if (COARSE.matches) {
      if (up(this.itemHint)) style.top = `${this.itemHint.getBoundingClientRect().bottom + HINT_GAP}px`;
      return;
    }
    const tops = [this.itemHint, this.fuel, this.gear].filter(up).map((el) => el.getBoundingClientRect().top);
    if (tops.length > 0) style.bottom = `${window.innerHeight - Math.min(...tops) + HINT_GAP}px`;
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

  chat(name: string, color: string, text: string): void {
    const li = document.createElement('li');
    const who = document.createElement('span');
    who.className = 'who';
    who.style.color = color;
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

  // A kill, worded and coloured like an announcement: "ann killed bob with a sniper headshot".
  announceKill(shooter: string, victim: string, item: ItemId | 'pound', headshot: boolean): void {
    const li = document.createElement('li');
    li.className = 'kill';
    li.textContent = `${this.playerName(shooter)} killed ${this.playerName(victim)} with a ${item === 'pound' ? 'ground pound' : item}${headshot ? ' headshot' : ''}`;
    this.pushLine(li);
  }

  announceFall(victim: string): void {
    const li = document.createElement('li');
    li.className = 'kill';
    li.textContent = `${this.playerName(victim)} fell to their death`;
    this.pushLine(li);
  }

  private pushLine(li: HTMLLIElement): void {
    this.chatLog.appendChild(li);
    while (this.chatLog.children.length > CHAT_LINES) this.chatLog.firstChild?.remove();
    setTimeout(() => li.classList.add('faded'), CHAT_FADE_MS);
  }

  private renderPlayers(): void {
    this.playerList.replaceChildren();
    for (const [id, p] of this.players) {
      const li = document.createElement('li');
      if (id === this.myId) li.className = 'me';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      li.append(dot);
      if (p.bot) li.append(pixelSvg(ROBOT, 'robot'));
      li.append(document.createTextNode(p.name + (id === this.myId ? ' (you)' : '')));
      const stats = document.createElement('span');
      stats.className = 'stats';
      // Dead: just the skull. Alive: hearts and kills.
      if (p.dead) stats.append(pixelSvg(SKULL, 'skull'));
      else {
        stats.append(pixelSvg(HEART, 'heart', { '+': 'hi' }), text(`${fmt(p.hearts)}/${p.life}`));
        stats.append(pixelSvg(KNIFE, 'knife', { G: 'guard', H: 'hilt' }), text(String(p.kills)));
      }
      li.append(stats);
      this.playerList.appendChild(li);
    }
  }
}

interface RosterPlayer {
  id: string;
  name: string;
  color: string;
  bot?: boolean;
  hearts?: number;
  avatar?: AvatarId;
  kills?: number;
  dead?: boolean;
}

interface RosterEntry {
  name: string;
  color: string;
  bot: boolean;
  hearts: number;
  life: number; // a full life for their class
  kills: number;
  dead: boolean;
}

function entry(p: RosterPlayer): RosterEntry {
  return {
    name: p.name,
    color: p.color,
    bot: !!p.bot,
    hearts: p.hearts ?? MAX_HEARTS,
    life: p.avatar ? heartsOf(p.avatar) : MAX_HEARTS,
    kills: p.kills ?? 0,
    dead: !!p.dead,
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
