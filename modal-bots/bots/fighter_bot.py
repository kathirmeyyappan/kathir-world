"""Fight whoever it's against, as well as it's rated and in its own way.

How the fighter works. It decides on every snapshot and answers each with one input frame, from
the snapshot, its maps of the world (``common.map``: the ground, the solids and the bodies) and a
little it remembers: where everyone was over the last few ticks, who it's after, and what last
hurt it. How well it does all of it is its ``Skill``, and what it's like is its ``Temper``
(``common.fighting``), both from dice seeded by its room and its name.

1. Who it's against. In a game with sides (a shootout's teams), everyone on another side, and it
   leaves its own side alone. With none: every person, or with ``targets`` every player whose name
   has one of them in it. Never a ghost, and nobody in the first seconds of a new body. One a game
   brought is against nobody until that game is being played, and nobody once it's over.

2. Its rating. A game that brought it says how good it's to be (its level, in the game's bots);
   called from chat it's of the middle level. Its own form sets it a little either side of that.

3. Its weapons. It carries the ones its temper names and holds the one it likes best, asking for
   it by command until it has it. With the wits to, it draws its other where the first doesn't
   suit: a rifle with someone right on top of it, a spray whose tank has run dry.

4. Seeing. Someone is in its sight when nothing stands between its eyes and their chest. It
   checks the nearest few of those it's against every few ticks and goes for the nearest in
   sight, staying on whoever it's already fighting unless another is much nearer, and turning on
   whoever just hurt it. Someone newly in its sight it takes its reaction to go for.

5. Aiming and firing. Its aim swings toward where it believes its target is (``Aim``), and it
   fires when that's on them and they're in its weapon's reach: a shot as often as the weapon
   allows and its skill keeps up with; a spray in bursts, while they're in its cone and there's
   fuel; a rifle from a stand, scoped, at the chest, and only at someone who has gone on as they
   were for a while (stood, or walked one way), so whoever keeps changing their mind isn't shot
   from across the map. It holds its fire while one of its own side is in the way.

6. Moving in a fight. It keeps the range its weapon and its nerve like, closing in from further
   and backing off from nearer, and as far as its skill has it moving at all it circles its
   target, changing its mind about which way and jumping now and then. It takes no step that
   leaves the ground it's on.

7. Getting somewhere. With nobody in sight it makes for the nearest of those it's against, the
   bolder the nearer: along a way over the ground (``Route``), found off its event loop and found
   again as they move, or straight across open floor. Hurt enough, by its nerve and its wits, it
   breaks off for the nearest heart. In a game with sides and nobody to fight near, it keeps with
   its own.

8. Dying. Where its game brings the dead back, it asks to be after a few seconds and takes up its
   weapon again; anywhere else it lies there until the room drops its seat, which ends its run.
"""

from __future__ import annotations

import asyncio
import math
import random
import time
from collections import deque
from collections.abc import Mapping
from typing import Any

from common import (
    Bodies,
    Controls,
    Event,
    Ground,
    Player,
    RoomConnectionError,
    Route,
    Snapshot,
    Solids,
    Vec3,
    WorldState,
    connect,
    load_bodies,
    load_ground,
    load_solids,
    log_death,
    log_kill,
    log_message,
)
from common.controls import TICK_RATE
from common.deployment import validate_duration
from common.fighting import ARMS, Aim, Arm, Skill, Temper, believed, mark_on, skill, temper
from common.map.bodies import EYE_HEIGHT

# How good a fighter its game's least level asks for and its most, of all a fighter can be: short
# of both ends, since its form goes either side.
RATINGS = (0.08, 0.92)
UNRATED = 0.5  # the rating of a fighter no game brought
TALENT = 0.08  # how far a fighter's own form sets it from its rating
SIGHT_EVERY = 3  # ticks between its checks of who's in sight
SIGHT_CHECKS = 4  # the nearest this many it's against are checked
STICK = 0.6  # another has to be this share of its target's distance, or nearer, for it to change
FRESH_SECONDS = 2.0  # someone in a new body is left alone this long
LOST_SECONDS = 1.0  # out of its sight this long, a target is someone new to it when they're back
CHEST = 0.55  # how far up a body it aims: its chest, and for the best shots now and then its head
HEAD = 0.92
HEADS = 0.12  # the share of its marks that are a head, for the most skilled there is: never a rifle's
TRIGGER = 1.2  # it fires with its aim within this many of the body's widths of its mark
CONE = 0.7  # and a spray with its mark within this share of its cone
STEADY = {"scoped": 0.15, "air": 1.3}  # how its aim's slack scales down a scope, and off the ground
# Seconds a rifle's target has to have gone on as they were before a shot at them, least skill to
# most: someone who keeps changing their mind is never shot, and someone stood still is.
SETTLE_SECONDS = (1.6, 0.7)
JOLT = 3.0  # m/s of change in how someone is moving that is them changing their mind
SCOPED_LEAD = 0.5  # the least of the lead its aim gives someone down a scope, for the least skilled
BURST_SECONDS = (0.6, 2.0)  # how long it holds a spray at a go
DRY = 0.4  # seconds of fuel under which a spray's tank is as good as empty
REFILLED_SECONDS = 9.0  # how long it leaves a spray put away before taking it up again
CROWDED = 9.0  # metres within which someone is right on top of a rifle
SWAP_SECONDS = (1.2, 0.4)  # how long drawing another weapon keeps it from firing, least skill to most
ASK_EVERY = TICK_RATE  # ticks between askings for a weapon it isn't holding yet
THINK_EVERY = 6  # ticks between its thoughts about where to go
MOVE_EVERY = 3  # ticks between its choices of a step in a fight
SWAY_SECONDS = (0.4, 1.4)  # how long it keeps to one way of circling
JUMPS = 0.5  # jumps a second in a fight, for the one fondest of them and most given to dodging
STEP = 0.5  # metres a walk steps up or down on its own
DROP = 1.0  # metres under its feet past which ground ahead isn't ground to step onto
AHEAD = 2.0  # metres ahead it checks its footing for
FOOT_SAMPLE = 0.5
REPLAN = 4.0  # metres its goal has to move for it to find its way again
REPLAN_EVERY = TICK_RATE // 2  # ticks, at the least, between findings of a way
ARRIVED = 1.5  # metres from where it was going that count as there
HEART_REACH = 70.0  # metres it will go for a heart
HEARTS_FULL = 10.0
NEARBY_HEART = 8.0  # metres: a heart this close is worth a detour for anyone not at full health
# The hearts under which the one with the most wits breaks off for one: the boldest, and the shyest.
# With fewer wits, fewer hearts, down to never thinking of it.
HURT = (2.0, 5.0)
NO_WAY_SECONDS = 4.0  # how long it leaves alone somewhere it found no way to
KEEP_WITH = 18.0  # metres from the nearest of its side past which it goes back to them
FAR_FIGHT = 45.0  # metres within which someone it's against is a fight to go to before its own side
RUN_FROM = 12.0  # metres of way left from which it runs
RESPAWN_SECONDS = (2.0, 5.0)  # how long it lies dead before asking to be brought back
# Seconds after letting go of a ladder that it walks with its look turned aside, so the walk that
# took hold of it (straight in, facing it) doesn't take hold again.
ASIDE_SECONDS = 1.2
HISTORY = 16  # ticks of where everyone was that it keeps


async def run_fighter_bot(
    room: str,
    name: str = "fighter-bot",
    seconds: float = 300,
    *,
    targets: tuple[str, ...] = (),
    lobby_url: str | None = None,
    direct_ws_url: str | None = None,
    spawn: Vec3 | None = None,
    avatar: str | None = None,
) -> dict[str, Any]:
    validate_duration(seconds)
    connect_started = time.monotonic()
    connection = await connect(lobby_url, room, name, direct_url=direct_ws_url, spawn=spawn, avatar=avatar)
    connected_at = time.monotonic()
    state = WorldState(connection.welcome, connection.room)
    controls = Controls(connection)
    # Its maps off the event loop, where every other bot of this process is being stepped.
    ground, solids, bodies = await asyncio.gather(
        asyncio.to_thread(load_ground), asyncio.to_thread(load_solids), asyncio.to_thread(load_bodies)
    )
    fighter = Fighter(ground, solids, bodies, f"{connection.room}/{name}", targets)
    completed = False
    log_message(name, "joined room", player_id=connection.id, room=connection.room, arms=list(fighter.temper.arms))

    try:
        async with asyncio.timeout(seconds):
            while True:
                message = await connection.receive()
                state.apply(message)
                me = state.me
                if me is None:
                    break
                if isinstance(message, Event):
                    fighter.heard(message, me, state)
                    if message.t == "kill" and message.data["shooter"] == me.id:
                        victim = state.players.get(message.data["victim"])
                        log_kill(name, victim.name if victim else "?", item=message.data["item"])
                    elif message.t == "kill" and message.data["victim"] == me.id:
                        shooter = state.players.get(message.data["shooter"])
                        log_death(name, shooter.name if shooter else "?", item=message.data["item"])
                if not isinstance(message, Snapshot):
                    continue
                for command in fighter.decide(state, controls):
                    await controls.command(command)
                if fighter.rises(state.tick):
                    await controls.respawn()
                await controls.send_input()
    except TimeoutError:
        completed = True
    except RoomConnectionError:
        pass  # the room let it go: it died where the dead aren't brought back, or its game is over
    finally:
        fighter.stop()
        if connection.close_code is None:
            await connection.close(reason=f"{name} complete")

    observed_seconds = time.monotonic() - connected_at
    log_message(name, "finished", completed=completed, shots=fighter.shots, hits=fighter.hits, kills=fighter.kills)
    return {
        "bot": name,
        "completed": completed,
        "observed_seconds": round(observed_seconds, 6),
        "connection_seconds": round(connected_at - connect_started, 6),
        "targets": list(targets),
        "shots": fighter.shots,
        "hits": fighter.hits,
        "kills": fighter.kills,
        "deaths": fighter.deaths,
        "last_tick": state.tick,
        "final_state": state.to_dict(),
    }


def sides_of(game: Mapping[str, Any]) -> dict[str, int]:
    """The side each player is on in a game being played, by id; none where the game has no
    sides, or isn't on."""
    teams = game.get("teams")
    if game.get("phase") != "playing" or not isinstance(teams, list):
        return {}
    # A team lists a person by their id and one of the game's bots by its key, come or not.
    bots = {bot["key"]: bot["id"] for bot in game.get("bots") or []}
    sides = {bots.get(member, member): side for side, team in enumerate(teams) for member in team}
    return {str(player): side for player, side in sides.items() if player is not None}


class Fighter:
    """What a fighter is doing between snapshots; ``decide`` runs once for each."""

    def __init__(self, ground: Ground, solids: Solids, bodies: Bodies, seed: str, targets: tuple[str, ...] = ()):
        self.ground = ground
        self.solids = solids
        self.bodies = bodies
        self.targets = tuple(t.lower() for t in targets)
        self.dice = random.Random(seed)
        self.temper: Temper = temper(self.dice)
        self.talent = self.dice.uniform(-TALENT, TALENT)
        # Where it stands among fighters for having an idea: it has one where its skill's wits
        # come to more than this, so the better it's rated the more it thinks of.
        self._nous = self.dice.random()
        self.rating = UNRATED
        self.skill: Skill = skill(self.rating + self.talent)
        self.aim = Aim(self.skill, self.dice)
        self.shots = self.hits = self.kills = self.deaths = 0
        self.arm = self.temper.arms[0]  # the weapon it means to hold
        self._asked = -ASK_EVERY  # the tick it last asked for it
        self._fumbling = 0  # the tick until which a weapon just drawn isn't ready
        self._put_away = -(10**9)  # the tick it last put its best weapon away
        self._seen: deque[dict[str, Vec3]] = deque(maxlen=HISTORY)
        self._bodies: dict[str, tuple[int, int]] = {}  # each player's body, and the tick it was first seen in it
        self._sighted: dict[str, bool] = {}  # whether each of those it checked last was in sight
        self._next_sight = 0
        self.target: str | None = None  # who it's fighting: in its sight, and it has reacted
        self._noticed: tuple[str, int] | None = None  # who has come into its sight, and the tick it goes for them
        self._last_seen: dict[str, int] = {}  # the tick each was last in its sight
        self._hurt_by: str | None = None
        self._ready = 0  # the tick it may next fire
        self._steady: tuple[str, int, tuple[float, float, float]] | None = (
            None  # who it's watching move, since when they've gone on as they were, and how they were moving
        )
        self._burst_until = 0  # the tick a spray's burst runs to
        self._head = False  # whether its mark on this target is their head
        self._sway = 0  # which way it's circling: 1, -1, or 0 stood
        self._sway_until = 0
        self._step: tuple[float, float] = (0.0, 0.0)  # the step it's taking in a fight, across the floor
        self._next_step = 0
        self._next_think = 0
        self._goal: Vec3 | None = None  # where it's going (feet), with nobody to fight where it is
        self._route: Route | None = None
        self._finding: asyncio.Task[list[int] | None] | None = None
        self._found_for: Vec3 | None = None  # where the way it has, or is finding, leads
        self._next_find = 0
        self._doors: Mapping[str, bool] = {}  # the room's, open or shut (WorldState.doors)
        self._aside_until = 0  # the tick until which it looks aside of its way, clear of a ladder
        self._died: int | None = None  # the tick it was first seen dead
        self._rise: int | None = None  # the tick it asks to be brought back

    def stop(self) -> None:
        if self._finding is not None:
            self._finding.cancel()

    def heard(self, event: Event, me: Player, state: WorldState) -> None:
        """Something happened in the room: what hit it, what it hit, and what it killed."""
        if event.t == "hit":
            if event.data["victim"] == me.id and event.data.get("shooter") not in (None, me.id):
                self._hurt_by = str(event.data["shooter"])
            elif event.data.get("shooter") == me.id:
                self.hits += 1
        elif event.t == "shot" and event.data["id"] == me.id:
            self.shots += 1
        elif event.t == "kill" and event.data["shooter"] == me.id:
            self.kills += 1

    def rises(self, tick: int) -> bool:
        """Whether to ask now to be brought back from the dead: once, a few seconds after dying."""
        if self._rise is None or tick < self._rise:
            return False
        self._rise = None
        return True

    def decide(self, state: WorldState, controls: Controls) -> list[str]:
        """Set the controls for this snapshot; returns the commands to send with it."""
        me = state.me
        assert me is not None
        tick = state.tick
        self._doors = state.doors
        self._seen.append({p.id: p.pos for p in state.players.values()})
        for p in state.players.values():
            if self._bodies.get(p.id, (None, 0))[0] != p.body:
                self._bodies[p.id] = (p.body, tick)
        if me.dead:
            return self._lie(tick, controls)
        self._died = None
        self._rate(state)
        sides = sides_of(state.game)
        # One a game brought fights in that game, and stands by through its countdown and results.
        idle = state.brought is not None and state.game.get("phase") != "playing"
        foes = [] if idle else self._foes(state, me, sides, tick)
        allies = [
            p
            for p in state.players.values()
            if p.id != me.id and not p.dead and sides.get(p.id, -1) == sides.get(me.id, -2)
        ]
        target = self._watch(state, me, foes, tick)
        asks = self._hold(me, target, tick)
        if tick >= self._next_think:
            self._next_think = tick + THINK_EVERY
            self._think(state, me, foes, allies, target, tick)
        eye = self.bodies.eye_of(me)
        mark = self._mark(me, target)
        if mark is not None:
            grounded = abs(me.vy) < 0.5
            steady = (STEADY["scoped"] if me.scoped else 1.0) * (1.0 if grounded else STEADY["air"])
            self.aim.swing(eye, mark, self.temper.knack.get(self.arm, 1.0), steady)
        else:
            self.aim.turn(eye, self._ahead(me, foes))
        # No map of its has ladders in it, and a walk straight into one climbs it: it lets go at
        # once, and goes on looking aside of its way for a moment.
        if me.climbing:
            self._aside_until = tick + round(ASIDE_SECONDS * TICK_RATE)
            controls.look(self.aim.yaw + math.pi / 2, 0)
            controls.stop()
            controls.jump()
            controls.shoot(False)
            return asks
        controls.look(self.aim.yaw + (math.pi / 2 if tick < self._aside_until and mark is None else 0), self.aim.pitch)
        self._move(state, me, target, tick, controls)
        self._fire(me, target, mark, allies, tick, controls)
        return asks

    def _lie(self, tick: int, controls: Controls) -> list[str]:
        """Dead: nothing held, and a few seconds on, a word to be brought back."""
        controls.stop()
        controls.shoot(False)
        controls.scope(False)
        controls.run(False)
        if self._died is None:
            self._died = tick
            self.deaths += 1
            self._rise = tick + round(self.dice.uniform(*RESPAWN_SECONDS) * TICK_RATE)
            self.target = self._noticed = self._goal = self._route = None
        return []

    def _rate(self, state: WorldState) -> None:
        rating = state.rating(RATINGS, UNRATED)
        if rating == self.rating:
            return
        self.rating = rating
        self.skill = skill(rating + self.talent)
        self.aim = Aim(self.skill, self.dice, self.aim.yaw, self.aim.pitch)

    def _foes(self, state: WorldState, me: Player, sides: Mapping[str, int], tick: int) -> list[Player]:
        """Those it's against, nearest first."""
        mine = sides.get(me.id)

        def against(p: Player) -> bool:
            if p.id == me.id or p.dead or p.ghost:
                return False
            if tick - self._bodies[p.id][1] < FRESH_SECONDS * TICK_RATE:
                return False
            if mine is not None:
                return sides.get(p.id, mine) != mine
            return any(t in p.name.lower() for t in self.targets) if self.targets else not p.bot

        return sorted(filter(against, state.players.values()), key=lambda p: _apart(me.pos, p.pos))

    def _watch(self, state: WorldState, me: Player, foes: list[Player], tick: int) -> Player | None:
        """Who it's fighting this tick: the nearest of those it's against in its sight, once it has
        had its reaction to them."""
        if tick >= self._next_sight:
            self._next_sight = tick + SIGHT_EVERY
            eye = self.bodies.eye_of(me)
            near = foes[:SIGHT_CHECKS]
            self._sighted = {p.id: self.solids.clear(eye, self._chest(p)) for p in near}
            for p in near:
                if self._sighted[p.id]:
                    self._last_seen[p.id] = tick
        in_sight = [p for p in foes[:SIGHT_CHECKS] if self._sighted.get(p.id)]
        # Someone it lost sight of a moment ago it's still on, and anyone else takes its reaction.
        if self.target is not None and tick - self._last_seen.get(self.target, tick) > LOST_SECONDS * TICK_RATE:
            self.target = None
        if not in_sight:
            self._noticed = None
            return None
        nearest = in_sight[0]
        current = next((p for p in in_sight if p.id == self.target), None)
        hurt = next((p for p in in_sight if p.id == self._hurt_by), None)
        if current is not None and _apart(me.pos, nearest.pos) >= STICK * _apart(me.pos, current.pos):
            return current
        chosen = hurt or nearest
        self._hurt_by = None
        if self._noticed is None or self._noticed[0] != chosen.id:
            known = self.target == chosen.id
            delay = 0 if known else round(self.skill.reaction * self.dice.uniform(0.6, 1.4) * TICK_RATE)
            self._noticed = (chosen.id, tick + delay)
            self._head = not ARMS[self.arm].scoped and self.dice.random() < HEADS * self.skill.wits
        if tick < self._noticed[1]:
            return current
        self.target = chosen.id
        return chosen

    def _hold(self, me: Player, target: Player | None, tick: int) -> list[str]:
        """The weapon it means to hold as things stand, and the command for it while it isn't
        holding it."""
        best = self.temper.arms[0]
        spare = self.temper.arms[1] if len(self.temper.arms) > 1 else None
        wanted = self.arm
        held = me.item.id if me.item is not None else None
        if spare is not None and self.arm == best:
            dry = held == best and me.item is not None and me.item.fuel is not None and me.item.fuel < DRY
            crowded = ARMS[best].scoped and target is not None and _apart(me.pos, target.pos) < CROWDED
            if dry or (crowded and self._nous < self.skill.wits):
                wanted = spare
                self._put_away = tick
        elif spare is not None and self.arm == spare:
            rested = tick - self._put_away > REFILLED_SECONDS * TICK_RATE
            clear = target is None or _apart(me.pos, target.pos) > 2 * CROWDED
            if rested and (clear or not ARMS[best].scoped):
                wanted = best
        if wanted != self.arm:
            self.arm = wanted
            worst, quickest = SWAP_SECONDS
            self._fumbling = tick + round((worst + (quickest - worst) * self.skill.wits) * TICK_RATE)
            self._asked = -ASK_EVERY
        if held != self.arm and tick - self._asked >= ASK_EVERY:
            self._asked = tick
            return [self.arm]
        return []

    def _think(
        self, state: WorldState, me: Player, foes: list[Player], allies: list[Player], target: Player | None, tick: int
    ) -> None:
        """Where it's going, with nobody to fight where it stands: a heart when it's hurt, whoever
        it's against, or its own side."""
        feet = _feet(me)
        heart = self._heart(state, me, target is not None)
        if heart is not None:
            self._go(me, heart, tick)
            return
        if target is not None and self._in_reach(me, target):
            self._goal = self._route = None  # a fight where it stands: its steps are the fight's
            return
        quarry = target or (foes[0] if foes else None)
        near_fight = quarry is not None and _apart(me.pos, quarry.pos) <= FAR_FIGHT
        if allies and not near_fight:
            buddy = min(allies, key=lambda p: _apart(me.pos, p.pos))
            if _apart(me.pos, buddy.pos) > KEEP_WITH:
                self._go(me, _feet(buddy), tick)
                return
        if quarry is None:
            self._goal = self._route = None
            return
        # The shy stop where they can see whoever it is from as far as their weapon likes; the
        # bold go right up.
        arm = ARMS[self.arm]
        hold = self._far(arm) if self.temper.nerve < 0.5 else self._near(arm)
        if self._sighted.get(quarry.id) and _across(feet, _feet(quarry)) <= hold:
            self._goal = self._route = None
            return
        self._go(me, _feet(quarry), tick)

    def _heart(self, state: WorldState, me: Player, fighting: bool) -> Vec3 | None:
        """The heart to break off for, if it's hurt enough to: by its nerve, the shy sooner, and
        only with the wits to think of it. One right beside it is worth taking whoever it is."""
        if me.hearts >= HEARTS_FULL:
            return None
        hearts = [p for p in state.pickups.values() if p.kind in ("heart", "big-heart")]
        if not hearts:
            return None
        nearest = min(hearts, key=lambda p: math.dist((p.x, p.y, p.z), (me.pos.x, me.pos.y, me.pos.z)))
        away = math.dist((nearest.x, nearest.y, nearest.z), (me.pos.x, me.pos.y, me.pos.z))
        boldest, shyest = HURT
        under = (boldest + (shyest - boldest) * (1 - self.temper.nerve)) * self.skill.wits
        wanted = me.hearts <= under and away <= HEART_REACH
        handy = away <= NEARBY_HEART and not fighting and self.skill.wits > 0.2
        if not (wanted or handy):
            return None
        return Vec3(nearest.x, self.solids.ground_at(nearest.x, nearest.z, nearest.y), nearest.z)

    def _go(self, me: Player, goal: Vec3, tick: int) -> None:
        """Make for ``goal`` (feet): along the way it has while that still leads there, and
        otherwise along one it finds, off the event loop."""
        self._goal = goal
        if self._finding is not None and self._finding.done():
            path, self._finding = (None if self._finding.cancelled() else self._finding.result()), None
            self._route = Route(self.ground, path, tick, me.avatar, self._doors) if path else None
            if path is None:
                # No way there over the ground: it leaves the place alone a while.
                self._goal = None
                self._next_find = tick + round(NO_WAY_SECONDS * TICK_RATE)
                return
        waiting = tick < self._next_find and self._route is None and self._finding is None
        if waiting and self._found_for is not None and _apart(self._found_for, goal) <= REPLAN:
            self._goal = None  # still the place it found no way to
            return
        moved = self._found_for is None or _apart(self._found_for, goal) > REPLAN
        stuck = self._route is not None and self._route.stuck(tick)
        if self._finding is not None or tick < self._next_find or not (moved or stuck or self._route is None):
            return
        start, end = self.ground.node_at(_feet(me)), self.ground.node_at(goal)
        self._next_find = tick + REPLAN_EVERY
        self._found_for = goal
        if start is None or end is None:
            self._route = None  # off the walked floor: it goes straight, minding its footing
            return
        self._finding = asyncio.get_running_loop().create_task(
            asyncio.to_thread(self.ground.path, start, end, me.avatar, True)
        )

    def _mark(self, me: Player, target: Player | None) -> Vec3 | None:
        """The spot on its target that it's aiming for, where it believes them to be."""
        if target is None:
            return None
        # Down a scope it follows someone moving steadily nearly all the way: it's whoever changes
        # their mind that it loses.
        lead = SCOPED_LEAD + (1 - SCOPED_LEAD) * self.skill.wits if me.scoped else self.skill.lead
        eyes = believed(self._seen, target.id, self.skill.lag, lead) or target.pos
        return mark_on(eyes, self.bodies.hitbox(target.avatar), HEAD if self._head else CHEST)

    def _ahead(self, me: Player, foes: list[Player]) -> Vec3:
        """Where it looks with nobody to aim at: along its way, at whoever it's making for, or
        where it's facing."""
        if self._route is not None and not self._route.done:
            return self._route.ahead(me.pos)
        if self._goal is not None and _across(_feet(me), self._goal) > ARRIVED:
            return Vec3(self._goal.x, self._goal.y + EYE_HEIGHT, self._goal.z)
        if foes:
            return foes[0].pos
        return Vec3(me.pos.x + math.sin(self.aim.yaw), me.pos.y, me.pos.z + math.cos(self.aim.yaw))

    def _move(self, state: WorldState, me: Player, target: Player | None, tick: int, controls: Controls) -> None:
        """Its step this tick: along its way where it has somewhere to go, and the fight's own
        where it's fighting."""
        feet = _feet(me)
        controls.run(False)
        if self._goal is not None:
            if _across(feet, self._goal) <= ARRIVED and abs(feet.y - self._goal.y) <= 2:
                self._goal = self._route = None
            elif self._route is not None and not self._route.done:
                # At a run only over open floor: round what stands, a run overshoots the way.
                controls.run(_across(feet, self._goal) > RUN_FROM and self.ground.area_at(feet) is not None)
                self._route.steer(me.pos, tick, controls)
                return
            elif self._finding is None:
                # No way over the ground to follow: straight there, as far as there's footing.
                self._walk(feet, (self._goal.x - feet.x, self._goal.z - feet.z), me, controls)
                return
        if target is None:
            controls.stop()
            return
        if tick >= self._next_step:
            self._next_step = tick + MOVE_EVERY
            self._step = self._dance(me, target, tick)
        self._walk(feet, self._step, me, controls)
        jumps = JUMPS * self.temper.hops * self.skill.dodge / TICK_RATE
        if not me.scoped and self._sway != 0 and self.dice.random() < jumps:
            controls.jump()

    def _dance(self, me: Player, target: Player, tick: int) -> tuple[float, float]:
        """The step a fight asks for, across the floor: in toward its target from further than its
        weapon likes and back from nearer, and round them, the way it's circling."""
        arm = ARMS[self.arm]
        dx, dz = target.pos.x - me.pos.x, target.pos.z - me.pos.z
        apart = math.hypot(dx, dz) or 1.0
        tx, tz = dx / apart, dz / apart
        if arm.scoped and self._near(arm) <= apart <= arm.reach:
            return (0.0, 0.0)  # a rifle is fired from a stand
        if tick >= self._sway_until:
            low, high = SWAY_SECONDS
            self._sway_until = tick + round(self.dice.uniform(low, high) * TICK_RATE)
            still = self.dice.random() >= self.skill.dodge
            self._sway = 0 if still else self.temper.way * (1 if self.dice.random() < 0.65 else -1)
        radial = 1.0 if apart > min(self._far(arm), arm.reach * 0.9) else -1.0 if apart < self._near(arm) else 0.0
        return (tx * radial + tz * self._sway, tz * radial - tx * self._sway)

    def _walk(self, feet: Vec3, step: tuple[float, float], me: Player, controls: Controls) -> None:
        """Take ``step`` across the floor if there's footing that way, or what of it there is
        footing for; else stand."""
        for dx, dz in (step, (step[1], -step[0]), (-step[1], step[0])):
            if math.hypot(dx, dz) < 1e-6:
                continue
            if self._footing(feet, dx, dz):
                controls.walk_toward(me.pos, Vec3(me.pos.x + dx, me.pos.y, me.pos.z + dz))
                return
            if step is not self._step:
                break  # on its way somewhere, it doesn't sidestep a drop: it waits for a way round
            self._sway = -self._sway
        controls.stop()

    def _footing(self, feet: Vec3, dx: float, dz: float) -> bool:
        """Whether there's ground to walk on for AHEAD metres along (dx, dz): no more than a drop
        under its feet all the way."""
        length = math.hypot(dx, dz)
        steps = round(AHEAD / FOOT_SAMPLE)
        for i in range(1, steps + 1):
            d = AHEAD * i / steps
            x, z = feet.x + dx / length * d, feet.z + dz / length * d
            if feet.y - self.solids.ground_at(x, z, feet.y + STEP) > DROP:
                return False
        return True

    def _fire(
        self, me: Player, target: Player | None, mark: Vec3 | None, allies: list[Player], tick: int, controls: Controls
    ) -> None:
        """Its trigger this tick."""
        arm = ARMS[self.arm]
        holding = me.item is not None and me.item.id == self.arm
        controls.scope(arm.scoped and holding and target is not None and self._in_reach(me, target))
        controls.shoot(False)
        if target is None or mark is None or not holding or tick < self._fumbling or not self._in_reach(me, target):
            return
        eye = self.bodies.eye_of(me)
        apart = _apart(eye, mark)
        off = self.aim.off(eye, mark)
        on = (
            off <= arm.cone * CONE
            if arm.cone is not None
            else off <= math.atan2(self.bodies.hitbox(target.avatar).radius * TRIGGER, apart)
        )
        if not on or self._masked(me, apart, arm, allies):
            return
        if arm.cone is not None:
            # A burst, and then as long a wait as any of its shots gets.
            if tick >= self._burst_until + round(self.dice.uniform(0, 2 * self.skill.idle) * TICK_RATE):
                self._burst_until = tick + round(self.dice.uniform(*BURST_SECONDS) * TICK_RATE)
            controls.shoot(tick < self._burst_until)
            return
        slowest, quickest = SETTLE_SECONDS
        settle = slowest + (quickest - slowest) * self.skill.wits
        if tick < self._ready or (arm.scoped and (not me.scoped or self._steadied(target, tick) < settle * TICK_RATE)):
            return
        controls.fire_once()
        self._ready = tick + arm.every + round(self.dice.uniform(0, self.skill.idle) * TICK_RATE)

    def _steadied(self, target: Player, tick: int) -> int:
        """How many ticks ``target`` has gone on as they were: stood, or moving the one way."""
        if len(self._seen) < 3 or target.id not in self._seen[-3]:
            return 0
        now, before = target.pos, self._seen[-3][target.id]
        going = (
            (now.x - before.x) * TICK_RATE / 2,
            (now.y - before.y) * TICK_RATE / 2,
            (now.z - before.z) * TICK_RATE / 2,
        )
        if self._steady is None or self._steady[0] != target.id or math.dist(going, self._steady[2]) > JOLT:
            self._steady = (target.id, tick, going)
        return tick - self._steady[1]

    def _masked(self, me: Player, apart: float, arm: Arm, allies: list[Player]) -> bool:
        """Whether one of its own side is in the way of a shot along its look."""
        eye = self.bodies.eye_of(me)
        for ally in allies:
            away = _apart(eye, ally.pos)
            if away >= apart:
                continue
            off = self.aim.off(eye, self._chest(ally))
            if off <= (arm.cone if arm.cone is not None else math.atan2(1.0, max(away, 0.5))):
                return True
        return False

    def _in_reach(self, me: Player, target: Player) -> bool:
        return _apart(me.pos, target.pos) <= ARMS[self.arm].reach

    def _near(self, arm: Arm) -> float:
        """The nearest it likes to use a weapon from, the bolder the nearer."""
        return arm.near * (1.4 - 0.8 * self.temper.nerve)

    def _far(self, arm: Arm) -> float:
        return arm.far * (1.3 - 0.6 * self.temper.nerve)

    def _chest(self, p: Player) -> Vec3:
        return mark_on(p.pos, self.bodies.hitbox(p.avatar), CHEST)


def _feet(p: Player) -> Vec3:
    return Vec3(p.pos.x, p.pos.y - EYE_HEIGHT, p.pos.z)


def _apart(a: Vec3, b: Vec3) -> float:
    return math.dist((a.x, a.y, a.z), (b.x, b.y, b.z))


def _across(a: Vec3, b: Vec3) -> float:
    return math.hypot(a.x - b.x, a.z - b.z)
