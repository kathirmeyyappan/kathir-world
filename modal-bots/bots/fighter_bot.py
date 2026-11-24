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
   it by command until it has it, and its other while a spray's tank that ran dry fills. With the
   wits to, it holds whichever of them suits (``Arm.suits``): a gun for someone a rifle is too
   near for or a spray can't reach, a spray for someone right on top of a gun, and once its ice
   has chilled someone, the gun to finish them with. And its rifle, which every fighter carries,
   for someone in its sight too far off to close in on, the bolder it is the further (``LONG``),
   and for whoever has just hurt it from out of its weapon's reach, wherever they are.

4. Seeing. Someone is in its sight when nothing stands between its eyes and their chest and
   they're no further off than anyone sees through the fog, or with a rifle, down a scope. It
   checks the nearest few of those it's against every few ticks and goes for the nearest in
   sight, staying on whoever it's already fighting unless another is much nearer, and turning on
   whoever just hurt it. Someone newly in its sight it takes its reaction to go for. In a game
   with sides, one with the wits goes for whoever in its reach is nearest dead.

5. Aiming and firing. Its aim swings toward where it believes its target is (``Aim``), and it
   fires when that's on them and they're in its weapon's reach: a shot as often as the weapon
   allows and its skill keeps up with; a spray in bursts, while they're in its cone and there's
   fuel; a rifle from a stand, scoped, and only at someone who has gone on as they were for a
   while (stood, or walked one way), so whoever keeps changing their mind isn't shot from across
   the map. It holds its fire while one of its own side is in the way.

6. Moving in a fight. It keeps the range its weapon and its nerve like, closing in from further
   and backing off from nearer, and as far as its skill has it moving at all it circles its
   target, changing its mind about which way and jumping now and then. It takes no step that
   leaves the ground it's on. With a rifle it stands for its shot, and with that taken, or its
   patience for one out, its scope is down and it's off to one side a while before its next
   stand; with one it took up only for the range, a bold fighter comes on between its stands,
   puts it away for the weapon it likes once it's near enough to close in, and gives it up for a
   while when a couple of stands running get it no shot: whoever it is won't keep still.

7. Getting somewhere. With nobody in sight it makes for the nearest of those it's against, the
   bolder the nearer: along a way over the ground (``Route``), found off its event loop and found
   again as they move, or straight across open floor, where with someone it's against in its
   sight, or just hurt from out of its reach, it comes on weaving: to one side of its way and the
   other, with a jump now and then where there's room to land. Hurt enough, by its nerve and its
   wits, it breaks off for the nearest heart. In a game with sides and nobody to fight near, it
   keeps with its own. With nobody to go for at all it wanders: the shy from one lookout to
   another, the bold anywhere, staying a while at each.

8. An elusive life. Each life it's given has a stance, drawn as it begins: for a fighter that
   would use a rifle, an elusive one the likelier the shyer it is and the more lives it has just
   ended with nobody killed. Through one it has little nerve and its rifle is the weapon it
   holds. It takes a perch (``vantage``): of the lookouts and the floors indoors within its
   reach and clear of whoever it's against, the nearest that sees one of them. It stands right
   on it for each shot, since a doorway shows what it shows from one spot, steps off to one side
   between shots and back on, and moves to another once this one has got it hurt or shown it
   nobody for a while. With no perch that sees anyone, it's as shy a fighter as any: toward
   them until they're in its sight, and no nearer. A fight right on top of it, it fights.

9. Running someone down. Through a life it hunts, with one of the nearest few it's against on
   foot across floor a kart drives straight over (``common.charge``), it sometimes takes a kart
   to them, the bolder and sharper the oftener, and whoever has it stung always: into one
   where it stands, flat out at them, on the brake once it has been at them, and out, to fight
   on from there on foot. It blows the kart up later, as after a trip.

   A long way. Whoever it's going for a long way off along the roads, it takes a kart
   (``common.trip``): it walks to the end of a road, gets into an empty one standing there,
   anyone's, or asks for one, drives it as a racer of its rating drives a track, and gets out at
   the far end, or sooner once they're near. Done with it and with nobody to fight, it stands
   clear and shoots it until it blows up, so the room's karts aren't used up; with whoever it's
   after a drive away again, it keeps it for that.

10. A hop. Somewhere it has no way to over the ground, or only one much longer than the hop,
   one with the wits flies to by jetpack (``common.flight``): straight up, across and down,
   where nothing is in the way, and not again for a while. Falling far, it straps one on to
   brake with.

11. Dying. Where its game brings the dead back, it asks to be after a few seconds and takes up its
   weapon again; anywhere else it lies there until the room drops its seat, which ends its run.
"""

from __future__ import annotations

import asyncio
import itertools
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
    Kart,
    Karts,
    Player,
    Roads,
    RoomConnectionError,
    Route,
    Snapshot,
    Solids,
    Vec3,
    WorldState,
    charge,
    connect,
    driving,
    flight,
    load_bodies,
    load_ground,
    load_karts,
    load_roads,
    load_solids,
    log_death,
    log_kill,
    log_message,
    trip,
)
from common.controls import TICK_RATE
from common.deployment import validate_duration
from common.fighting import (
    ARMS,
    SCOPED_SIGHT,
    SIGHT,
    Aim,
    Arm,
    Skill,
    Temper,
    believed,
    mark_on,
    skill,
    temper,
    vantage,
)
from common.map.bodies import EYE_HEIGHT
from common.trip import Trip

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
HEADS = 0.12  # the share of its marks that are a head, for the most skilled there is
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
REFILLED_SECONDS = 9.0  # how long it leaves a spray that ran dry put away
KEEP_SECONDS = 2.0  # how long it keeps to a weapon it has just drawn, whatever would suit better
TO_DRAW = 1.4  # the room to spare a weapon has to suit with for it to be drawn in another's place
# How much further than its weapon reaches the one with no wits takes it to: it fires from there,
# and a spray's tank is half gone by the time it's any use.
MISJUDGED = 0.4
# A rifle that isn't the weapon it likes best is for someone too far off to close in on: how far
# that is for the shyest and for the boldest, and the share of it from which, coming in with the
# rifle out, it puts it away.
LONG = (25.0, 60.0)
LONG_KEPT = 0.7
# Seconds it's stung for by a hit from out of its weapon's reach: it looks for whoever it was,
# answers them from as near as the shyest would, and comes on as under fire.
STUNG_SECONDS = 6.0
# With a rifle: the longest it stands down its scope for a shot that doesn't come, and how long it
# moves about before its next stand.
STAND_SECONDS = (2.0, 3.5)
SHIFT_SECONDS = (0.7, 1.5)
# And for one on its way in with it: the stands in a row that get it no shot after which it gives
# the rifle up, and for how long it closes in with what it likes best.
BLANKS = 2
CHARGE_SECONDS = 12.0
WEAVE = 0.6  # radians off its way, to one side and the other, that it weaves coming in under fire
# How likely a life is an elusive one, for the shyest and the boldest of those who would use a
# rifle, how much likelier each life in a row that ended with nobody killed makes the next, and
# the most nerve it has through one.
LURKS = (0.7, 0.15)
GRUDGE = (0.15, 2)  # for each such life, up to so many of them
LURK_NERVE = 0.2
# An elusive life's perch: how far off it looks for one, how near whoever it's against it won't
# take one, how many spots it weighs against how many of them, how far off it a step aside is
# walked straight back from, and how long it gives one that shows it nobody before it tries
# another.
PERCH_REACH = 90.0
PERCH_CLEAR = 30.0
PERCH_PICKS = 48
PERCH_FOES = 3
PERCH_HOLD = 10.0
PERCH_PATIENCE = (8.0, 14.0)
PERCH_EVERY = 4.0  # seconds between its looks for a perch, with none
JUMP_CARRIES = 2.0  # seconds of its walk that a jump can carry it: the ground it wants ahead of one
CHILL_LEFT = 1.0  # seconds of chill left on someone, under which they're as good as thawed
FINISH = 3.0  # hearts fewer than the nearest that someone in reach has, to be gone for first
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
ON_SPOT = 0.4  # and from a spot it has to stand right on: a perch sees what it sees from there
OFF_FLOOR = 12.0  # metres off the walked floor that somewhere can be and still be gone to by a way over it
HEART_REACH = 70.0  # metres it will go for a heart
NEARBY_HEART = 8.0  # metres: a heart this close is worth a detour for anyone not at full health
# The share of a full life under which the one with the most wits breaks off for a heart: the
# boldest, and the shyest. With fewer wits, less of one, down to never thinking of it.
HURT = (0.2, 0.5)
NO_WAY_SECONDS = 4.0  # how long it leaves alone somewhere it found no way to
KEEP_WITH = 18.0  # metres from the nearest of its side past which it goes back to them
FAR_FIGHT = 45.0  # metres within which someone it's against is a fight to go to before its own side
RUN_FROM = 12.0  # metres of way left from which it runs
RESPAWN_SECONDS = (2.0, 5.0)  # how long it lies dead before asking to be brought back
ROAM = (25.0, 90.0)  # metres across the floor, the least and the most, to somewhere it wanders to
ROAM_PICKS = 12  # how many spots it thinks of before it settles on one
LINGER_SECONDS = (2.0, 7.0)  # how long it stays where it wandered to
# Seconds after letting go of a ladder that it walks with its look turned aside, so the walk that
# took hold of it (straight in, facing it) doesn't take hold again.
ASIDE_SECONDS = 1.2
HOP_EVERY = 25.0  # seconds, at the least, from one hop by jetpack to its next
HOP_SAVES = 2.5  # times the hop that its way over the ground has to be, for it to fly
FALLING = 16.0  # m/s down from which it's falling, and straps a jetpack on to brake with
TRIP_EVERY = 20.0  # seconds, at the least, between its plannings of a trip by kart
TRIP_MOVED = 100.0  # metres whoever it's going for has to be from where its trip ends for another to be planned
CLOSE_ENOUGH = 60.0  # metres from whoever it's driving to that it gets out
# Running someone down by kart: how often it looks for someone it could, the seconds at the least
# from its making up its mind about one to its next look, how likely the boldest with the most
# wits is to do it, and the share of that for one with no wits.
CHARGE_LOOK = 2.0
CHARGE_EVERY = 15.0
DRIVES = 0.9
WITLESS = 0.5
CHARGE_FOES = 3  # the nearest this many it's against are looked at for one to run down
# Done with a kart: the nearest it stands to it to shoot it (past its blast, BLAST in
# sim/vehicles/garage.ts) and the furthest (in its gun's reach), how high up it and how far across
# its mark is, how far it will come back to it from, and how long it gives the job.
SCRAP_FROM = (9.0, 14.0)
KART_MARK = (0.5, 0.6)
SCRAP_REACH = 70.0
SCRAP_SECONDS = 40.0
HISTORY = 16  # ticks of where everyone was that it keeps
FOREVER = 10**9  # ticks: longer than any run


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
    ground, solids, bodies, roads, karts = await asyncio.gather(
        asyncio.to_thread(load_ground),
        asyncio.to_thread(load_solids),
        asyncio.to_thread(load_bodies),
        asyncio.to_thread(load_roads),
        asyncio.to_thread(load_karts),
    )
    fighter = Fighter(ground, solids, bodies, roads, karts, f"{connection.room}/{name}", targets)
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
                lives = fighter.lives
                for command in fighter.decide(state, controls):
                    await controls.command(command)
                if fighter.lives != lives:
                    log_message(name, "a new life", elusive=fighter.elusive)
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

    def __init__(
        self,
        ground: Ground,
        solids: Solids,
        bodies: Bodies,
        roads: Roads,
        karts: Karts,
        seed: str,
        targets: tuple[str, ...] = (),
    ):
        self.ground = ground
        self.solids = solids
        self.bodies = bodies
        self.roads = roads
        self.karts = karts
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
        self._dried: dict[str, int] = {}  # the tick each of its sprays last ran dry
        self._kept_until = 0  # the tick until which it keeps to the weapon it has drawn
        self._weighed = -FOREVER  # the tick it last had someone to weigh its weapons for
        self._linger = 0  # the tick until which it stays where it wandered to
        self._seen: deque[dict[str, Vec3]] = deque(maxlen=HISTORY)
        self._bodies: dict[str, tuple[int, int]] = {}  # each player's body, and the tick it was first seen in it
        self._sighted: dict[str, bool] = {}  # whether each of those it checked last was in sight
        self._next_sight = 0
        self.target: str | None = None  # who it's fighting: in its sight, and it has reacted
        self._noticed: tuple[str, int] | None = None  # who has come into its sight, and the tick it goes for them
        self._last_seen: dict[str, int] = {}  # the tick each was last in its sight
        self._hurt_by: str | None = None
        self._hurt_at = -FOREVER  # the tick someone last hurt it
        self._stung: tuple[str, int] | None = None  # who last hurt it from out of its weapon's reach, and when
        self._ready = 0  # the tick it may next fire
        self._steady: tuple[str, int, tuple[float, float, float]] | None = (
            None  # who it's watching move, since when they've gone on as they were, and how they were moving
        )
        self._burst_until = 0  # the tick a spray's burst runs to
        self._next_burst = 0  # and the tick its next begins
        self._shift_until = 0  # with a rifle, the tick until which it's moving about between stands
        self._stand_until = 0  # and the tick its patience with the stand it takes then runs out
        self._blanks = 0  # its stands in a row that got it no shot
        self._charging = 0  # the tick until which it has given up a rifle that was getting it nowhere
        self._head = False  # whether its mark on this target is their head
        self._sway = 0  # which way it's circling: 1, -1, or 0 stood
        self._sway_until = 0
        self._step: tuple[float, float] = (0.0, 0.0)  # the step it's taking in a fight, across the floor
        self._next_step = 0
        self._next_think = 0
        self._goal: Vec3 | None = None  # where it's going (feet), with nobody to fight where it is
        self._within = ARRIVED  # and how near it counts as there
        self._route: Route | None = None
        self._finding: asyncio.Task[list[int] | None] | None = None
        self._found_for: Vec3 | None = None  # where the way it has, or is finding, leads
        self._next_find = 0
        self._doors: Mapping[str, bool] = {}  # the room's, open or shut (WorldState.doors)
        self._aside_until = 0  # the tick until which it looks aside of its way, clear of a ladder
        self._hop: flight.Hop | None = None  # the hop by jetpack it's on
        self._next_hop = 0  # the tick from which it may take another
        self._charge: charge.Charge | None = None  # the charge by kart it's making
        self._next_charge = 0  # the tick from which it may look for someone to run down
        self._trip: Trip | None = None  # the trip by kart it's on, or on its way to board
        self._planning: asyncio.Task[trip.Plan | None] | None = None
        self._next_trip = 0  # the tick from which it may plan another
        self._scrap: tuple[str, int] | None = None  # the kart it's done with, and the tick it gives up on it
        self._body: int | None = None  # the body it's in: a new one is a new life
        self.lives = 0  # how many lives it has begun
        self.elusive = False  # whether this one is an elusive one
        self._barren = 0  # the lives in a row it has ended with nobody killed
        self._kills = 0  # how many it has killed this life
        self._perch: Vec3 | None = None  # where an elusive life means to shoot from (feet)
        self._perched: int | None = None  # the tick it got there
        self._showed = 0  # the tick its perch last showed it someone
        self._patience = 0  # ticks it gives a perch that shows it nobody
        self._next_perch = 0  # the tick from which, with no perch, it looks for one again
        self._died: int | None = None  # the tick it was first seen dead
        self._rise: int | None = None  # the tick it asks to be brought back

    def stop(self) -> None:
        for task in (self._finding, self._planning):
            if task is not None:
                task.cancel()

    def heard(self, event: Event, me: Player, state: WorldState) -> None:
        """Something happened in the room: what hit it, what it hit, and what it killed."""
        if event.t == "hit":
            if event.data["victim"] == me.id and event.data.get("shooter") not in (None, me.id):
                self._hurt_by = str(event.data["shooter"])
                self._hurt_at = state.tick
                shooter = state.players.get(self._hurt_by)
                if shooter is not None and _apart(me.pos, shooter.pos) > ARMS[self.arm].reach:
                    self._stung = (shooter.id, state.tick)
            elif event.data.get("shooter") == me.id:
                self.hits += 1
        elif event.t == "shot" and event.data["id"] == me.id:
            self.shots += 1
        elif event.t == "kill" and event.data["shooter"] == me.id:
            self.kills += 1
            self._kills += 1

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
        if me.body != self._body:
            self._body = me.body
            self._live()
        sides = sides_of(state.game)
        # One a game brought fights in that game, and stands by through its countdown and results.
        idle = state.brought is not None and state.game.get("phase") != "playing"
        foes = [] if idle else self._foes(state, me, sides, tick)
        allies = [
            p
            for p in state.players.values()
            if p.id != me.id and not p.dead and sides.get(p.id, -1) == sides.get(me.id, -2)
        ]
        stinger = self._stinger(foes, tick)
        target = self._watch(state, me, foes, stinger, me.id in sides, tick)
        if self._hops(me, tick):
            assert self._hop is not None
            asks = self._hop.fly(self.solids, me, tick, controls)
            if self._hop.over:
                self._hop, self._goal, self._route = None, None, None
                self._next_hop = tick + round(HOP_EVERY * TICK_RATE)
            return asks
        if self._charge is not None:
            return self._run_down(state, me, tick, controls)
        # A trip has the controls from where it boards, with nobody there to fight first.
        boards = self._trip is not None and target is None and self._trip.boards(_feet(me))
        if self._trip is not None and (me.riding is not None or boards):
            return self._ride(state, me, foes, controls)
        if me.riding is not None:
            controls.get_out()  # sat in a kart with nowhere to drive it
            return []
        wreck = self._done_with(state, me, foes, target, tick)
        asks = self._hold(me, target or stinger, tick, None if wreck is None else "gun")
        if wreck is not None:
            self._wreck(me, wreck, tick, controls)
            return asks
        if tick >= self._next_think:
            self._next_think = tick + THINK_EVERY
            self._think(state, me, foes, allies, target, idle, tick)
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
        self._move(me, target, stinger is not None, tick, controls)
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
            self._barren = 0 if self._kills else self._barren + 1
            self._rise = tick + round(self.dice.uniform(*RESPAWN_SECONDS) * TICK_RATE)
            self.target = self._noticed = self._goal = self._route = self._trip = self._scrap = self._hop = None
            self._charge = None
        return []

    def _hops(self, me: Player, tick: int) -> bool:
        """Whether a hop by jetpack has the controls: one it's on, or the one it begins now to
        brake a long fall with, where it has the wits to."""
        falling = self._hop is None and self._sharp and me.riding is None and me.vy < -FALLING
        if falling:
            feet = _feet(me)
            ground = self.solids.ground_at(feet.x, feet.z, feet.y)
            self._hop = flight.Hop(Vec3(feet.x, ground, feet.z), feet.y, _leg="down")
        return self._hop is not None

    def _run_down(self, state: WorldState, me: Player, tick: int, controls: Controls) -> list[str]:
        """Its charge has the controls, from getting into its kart to getting out of it, which it's
        done with from then."""
        run = self._charge
        assert run is not None
        asks = run.ride(state, me, controls)
        if run.over:
            self._charge = None
            self._next_charge = tick + round(CHARGE_EVERY * TICK_RATE)
            if run.kart is not None:
                self._scrap = (run.kart, tick + round(SCRAP_SECONDS * TICK_RATE))
        return asks

    def _ride(self, state: WorldState, me: Player, foes: list[Player], controls: Controls) -> list[str]:
        """Its trip has the controls, from where it boards to getting out: at the road's far end,
        or sooner once whoever it's going for is near."""
        trip = self._trip
        assert trip is not None
        trip.leave = bool(foes) and _apart(me.pos, foes[0].pos) < CLOSE_ENOUGH
        asks = trip.ride(state, me, controls)
        if trip.over:
            self._trip = None
            if trip.kart is None:
                self._next_trip = state.tick + round(TRIP_EVERY * TICK_RATE)
            else:
                # Out of one it drove: another trip may begin at once, in the same kart.
                self._next_trip = state.tick
                self._scrap = (trip.kart, state.tick + round(SCRAP_SECONDS * TICK_RATE))
        return asks

    def _done_with(
        self, state: WorldState, me: Player, foes: list[Player], target: Player | None, tick: int
    ) -> Kart | None:
        """The kart it has done with and is to blow up, while it stands empty near by with nobody
        to fight. With whoever it's after a drive away again, it isn't done with it."""
        if self._scrap is None:
            return None
        kart = state.karts.get(self._scrap[0])
        if kart is None or kart.driver is not None or tick > self._scrap[1]:
            self._scrap = None
            return None
        wanted = bool(foes) and _across(_feet(me), _feet(foes[0])) >= trip.FAR
        near = _apart(me.pos, kart.pos) <= SCRAP_REACH
        return kart if target is None and near and not wanted else None

    def _wreck(self, me: Player, kart: Kart, tick: int, controls: Controls) -> None:
        """Its controls while it blows up ``kart``: clear of the blast and in its gun's reach,
        its gun on it."""
        self._goal = self._route = None
        eye, feet = self.bodies.eye_of(me), _feet(me)
        up, across = KART_MARK
        mark = Vec3(kart.pos.x, kart.pos.y + up, kart.pos.z)
        self.aim.swing(eye, mark)
        controls.look(self.aim.yaw, self.aim.pitch)
        controls.scope(False)
        controls.shoot(False)
        controls.run(False)
        away = _across(feet, kart.pos)
        nearest, furthest = SCRAP_FROM
        if not nearest <= away <= furthest:
            to = 1 if away > furthest else -1
            self._step = ((kart.pos.x - feet.x) * to, (kart.pos.z - feet.z) * to)
            self._walk(feet, self._step, me, controls)
            return
        controls.stop()
        held = me.item is not None and me.item.id == "gun"
        if held and tick >= max(self._ready, self._fumbling) and self.aim.off(eye, mark) < math.atan2(across, away):
            controls.fire_once()
            self._ready = tick + ARMS["gun"].every

    def _rate(self, state: WorldState) -> None:
        rating = state.rating(RATINGS, UNRATED)
        if rating == self.rating:
            return
        self.rating = rating
        self.skill = skill(rating + self.talent)
        self.aim = Aim(self.skill, self.dice, self.aim.yaw, self.aim.pitch)

    def _live(self) -> None:
        """A new life, and its stance for it: an elusive one the likelier the shyer it is and the
        more lives it has just ended with nobody killed, for a fighter that would use a rifle."""
        shy, bold = LURKS
        sore, most = GRUDGE
        chance = shy + (bold - shy) * self.temper.nerve + sore * min(self._barren, most)
        marksman = self._sharp or ARMS[self.temper.arms[0]].scoped
        self.elusive = marksman and self.dice.random() < chance
        self.lives += 1
        self._kills = 0
        self._perch = self._perched = None

    @property
    def nerve(self) -> float:
        """How bold it is this life: its temper's nerve, and little of that through an elusive one."""
        return min(self.temper.nerve, LURK_NERVE) if self.elusive else self.temper.nerve

    @property
    def _favourite(self) -> str:
        """The weapon it would rather hold this life: its rifle through an elusive one."""
        rifle = next((arm for arm in self.temper.arms if ARMS[arm].scoped), None)
        return rifle if self.elusive and rifle is not None else self.temper.arms[0]

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

    def _smarting(self, tick: int) -> str | None:
        """Who it's stung by: whoever hurt it from out of its weapon's reach a moment ago."""
        if self._stung is None or tick - self._stung[1] > STUNG_SECONDS * TICK_RATE:
            return None
        return self._stung[0]

    def _stinger(self, foes: list[Player], tick: int) -> Player | None:
        """Whoever it's stung by, of those it's against."""
        by = self._smarting(tick)
        return next((p for p in foes if p.id == by), None)

    def _watch(
        self, state: WorldState, me: Player, foes: list[Player], stinger: Player | None, sided: bool, tick: int
    ) -> Player | None:
        """Who it's fighting this tick: the nearest of those it's against in its sight, once it has
        had its reaction to them. In a game with sides (``sided``), whoever its side would rather
        it went for. It looks among the nearest few, and for whoever has stung it (``stinger``)."""
        checked = foes[:SIGHT_CHECKS]
        if stinger is not None and stinger not in checked:
            checked = [*checked, stinger]
        if tick >= self._next_sight:
            self._next_sight = tick + SIGHT_EVERY
            eye = self.bodies.eye_of(me)
            far = SCOPED_SIGHT if ARMS[self.arm].scoped else SIGHT
            self._sighted = {
                p.id: _apart(eye, p.pos) <= far and self.solids.clear(eye, self._chest(p)) for p in checked
            }
            for p in checked:
                if self._sighted[p.id]:
                    self._last_seen[p.id] = tick
        in_sight = [p for p in checked if self._sighted.get(p.id)]
        # Someone it lost sight of a moment ago it's still on, and anyone else takes its reaction.
        if self.target is not None and tick - self._last_seen.get(self.target, tick) > LOST_SECONDS * TICK_RATE:
            self.target = None
        if not in_sight:
            self._noticed = None
            return None
        nearest = in_sight[0]
        current = next((p for p in in_sight if p.id == self.target), None)
        hurt = next((p for p in in_sight if p.id == self._hurt_by), None)
        weak = self._weakest(me, in_sight) if sided else None
        stays = weak is None or weak is current
        if current is not None and stays and _apart(me.pos, nearest.pos) >= STICK * _apart(me.pos, current.pos):
            return current
        chosen = hurt or weak or nearest
        self._hurt_by = None
        if self._noticed is None or self._noticed[0] != chosen.id:
            known = self.target == chosen.id
            delay = 0 if known else round(self.skill.reaction * self.dice.uniform(0.6, 1.4) * TICK_RATE)
            self._noticed = (chosen.id, tick + delay)
            self._head = self.dice.random() < HEADS * self.skill.wits
        if tick < self._noticed[1]:
            return current
        self.target = chosen.id
        return chosen

    def _hold(self, me: Player, quarry: Player | None, tick: int, only: str | None = None) -> list[str]:
        """The weapon it means to hold as things stand, for ``quarry`` (whoever it's fighting, or
        with nobody in its sight whoever has stung it) or ``only``, where one alone will do, and
        the command for it while it isn't holding it."""
        held = me.item.id if me.item is not None else None
        if me.item is not None and held == self.arm and me.item.fuel is not None and me.item.fuel < DRY:
            self._dried[self.arm] = tick
        # The ones with a tank to fire: one that ran dry is left to fill.
        filled = [
            arm for arm in self.temper.arms if tick - self._dried.get(arm, -FOREVER) > REFILLED_SECONDS * TICK_RATE
        ]
        arms = filled or list(self.temper.arms)
        wanted = self._favourite if self._favourite in arms else arms[0]
        if quarry is not None and self._sharp:
            apart, chilled = _apart(me.pos, quarry.pos), quarry.chilled > CHILL_LEFT
            wanted = next((arm for arm in arms if self._suits(arm, apart, chilled, tick)), wanted)
            self._weighed = tick
        elif self.arm in arms and tick - self._weighed <= LOST_SECONDS * TICK_RATE:
            wanted = self.arm  # whoever it drew this for is only just out of its sight
        wanted = only or wanted
        if wanted != self.arm and (tick >= self._kept_until or self.arm not in arms or only is not None):
            self.arm = wanted
            worst, quickest = SWAP_SECONDS
            self._fumbling = tick + round((worst + (quickest - worst) * self.skill.wits) * TICK_RATE)
            self._kept_until = tick + round(KEEP_SECONDS * TICK_RATE)
            self._asked = -ASK_EVERY
        if held != self.arm and tick - self._asked >= ASK_EVERY:
            self._asked = tick
            return [self.arm]
        return []

    def _suits(self, arm: str, apart: float, chilled: bool, tick: int) -> bool:
        """Whether ``arm`` is the weapon for someone ``apart`` metres off, as it weighs them: the
        one in its hand as far as that goes, and another only where it suits with room to spare.
        A rifle that isn't the weapon it likes best is for someone too far off to close in on,
        the bolder it is the further, and while it's stung for anyone the shyest would shoot;
        for nobody while it has given it up to close in."""
        held = arm == self.arm
        if ARMS[arm].scoped and arm != self._favourite:
            shy, bold = LONG
            long = shy if self._smarting(tick) else shy + (bold - shy) * self.nerve
            if tick < self._charging or apart < long * (LONG_KEPT if held else 1):
                return False
        return ARMS[arm].suits(apart, chilled, 1 if held else TO_DRAW)

    @property
    def _coming(self) -> bool:
        """Whether it's on its way in with a rifle it took up only for the range: the bold are."""
        return ARMS[self.arm].scoped and self.arm != self._favourite and self.nerve >= 0.5

    @property
    def _sharp(self) -> bool:
        """Whether it has the wits to weigh things: which weapon suits, who's nearest dead."""
        return self._nous < self.skill.wits

    def _weakest(self, me: Player, in_sight: list[Player]) -> Player | None:
        """Who its side would rather it went for than the nearest in its sight: someone in its
        weapon's reach a good deal nearer dead, for a fighter with the wits to pick them out."""
        reached = [p for p in in_sight if self._in_reach(me, p)]
        if not self._sharp or not reached:
            return None
        weak = min(reached, key=lambda p: p.hearts)
        return weak if weak.hearts <= in_sight[0].hearts - FINISH else None

    def _think(
        self,
        state: WorldState,
        me: Player,
        foes: list[Player],
        allies: list[Player],
        target: Player | None,
        idle: bool,
        tick: int,
    ) -> None:
        """Where it's going, with nobody to fight where it stands: a heart when it's hurt, whoever
        it's against, its own side, or with nobody to go for, wherever it wanders. Nowhere while
        it stands by (``idle``)."""
        feet = _feet(me)
        heart = self._heart(state, me, target is not None)
        if heart is not None:
            self._go(me, heart, tick)
            return
        # An elusive life keeps to its perch, but for a fight right on top of it.
        brawl = target is not None and _apart(me.pos, target.pos) <= ARMS["gun"].reach
        if self.elusive and foes and not brawl and self._lurk(me, foes, target is not None, tick):
            return
        quarry = target or (foes[0] if foes else None)
        if foes and not self.elusive and self._charges(me, foes, allies, tick):
            return
        if target is not None and self._in_reach(me, target):
            self._goal = self._route = None  # a fight where it stands: its steps are the fight's
            return
        near_fight = quarry is not None and _apart(me.pos, quarry.pos) <= FAR_FIGHT
        if allies and not near_fight:
            buddy = min(allies, key=lambda p: _apart(me.pos, p.pos))
            if _apart(me.pos, buddy.pos) > KEEP_WITH:
                self._go(me, _feet(buddy), tick)
                return
        if quarry is None:
            if idle:
                self._goal = self._route = None
            else:
                self._wander(me, tick)
            return
        # The shy stop where they can see whoever it is from as far as their weapon likes; the
        # bold go right up.
        arm = ARMS[self.arm]
        hold = self._far(arm) if self.nerve < 0.5 else self._near(arm)
        if self._sighted.get(quarry.id) and _across(feet, _feet(quarry)) <= hold:
            self._goal = self._route = None
            return
        if target is None and self._drives(me, quarry, tick):
            return
        self._go(me, _feet(quarry), tick)

    def _lurk(self, me: Player, foes: list[Player], sighted: bool, tick: int) -> bool:
        """An elusive life's place, where it has one: a perch that sees whoever it's against, kept
        until it gets it hurt or has shown it nobody (``sighted``) for too long, stood right on
        for each shot and stepped off between them. False with none in its reach, when it's as
        shy a fighter as any: toward them until they're in its sight."""
        feet = _feet(me)
        if sighted:
            self._showed = tick
        perch = self._perch
        level = perch is not None and abs(feet.y - perch.y) <= 2
        on = perch is not None and level and _across(feet, perch) <= 2 * ON_SPOT
        if on and self._perched is None:
            self._perched = self._showed = self._shift_until = tick
            self._stand_until = tick + round(self.dice.uniform(*STAND_SECONDS) * TICK_RATE)
        spent = self._perched is not None and (
            self._hurt_at > self._perched or tick - max(self._perched, self._showed) > self._patience
        )
        if spent or (perch is None and tick >= self._next_perch):
            perch = self._perch = self._perch_for(me, foes)
            self._perched = None
            self._next_perch = tick + round(PERCH_EVERY * TICK_RATE)
            self._patience = round(self.dice.uniform(*PERCH_PATIENCE) * TICK_RATE)
        if perch is None:
            return False
        if self._perched is not None and (on or tick < self._shift_until):
            self._goal = self._route = None  # on it, or off to one side of it between its stands
        elif self._perched is not None and level and _across(feet, perch) <= PERCH_HOLD:
            self._goal, self._route, self._within = perch, None, ON_SPOT  # a step back onto it
        else:
            self._go(me, perch, tick, ON_SPOT)
            if self._goal is None:
                self._perch = None  # no way there
        return True

    def _perch_for(self, me: Player, foes: list[Player]) -> Vec3 | None:
        """Somewhere to shoot from: of a sample of the lookouts and the floors indoors within its
        reach, clear of whoever it's against and off the perch it has, the nearest that sees one
        of the nearest of them, if any does."""
        feet, near = _feet(me), foes[:PERCH_FOES]

        def fit(spot: Vec3) -> bool:
            return (
                _across(feet, spot) <= PERCH_REACH
                and all(_apart(spot, _feet(foe)) >= PERCH_CLEAR for foe in near)
                and (self._perch is None or _apart(spot, self._perch) > PERCH_HOLD)
            )

        spots = (*self.ground.lookouts, *self.ground.floor_spots)
        weighed = self.dice.sample(spots, min(PERCH_PICKS * 5, len(spots)))
        sample = [i for i in weighed if fit(self.ground.nodes[i])][:PERCH_PICKS]
        seeing = vantage(self.ground, self.solids, sample, me.pos, [self._chest(foe) for foe in near])
        return None if seeing is None else self.ground.nodes[seeing]

    def _charges(self, me: Player, foes: list[Player], allies: list[Player], tick: int) -> bool:
        """Whether it takes a kart to one of ``foes`` now, to run them down: the nearest of the
        nearest few on foot across floor a kart drives straight over, with none of its own side
        in the way, for a fighter as keen on it as its nerve and its wits make it (and whoever
        has it stung, for the cover a kart is), not long after it last weighed one."""
        if tick < self._next_charge:
            return False
        self._next_charge = tick + round(CHARGE_LOOK * TICK_RATE)
        feet = _feet(me)

        def open_to(foe: Player) -> bool:
            there = _feet(foe)
            clear = not any(charge.in_way(feet, there, _feet(ally)) for ally in allies)
            return foe.riding is None and clear and charge.open_to(self.solids, feet, there)

        mark = next((foe for foe in foes[:CHARGE_FOES] if open_to(foe)), None)
        if mark is None:
            return False
        self._next_charge = tick + round(CHARGE_EVERY * TICK_RATE)
        keen = DRIVES * self.nerve * (WITLESS + (1 - WITLESS) * self.skill.wits)
        if mark.id != self._smarting(tick) and self.dice.random() >= keen:
            return False
        there = _feet(mark)
        heading = math.atan2(there.x - feet.x, there.z - feet.z)
        self._charge = charge.Charge(feet, mark.id, heading, self.solids, self.skill.lead)
        self._goal = self._route = None
        return True

    def _drives(self, me: Player, quarry: Player, tick: int) -> bool:
        """Whether it's on its way to board a kart to go for ``quarry`` in: a long way off, along
        the roads. The trip is planned off the event loop, and it carries on on foot meanwhile."""
        feet, there = _feet(me), _feet(quarry)
        if self._trip is not None:
            if _across(there, self._trip.plan.end) <= TRIP_MOVED:
                self._go(me, self._trip.plan.board, tick)
                return True
            self._trip = None  # they've gone somewhere else since
        if self._planning is not None:
            if self._planning.done():
                planned, self._planning = self._planning.result(), None
                if planned is not None:
                    self._trip = Trip(planned, self._driving, self.karts, self.solids, self.dice)
            return False
        if tick >= self._next_trip and _across(feet, there) >= trip.FAR:
            self._next_trip = tick + round(TRIP_EVERY * TICK_RATE)
            self._planning = asyncio.get_running_loop().create_task(
                asyncio.to_thread(trip.plan, self.roads, self.ground, self.karts, feet, there, self._driving)
            )
        return False

    @property
    def _driving(self) -> driving.Skill:
        """How well it drives: as a racer of its rating does."""
        return driving.skill(self.rating + self.talent)

    def _heart(self, state: WorldState, me: Player, fighting: bool) -> Vec3 | None:
        """The heart to break off for, if it's hurt enough to: by its nerve, the shy sooner, and
        only with the wits to think of it. One right beside it is worth taking whoever it is."""
        full = self.bodies.life_of(me.avatar)
        if me.hearts >= full:
            return None
        hearts = [p for p in state.pickups.values() if p.kind in ("heart", "big-heart")]
        if not hearts:
            return None
        nearest = min(hearts, key=lambda p: math.dist((p.x, p.y, p.z), (me.pos.x, me.pos.y, me.pos.z)))
        away = math.dist((nearest.x, nearest.y, nearest.z), (me.pos.x, me.pos.y, me.pos.z))
        boldest, shyest = HURT
        under = full * (boldest + (shyest - boldest) * (1 - self.nerve)) * self.skill.wits
        wanted = me.hearts <= under and away <= HEART_REACH
        handy = away <= NEARBY_HEART and not fighting and self.skill.wits > 0.2
        if not (wanted or handy):
            return None
        return Vec3(nearest.x, self.solids.ground_at(nearest.x, nearest.z, nearest.y), nearest.z)

    def _wander(self, me: Player, tick: int) -> None:
        """Somewhere to be with nobody to go for: once it has stayed a while where it is, a spot
        some way off, a lookout for the shy and anywhere for the bold."""
        if self._goal is not None:
            self._linger = tick + round(self.dice.uniform(*LINGER_SECONDS) * TICK_RATE)
            self._go(me, self._goal, tick)
            return
        if tick < self._linger:
            return
        feet = _feet(me)
        nearest, furthest = ROAM
        spots = self.ground.lookouts if self.nerve < 0.5 else range(len(self.ground.nodes))
        picks = [self.ground.nodes[self.dice.choice(spots)] for _ in range(ROAM_PICKS)]
        within = [spot for spot in picks if nearest <= _across(feet, spot) <= furthest]
        if within:
            self._go(me, self.dice.choice(within), tick)

    def _go(self, me: Player, goal: Vec3, tick: int, within: float = ARRIVED) -> None:
        """Make for ``goal`` (feet), to ``within`` that of it: along the way it has while that
        still leads there, and otherwise along one it finds, off the event loop."""
        self._goal, self._within = goal, within
        if self._finding is not None and self._finding.done():
            path, self._finding = (None if self._finding.cancelled() else self._finding.result()), None
            self._route = Route(self.ground, path, tick, me.avatar, self._doors) if path else None
            if self._flies(me, goal, path, tick):
                return
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
        # Somewhere just off the walked floor (out on a road) it goes for by the nearest of it.
        start, end = self.ground.node_at(_feet(me)), self.ground.node_at(goal, OFF_FLOOR)
        self._next_find = tick + REPLAN_EVERY
        self._found_for = goal
        if start is None or end is None:
            # Off the walked floor: a hop there, or straight, minding its footing.
            self._route = None
            self._flies(me, goal, None, tick)
            return
        self._finding = asyncio.get_running_loop().create_task(
            asyncio.to_thread(self.ground.path, start, end, me.avatar, True)
        )

    def _flies(self, me: Player, goal: Vec3, path: list[int] | None, tick: int) -> bool:
        """Whether it takes a hop by jetpack to ``goal`` in place of ``path``, the way it found
        there over the ground (None for no way): where the hop is much the shorter, for one with
        the wits to think of it, and not long after its last."""
        if not self._sharp or tick < self._next_hop:
            return False
        feet = _feet(me)
        if path is not None:
            spots = [feet, *(self.ground.nodes[i] for i in path)]
            way = sum(_apart(a, b) for a, b in itertools.pairwise(spots))
            if way < HOP_SAVES * (abs(goal.y - feet.y) + _across(feet, goal)):
                return False
        self._hop = flight.plan(self.solids, feet, goal)
        return self._hop is not None

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
        if self._goal is not None and _across(_feet(me), self._goal) > self._within:
            return Vec3(self._goal.x, self._goal.y + EYE_HEIGHT, self._goal.z)
        if foes:
            return foes[0].pos
        return Vec3(me.pos.x + math.sin(self.aim.yaw), me.pos.y, me.pos.z + math.cos(self.aim.yaw))

    def _move(self, me: Player, target: Player | None, stung: bool, tick: int, controls: Controls) -> None:
        """Its step this tick: along its way where it has somewhere to go, weaving where someone
        it's against has it in their sight or has just hurt it (``stung``), and the fight's own
        where it's fighting."""
        feet = _feet(me)
        controls.run(False)
        if self._goal is not None:
            if _across(feet, self._goal) <= self._within and abs(feet.y - self._goal.y) <= 2:
                self._goal = self._route = None
            elif self._route is not None and not self._route.done:
                # At a run only over open floor: round what stands, a run overshoots the way.
                open_floor = self.ground.area_at(feet) is not None
                controls.run(_across(feet, self._goal) > RUN_FROM and open_floor)
                self._route.steer(me.pos, tick, controls)
                if open_floor and self._route.plain and (target is not None or stung):
                    self._weave(feet, self._route.ahead(me.pos), me, tick, controls)
                return
            elif self._finding is None:
                # No way over the ground to follow: straight there, as far as there's footing.
                controls.run(_across(feet, self._goal) > RUN_FROM)
                self._walk(feet, (self._goal.x - feet.x, self._goal.z - feet.z), me, controls)
                return
        if target is None:
            controls.stop()
            return
        if tick >= self._next_step:
            self._next_step = tick + MOVE_EVERY
            self._step = self._dance(me, target, tick)
        self._walk(feet, self._step, me, controls)
        if self._sway != 0:
            self._spring(feet, self._step, me, controls)

    def _dance(self, me: Player, target: Player, tick: int) -> tuple[float, float]:
        """The step a fight asks for, across the floor: in toward its target from further than its
        weapon likes and back from nearer, and round them, the way it's circling. With a rifle,
        none while it stands to shoot, and between stands off to one side."""
        arm = ARMS[self.arm]
        dx, dz = target.pos.x - me.pos.x, target.pos.z - me.pos.z
        apart = math.hypot(dx, dz) or 1.0
        tx, tz = dx / apart, dz / apart
        near = self._near(arm)
        if arm.scoped and apart >= near:
            if tick >= max(self._shift_until, self._stand_until):
                # Out of patience with a stand that got it no shot: whoever it is won't keep still,
                # and one on its way in closes in on them without the rifle.
                self._blanks += 1 if self._stand_until else 0
                if self._coming and self._blanks >= BLANKS:
                    self._blanks = 0
                    self._charging = tick + round(CHARGE_SECONDS * TICK_RATE)
                self._shift(tick)
            if tick >= self._shift_until:
                return (0.0, 0.0)  # a rifle is fired from a stand
        else:
            self._sways(tick)
        far = math.inf if self.elusive else min(self._far(arm), arm.reach * 0.9)  # a perch isn't left to close in
        radial = 1.0 if self._coming or apart > far else -1.0 if apart < near else 0.0
        return (tx * radial + tz * self._sway, tz * radial - tx * self._sway)

    def _shift(self, tick: int) -> None:
        """With a rifle, done with a stand, its shot taken or its patience out: a spell of moving
        about before the next, for one on its way in and as far as its skill has any moving."""
        moves = self._coming or self.dice.random() < self.skill.dodge
        self._shift_until = tick + (round(self.dice.uniform(*SHIFT_SECONDS) * TICK_RATE) if moves else 0)
        self._stand_until = self._shift_until + round(self.dice.uniform(*STAND_SECONDS) * TICK_RATE)
        self._sway = self._side()

    def _sways(self, tick: int) -> None:
        """Which way it's moving about, picked again every little while: to one side or the other,
        or for as much of the time as its skill leaves it stood, neither."""
        if tick < self._sway_until:
            return
        low, high = SWAY_SECONDS
        self._sway_until = tick + round(self.dice.uniform(low, high) * TICK_RATE)
        self._sway = self._side() if self.dice.random() < self.skill.dodge else 0

    def _side(self) -> int:
        """A side to move to: the one it would rather, more often than not."""
        return self.temper.way * (1 if self.dice.random() < 0.65 else -1)

    def _weave(self, feet: Vec3, toward: Vec3, me: Player, tick: int, controls: Controls) -> None:
        """Its walk for ``toward`` across open floor, under someone's eye: turned off its way to
        one side and the other by turns, as far as its skill has it moving about at all, with a
        jump now and then."""
        self._sways(tick)
        dx, dz = toward.x - feet.x, toward.z - feet.z
        turn = WEAVE * self._sway
        step = (dx * math.cos(turn) + dz * math.sin(turn), dz * math.cos(turn) - dx * math.sin(turn))
        if self._sway == 0 or not self._footing(feet, *step):
            return
        controls.walk_toward(me.pos, Vec3(me.pos.x + step[0], me.pos.y, me.pos.z + step[1]))
        self._spring(feet, step, me, controls)

    def _spring(self, feet: Vec3, step: tuple[float, float], me: Player, controls: Controls) -> None:
        """A jump now and then as it moves about along ``step``, as its temper likes them and its
        skill has it moving, where there's ground ahead for as far as one could carry it."""
        often = JUMPS * self.temper.hops * self.skill.dodge / TICK_RATE
        if me.scoped or math.hypot(*step) < 1e-6 or self.dice.random() >= often:
            return
        if self._footing(feet, *step, self.bodies.walk_speed(me.avatar) * JUMP_CARRIES):
            controls.jump()

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

    def _footing(self, feet: Vec3, dx: float, dz: float, reach: float = AHEAD) -> bool:
        """Whether there's ground to walk on for ``reach`` metres along (dx, dz): no more than a
        drop under its feet all the way."""
        length = math.hypot(dx, dz)
        steps = round(reach / FOOT_SAMPLE)
        for i in range(1, steps + 1):
            d = reach * i / steps
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
        reached = target is not None and self._in_reach(me, target)
        # A scope is for the stand a rifle is shot from: it's down while it's going somewhere, and
        # between stands.
        controls.scope(arm.scoped and holding and reached and self._goal is None and tick >= self._shift_until)
        controls.shoot(False)
        if target is None or mark is None or not holding or tick < self._fumbling or not reached:
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
            if tick >= self._next_burst:
                self._burst_until = tick + round(self.dice.uniform(*BURST_SECONDS) * TICK_RATE)
                self._next_burst = self._burst_until + round(self.dice.uniform(0, 2 * self.skill.idle) * TICK_RATE)
            controls.shoot(tick < self._burst_until)
            return
        slowest, quickest = SETTLE_SECONDS
        settle = slowest + (quickest - slowest) * self.skill.wits
        if tick < self._ready or (arm.scoped and (not me.scoped or self._steadied(target, tick) < settle * TICK_RATE)):
            return
        controls.fire_once()
        self._ready = tick + arm.every + round(self.dice.uniform(0, self.skill.idle) * TICK_RATE)
        if arm.scoped:
            self._blanks = 0
            self._shift(tick)

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
        """Whether ``target`` is as near as it takes its weapon to reach."""
        return _apart(me.pos, target.pos) <= ARMS[self.arm].reach * (1 + MISJUDGED * (1 - self.skill.wits))

    def _near(self, arm: Arm) -> float:
        """The nearest it likes to use a weapon from, the bolder the nearer."""
        return arm.near * (1.4 - 0.8 * self.nerve)

    def _far(self, arm: Arm) -> float:
        return arm.far * (1.3 - 0.6 * self.nerve)

    def _chest(self, p: Player) -> Vec3:
        return mark_on(p.pos, self.bodies.hitbox(p.avatar), CHEST)


def _feet(p: Player) -> Vec3:
    return Vec3(p.pos.x, p.pos.y - EYE_HEIGHT, p.pos.z)


def _apart(a: Vec3, b: Vec3) -> float:
    return math.dist((a.x, a.y, a.z), (b.x, b.y, b.z))


def _across(a: Vec3, b: Vec3) -> float:
    return math.hypot(a.x - b.x, a.z - b.z)
