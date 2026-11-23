// The kinds of row the menu is made of, and how each draws itself. A row is plain data: what it says,
// and functions that read and change what it's about. The menu's content (tabs.ts) never touches the
// DOM, and a new kind of row is a type here and a case in `draw`.
import { Picker, type Choice } from '../../app/Picker';
import { IS_TOUCH } from '../../input/touch';
import { pixelSvg } from '../pixelIcons';
import { named, type Listed } from '../emblem';
import { pressTwice } from '../pressTwice';

export interface Tab {
  title: string;
  sections: Section[];
  shown?: () => boolean; // whether it's there right now; always, unless said
  first?: () => boolean; // whether the menu opens on it right now, rather than on the tab it was left on
}

export interface Section {
  title: string;
  rows: Row[];
  shown?: () => boolean; // whether it's there right now; always, unless said
  wide?: boolean; // takes the room of two where a tab's sections stand side by side (a phone on its side)
}

export type Row = Toggle | Stepper | Field | Select | Buttons | Links | Share | Words | Board;

// A setting with a few values: its button reads the one it's on and moves it to the next.
export interface Toggle {
  kind: 'toggle';
  label: string;
  key?: string; // its key in play, shown with a keyboard
  value: () => string;
  press: () => void;
}

// A setting stepped through its values, < and > either side of the one it's on. With `auto`, a
// button before them hands the choice to the game, lit while it has it; a step takes it back.
export interface Stepper {
  kind: 'stepper';
  label: string;
  value: () => string;
  step: (by: 1 | -1) => void;
  can: (by: 1 | -1) => boolean; // whether there's a value that way
  auto?: { label: () => string; on: () => boolean; press: () => void };
  hint?: () => string | null; // a warning under it, while there's one to give
}

// Something typed and sent, a name or a room code. `note` is what to say under it (an error, or how
// the sending went), read again whenever the menu refreshes.
export interface Field {
  kind: 'field';
  label: string;
  placeholder: string;
  maxLength: number;
  action: string; // the button's label
  value?: () => string; // what the box shows while it isn't being typed in
  submit: (text: string) => void;
  note: () => Note | null;
  hint?: string; // said under it, dimmed, while there's no note
}

// One of a list picked from a dropdown (app/Picker.ts): the box shows the one it's on.
export interface Select {
  kind: 'select';
  label: string;
  choices: Choice[];
  value: () => string; // the choice it's on, by its value
  pick: (value: string) => void;
  hint?: string; // said under it, dimmed
}

export interface Note {
  text: string;
  tone: 'ok' | 'bad' | 'busy' | 'hint';
}

export interface Buttons {
  kind: 'buttons';
  buttons: Button[];
}

// Words to read, as they are right now: `big` for what the rows under them are about.
export interface Words {
  kind: 'words';
  text: () => string;
  big?: boolean;
}

// Players in columns, a team to each: its name in its colour over who's on it. While they `can` be
// moved, a player goes to another column by a drag of their name onto it, or by a tap on the name
// and then on the column (a touch has no drag).
export interface Board {
  kind: 'board';
  columns: () => Column[];
  can: () => boolean;
  move: (player: string, to: number) => void; // a player, by id, to the column at that place
  hint?: () => string | null; // said under it, while there's something to say
}

export interface Column {
  name: string;
  colour: string;
  players: Listed[]; // each with their emblem before their name
}

export interface Button {
  label: string;
  press: () => void;
  shown?: () => boolean; // whether it's there right now; always, unless said
  enabled?: () => boolean; // whether it can be pressed right now, or is greyed; always, unless said
  // What a press has to be warned of first, right now, if anything: said under the buttons, the
  // press then to be made again (pressTwice.ts).
  warning?: () => string | null;
  danger?: boolean; // red: a way out of the room
}

// Other pages to go and see, side by side as the home screen has them (`.home-link` in styles.css):
// a pixel icon over the words, each opening in a new tab.
export interface Links {
  kind: 'links';
  links: Link[];
}

export interface Link {
  label: string;
  href: string;
  icon: string[]; // a bitmap of ui/pixelIcons.ts
  classes?: Record<string, string>; // the CSS class of each of the bitmap's characters that has one
}

// A link to hand on: copied, or on a phone sent through the share sheet, and shown to copy by hand.
export interface Share {
  kind: 'share';
  name: string; // what it's a link to ("global")
  link: string;
  note?: string;
}

// A drawn row, and how to bring it up to date with what it shows.
export interface Drawn {
  el: HTMLElement;
  refresh?: () => void;
}

const SAID_MS = 1500; // how long a share button says what it did

export function draw(row: Row): Drawn {
  switch (row.kind) {
    case 'toggle':
      return toggle(row);
    case 'stepper':
      return stepper(row);
    case 'field':
      return field(row);
    case 'select':
      return select(row);
    case 'buttons':
      return buttons(row);
    case 'links':
      return links(row);
    case 'share':
      return share(row);
    case 'words':
      return words(row);
    case 'board':
      return board(row);
  }
}

// Drawn afresh whenever what it shows changes, and otherwise left alone, so a drag isn't cut short.
function board(row: Board): Drawn {
  const el = element('div', 'board');
  const columns = element('div', 'columns');
  const hint = element('div', 'hint');
  el.append(columns, hint);
  let picked: string | null = null; // the player tapped, to go where the next tap lands
  let shown = '';
  const fill = (cols: Column[], can: boolean) =>
    columns.replaceChildren(
      ...cols.map((col, to) => {
        const column = element('div', can ? 'column open' : 'column');
        column.style.setProperty('--team', col.colour);
        const head = element('div', 'head');
        head.append(element('span', 'name', col.name), element('span', 'count', String(col.players.length)));
        column.append(head);
        for (const p of col.players) {
          const player = element('div', p.id === picked ? 'player picked' : 'player');
          player.append(...named(p.name, p.appearance));
          player.translate = false;
          if (can) {
            player.draggable = true;
            player.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', p.id));
            player.addEventListener('click', (e) => {
              if (picked !== null && picked !== p.id) return; // a tap on their column, for the one picked
              e.stopPropagation();
              picked = picked === p.id ? null : p.id;
              refresh();
            });
          }
          column.append(player);
        }
        if (!can) return column;
        column.addEventListener('dragover', (e) => e.preventDefault());
        column.addEventListener('drop', (e) => {
          e.preventDefault();
          const id = e.dataTransfer?.getData('text/plain');
          if (id) row.move(id, to);
        });
        column.addEventListener('click', () => {
          if (picked === null) return;
          row.move(picked, to);
          picked = null;
          refresh();
        });
        return column;
      }),
    );
  const refresh = () => {
    const cols = row.columns();
    const can = row.can();
    if (!can || !cols.some((col) => col.players.some((p) => p.id === picked))) picked = null;
    const now = JSON.stringify([cols, can, picked]);
    if (now !== shown) {
      shown = now;
      fill(cols, can);
    }
    const text = row.hint?.() ?? '';
    if (hint.textContent !== text) hint.textContent = text;
    hint.hidden = !text;
  };
  return { el, refresh };
}

function words(row: Words): Drawn {
  const el = element('div', row.big ? 'words big' : 'words');
  const refresh = () => {
    const text = row.text();
    if (el.textContent !== text) el.textContent = text;
  };
  return { el, refresh };
}

function toggle(row: Toggle): Drawn {
  const el = element('div', 'row');
  const name = element('span', 'name', row.label);
  if (row.key && !IS_TOUCH) name.append(element('kbd', '', row.key));
  const button = element('button', 'value');
  button.translate = false;
  button.addEventListener('click', () => {
    row.press();
    refresh();
  });
  const refresh = () => {
    const value = row.value();
    if (button.textContent !== value) button.textContent = value;
    button.classList.toggle('off', value === 'OFF');
  };
  el.append(name, button);
  return { el, refresh };
}

function stepper(row: Stepper): Drawn {
  const el = element('div', 'stepper');
  const line = element('div', 'row');
  const controls = element('div', 'controls');
  const refreshers: (() => void)[] = [];
  const pressing = (button: HTMLButtonElement, press: () => void) =>
    button.addEventListener('click', () => {
      press();
      refresh();
    });
  const steps = element('div', 'steps');
  if (row.auto) {
    const { label, on, press } = row.auto;
    const auto = element('button', 'auto');
    auto.translate = false;
    pressing(auto, press);
    refreshers.push(() => {
      const text = label();
      if (auto.textContent !== text) auto.textContent = text;
      auto.classList.toggle('on', on());
      steps.classList.toggle('off', on());
    });
    controls.append(auto);
  }
  const reading = element('span', 'reading');
  reading.translate = false;
  for (const by of [-1, 1] as const) {
    const button = element('button', 'step', by < 0 ? '<' : '>');
    button.translate = false;
    pressing(button, () => row.step(by));
    refreshers.push(() => (button.disabled = !row.can(by)));
    steps.append(by < 0 ? button : reading, by < 0 ? reading : button);
  }
  refreshers.push(() => {
    const text = row.value();
    if (reading.textContent !== text) reading.textContent = text;
  });
  controls.append(steps);
  line.append(element('span', 'name', row.label), controls);
  el.append(line);
  if (row.hint) {
    const { hint } = row;
    const warning = element('div', 'hint');
    refreshers.push(() => {
      const text = hint() ?? '';
      if (warning.textContent !== text) warning.textContent = text;
      warning.hidden = !text;
    });
    el.append(warning);
  }
  const refresh = () => refreshers.forEach((r) => r());
  return { el, refresh };
}

function field(row: Field): Drawn {
  const el = element('div', 'field');
  const input = element('input');
  input.type = 'text';
  input.maxLength = row.maxLength;
  input.placeholder = row.placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.translate = false;
  const go = element('button', 'go', row.action);
  const note = element('div', 'note');
  const line = element('div', 'line');
  line.append(input, go);
  el.append(element('div', 'name', row.label), line, note);
  // The box shows what the row is about, and follows it when that changes; between, it's the
  // player's to type in, whatever has the focus (pressing the button takes it from the box).
  let shown: string | undefined;
  const refresh = () => {
    const now = row.value?.();
    if (now !== undefined && now !== shown) {
      shown = now;
      input.value = now;
    }
    const n = row.note() ?? (row.hint ? { text: row.hint, tone: 'hint' } : null);
    if (note.textContent !== (n?.text ?? '')) note.textContent = n?.text ?? '';
    note.dataset.tone = n?.tone ?? '';
  };
  const submit = () => {
    row.submit(input.value);
    input.blur(); // on a phone, puts the keyboard away
    refresh();
  };
  go.addEventListener('click', submit);
  // What's typed here is for this box, not for the game or the chat (whose keys listen on the window).
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') input.blur();
  });
  return { el, refresh };
}

function select(row: Select): Drawn {
  const el = element('div', 'field');
  const box = element('div', 'picker');
  const picker = new Picker(box, row.choices, row.pick);
  el.append(element('div', 'name', row.label), box);
  // Its note only ever says its hint, so one with none has no line kept for it.
  if (row.hint) {
    const note = element('div', 'note', row.hint);
    note.dataset.tone = 'hint';
    el.append(note);
  }
  // Its list drops under the box, where the menu's body may end: opened, it is brought into view.
  box.addEventListener('click', () => box.querySelector('.options:not(.hidden)')?.scrollIntoView({ block: 'nearest' }));
  // The box follows what the row is about, which the pick changes only once the game has heard of it.
  let shown: string | undefined;
  const refresh = () => {
    const now = row.value();
    if (now === shown) return;
    shown = now;
    picker.choose(now);
  };
  return { el, refresh };
}

function buttons(row: Buttons): Drawn {
  const el = element('div', 'asked');
  const line = element('div', 'buttons');
  const warning = element('div', 'warning');
  // Said under the buttons, where the menu's body may end: brought into view as it's said.
  const say = (text: string) => {
    warning.textContent = text;
    if (text) warning.scrollIntoView({ block: 'nearest' });
  };
  const live: (() => void)[] = []; // each button that comes and goes or greys, brought up to date
  for (const b of row.buttons) {
    const button = element('button', '', b.label);
    if (b.danger) button.classList.add('danger');
    pressTwice(button, b.warning ?? (() => null), say, b.press);
    if (b.shown || b.enabled)
      live.push(() => {
        button.hidden = !(b.shown?.() ?? true);
        button.disabled = !(b.enabled?.() ?? true);
      });
    line.append(button);
  }
  el.append(line, warning);
  return { el, refresh: () => live.forEach((update) => update()) };
}

function links(row: Links): Drawn {
  const el = element('div', 'home-links');
  for (const link of row.links) {
    const a = element('a', 'home-link');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.append(pixelSvg(link.icon, 'home-icon', link.classes), element('span', '', link.label));
    el.append(a);
  }
  return { el };
}

function share(row: Share): Drawn {
  const el = element('div', 'share');
  const title = element('p', 'code', row.name);
  title.translate = false;
  const label = canShare() ? 'SHARE JOIN LINK' : 'COPY JOIN LINK';
  const button = element('button', 'wide', label);
  const link = element('div', 'link', row.link);
  link.translate = false;
  el.append(title, button, link);
  if (row.note) el.append(element('p', 'warn', row.note));
  let timer = 0;
  const say = (text: string) => {
    button.textContent = text;
    clearTimeout(timer);
    timer = window.setTimeout(() => (button.textContent = label), SAID_MS);
  };
  // To the phone's share sheet where there is one, else the clipboard, and when neither works,
  // selected on the card to copy by hand.
  button.addEventListener('click', async () => {
    if (canShare()) {
      try {
        await navigator.share({ title: 'kathir world', url: row.link });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // the sheet was closed
      }
    }
    try {
      await navigator.clipboard.writeText(row.link);
      say('COPIED!');
    } catch {
      getSelection()?.selectAllChildren(link);
      say('COPY IT BELOW');
    }
  });
  return { el };
}

// On a phone the share sheet, which can copy too; with a mouse, the clipboard is what's expected.
function canShare(): boolean {
  return IS_TOUCH && 'share' in navigator;
}

// Text goes in as text, never markup: some of it (a link, a name) comes from the page's URL.
function element<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}
