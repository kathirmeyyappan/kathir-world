// What each bot does, drawn from above in the guide's diagram style (diagram.ts).
import type { BotId } from '@world/shared';
import { Diagram, along, degTo, fmt, polar, type Pt } from './diagram';

// Strafes round the nearest player facing them; a wall or a drop in the way, it tightens its ring to
// get round it and eases back out after.
function circle(d: Diagram): void {
  const c: Pt = [210, 182];
  const r = 118;
  const me = polar(c, r, -140);
  const [from, wall, to] = [-8, 18, 44];
  const p0 = polar(c, r, from);
  const bend = polar(c, r - 52, wall);
  const p2 = polar(c, r, to);
  // Halfway along the curve: where it passes inside the wall.
  const tight: Pt = [(p0[0] + 2 * bend[0] + p2[0]) / 4, (p0[1] + 2 * bend[1] + p2[1]) / 4];
  d.ring(c, r);
  d.wall(polar(c, r, wall), 40, wall);
  d.line(me, along(me, c, 0.86), 'look');
  d.arc(c, r, -150, -128, 'move', { faint: true });
  d.arc(c, r, -128, from, 'move');
  d.path(`M ${fmt(p0[0])} ${fmt(p0[1])} Q ${fmt(bend[0])} ${fmt(bend[1])}, ${fmt(p2[0])} ${fmt(p2[1])}`, 'detour', {
    arrow: true,
  });
  d.subject(me, degTo(me, c));
  d.subject(tight, degTo(tight, c), true);
  d.person(c);
  d.label([c[0], c[1] + 36], ['nearest player'], { anchor: 'middle' });
  d.label([c[0], c[1] + 56], ['(the middle, alone)'], { note: true, anchor: 'middle' });
  d.label([c[0] - 6, 26], ['strafes round, facing them'], { anchor: 'middle' });
  d.label([430, 150], ['a wall or a drop ahead?']);
  d.label([430, 172], ['tightens its ring to get', 'round it, easing back', 'out once there’s room'], { note: true });
}

// Stands where it is and turns to face the nearest person, whoever else is closer.
function stalker(d: Diagram): void {
  const me: Pt = [190, 176];
  const was: Pt = [372, 62];
  const now: Pt = [404, 236];
  const far: Pt = [560, 92];
  const other: Pt = [118, 262];
  d.path('M 330 22 C 420 70, 440 170, 404 236 S 360 320, 330 344', 'move', { arrow: true, faint: true });
  d.line(me, along(me, was, 0.92), 'look', { faint: true });
  d.line(me, along(me, now, 0.93), 'look');
  d.arc(me, 78, degTo(me, was) + 4, degTo(me, now) - 4, 'turn', { arrow: true });
  d.person(was, true);
  d.person(now);
  d.person(far, true);
  d.otherBot(other);
  d.subject(me, degTo(me, now));
  d.label([me[0], me[1] + 40], ['never moves'], { anchor: 'middle' });
  d.label([282, 150], ['turns to', 'follow'], { note: true });
  d.label([432, 242], ['nearest person']);
  d.label([far[0], far[1] + 32], ['further off:', 'not watched'], { note: true, anchor: 'middle' });
  d.label([other[0], other[1] + 34], ['bots never count,', 'however close'], { note: true, anchor: 'middle' });
}

// Makes for whoever it's against, keeps the range its weapon likes, and circles them as it fires.
function fighter(d: Diagram): void {
  const them: Pt = [372, 196];
  const r = 104;
  const me = polar(them, r, 172);
  const from: Pt = [58, 300];
  const hidden: Pt = [566, 74];
  const block = along(them, hidden, 0.55);
  d.ring(them, r);
  d.line(from, along(from, me, 0.84), 'move', { arrow: true, faint: true });
  d.subject(from, degTo(from, me), true);
  d.arc(them, r, 180, 252, 'move', { arrow: true });
  d.arc(them, r, 128, 164, 'move', { faint: true });
  d.line(me, along(me, them, 0.86), 'shot', { arrow: true });
  d.wall(block, 64, degTo(them, hidden) + 90);
  d.person(hidden, true);
  d.person(them);
  d.crosshair(them);
  d.subject(me, degTo(me, them));
  d.label([from[0] + 34, from[1] + 22], ['nobody in sight:', 'goes to find them'], { note: true });
  d.label([them[0] - 6, 60], ['circles them as it fires,', 'changing its mind which way'], { anchor: 'middle' });
  d.label([them[0], them[1] + 46], ['the range its', 'weapon likes'], { note: true, anchor: 'middle' });
  d.label([hidden[0] - 6, hidden[1] + 36], ['behind a wall:', 'not shot at'], { note: true, anchor: 'middle' });
  d.label([452, 318], ['hurt: breaks off', 'for a heart'], { note: true });
}

// Watches whoever it can see; shoots the close ones (or anyone, once it's been hit); hides to reload.
function sniper(d: Diagram): void {
  const me: Pt = [170, 186];
  const r = 128;
  const near: Pt = [238, 98];
  const far: Pt = [478, 112];
  const hidden: Pt = [246, 288];
  const block = along(me, hidden, 0.62);
  const cover: Pt = [96, 222];
  const pillar = along(cover, near, 0.2);
  d.ring(me, r);
  d.label([me[0] - r + 12, me[1] - r + 34], ['close'], { note: true });
  d.line(me, along(me, near, 0.86), 'shot', { arrow: true });
  d.line(me, along(me, far, 0.96), 'look');
  d.line(me, along(me, block, 0.9), 'look', { faint: true });
  d.wall(block, 70, degTo(me, hidden) + 90);
  d.wall(pillar, 30, degTo(cover, near) + 90);
  d.path(`M ${fmt(me[0] - 14)} ${fmt(me[1] + 8)} Q 120 216, ${fmt(cover[0] + 14)} ${fmt(cover[1] - 2)}`, 'move', {
    arrow: true,
  });
  d.subject(cover, degTo(cover, near), true);
  d.person(near);
  d.crosshair(near);
  d.person(far);
  d.person(hidden, true);
  d.subject(me, degTo(me, near));
  d.label([near[0] + 30, near[1] - 18], ['close: scopes in', 'and shoots']);
  d.label([far[0] + 20, far[1] + 50], ['far: kept in its sights,', 'shot only once it’s', 'been hit itself'], {
    note: true,
    anchor: 'middle',
  });
  d.label([hidden[0] + 22, hidden[1] - 4], ['behind a wall:', 'unseen'], { note: true });
  d.label([cover[0] - 4, cover[1] + 34], ['ducks out of', 'sight to reload'], { note: true, anchor: 'middle' });
  d.label([420, 262], ['nobody in sight a while,', 'or hurt: moves to', 'another floor'], { note: true });
}

// Each bot's diagram, or null for one with nothing to show (the observer only stands there).
const DRAW: Record<BotId, ((d: Diagram) => void) | null> = { fighter, circle, stalker, observer: null, sniper };

export function botDiagram(bot: BotId, alt: string): HTMLElement[] {
  const draw = DRAW[bot];
  if (!draw) return [];
  const d = new Diagram(`dg-${bot}`);
  draw(d);
  return [d.element(alt)];
}
