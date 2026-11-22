# Game modes

A room has a game mode, chosen as it's created (issue 493). Free play is what every room was and
what `global` always is. The others are games with rules of their own, shootout and racing first.
This is what each is to do, how the code is to be laid out for them, and how far it has got.
`CLAUDE.md` ("Game modes") has the two rules every change is held to; everything else is here.

Keep it true as the work lands: a part that's built is struck off the stack at the end, and its
description here (or in `CLAUDE.md`, where it's something every agent needs) is put in the present
tense. **Nothing here is built yet.**

## The modes

| Mode      | What the home screen says of it                                                            |
| --------- | ------------------------------------------------------------------------------------------ |
| Free play | No rules. Do whatever you want with friends!                                               |
| Racing    | Race against other players in a 3 round competition.                                       |
| Shootout  | Split up into even teams and get as many kills as you can. Team with the most kills wins. |

The home screen's CREATE tab has a GAME MODE dropdown, free play unless another is picked, with the
mode's line under it. `global` is always free play, and so is an offline room. Free play has no
room master, no GAME tab and no banner: it is the game as it stands, and stays so.

## What every game has

### The room master

- Whoever created a room with a game is its room master, for as long as the room lasts, with a
  crown by their name on the roster. Free play has none. "Room master" is the name, in what players
  read and in the code: never "game master".
- Only the master changes the game's settings, starts it and ends it.
- When the master leaves, the room closes for everyone, who get the disconnected page saying the
  room master ended the room. Any way of leaving counts: the LEAVE ROOM button (which warns the
  master first that it closes the room), a closed tab, a lost connection, a reloaded page. A
  master whose page comes back after one of those is told the same as everyone.
- A closed room's code is free to be created again.

### The flow

Every game goes through the same phases, written once.

1. **Lobby.** Free play in every way, with three differences. A banner keeps flashing over the
   view: "Waiting for room master to organize and start the game..." for everyone but the master,
   whose own says "Go to the menu (press M) to start the game." A body at no hearts lies three
   seconds, so its player sees they died, and is then back at full hearts in `RESPAWN_AREAS`, with
   no death screen and no death sound. And whoever joins is a player. The room's default bots come
   as they do in free play, and bots can be called.
2. **Starting.** The master presses START, which is there to press once the mode's own condition
   to start holds. Everyone is told "game is starting in 5", counted down, still in the lobby. The
   lobby's bots are killed (as `/kill-bots` does), and bot commands are refused from here until the
   lobby is back.
3. **Playing.** The world is cleared (karts, frost, hearts left lying) and every player gets a new
   body: full hearts, nothing held or worn, in the look they had if it's one on foot and the
   standard body if it isn't. The roster's kills and deaths start from nothing. The mode puts
   everyone where they start, and its rules hold until it ends, by its own rule or by the master's
   END GAME, which goes straight back to the lobby with no results: "room master ended the game!"
   stands over the lobby's banner for a moment, and goes.
4. **Results.** Who won, on one screen every mode fills in, for ten seconds.
5. Back to the **lobby**: everyone gets a new body in `RESPAWN_AREAS`, as after a death, ghosts are
   players again, the world is cleared, and the lobby's bots don't come back.

Someone who joins once a game is playing is a ghost (below) until the lobby is back.

### The GAME tab

The menu's third tab, there only in a room with a game, and the one the master's menu opens on.
Everyone sees the same settings, changing as the master changes them; only the master's are live,
and everyone else's are greyed. START is here in the lobby and END GAME in a game. Its rows are the
menu's own kinds (`ui/menu/rows.ts`) with the few new ones the modes need (a board of players, a
board of teams), and it has to stay clean and easy on a phone: team drag has a tap to move.

### Refused commands

A mode says which commands its game allows, and every other is refused there with its reason, as
the Room refuses anything, and greyed on the commands card and in the chat's completions. Bot
commands are refused in every game. A new command doesn't build until every mode says whether its
game allows it.

### Ghosts

A ghost is a player who is in the room and not in the game: someone who joined while it was
playing, or a racer who is out.

- Everyone sees a ghost, translucent, and a ghost sees itself the same way. Nobody else hears one.
  The roster shows a ghost's icon in place of hearts.
- A spectator appears 10 m from a player picked at random.
- A ghost walks, jumps, flies a jetpack, changes between looks on foot and holds weapons, and
  touches nothing: it can't hurt or be hurt, its shots and sprays do nothing (no frost, nothing
  melted), it takes no pickup, opens no door (it walks through a shut one), scores nothing, and has
  nothing to do with karts (it can't drop one, get in one or be hit by one).
- A ghost sees everyone, whatever a mode hides from its players: every name, pin and mark.

### Leaving mid-game

Each mode says what a player leaving does to its game. The master leaving closes the room.

## Shootout

Teams, a clock, and the most points when it runs out.

**Settings.**

- The clock: 5:00, moved 30 seconds at a time with + and -.
- Teams: two to four, named A, B, C and D and coloured red, green, blue and yellow. + adds an
  empty team. - takes the last one away and deals its players round the others in turn. Someone who
  joins the lobby goes on the team with the fewest. The master drags players from team to team.
- Bots: + adds one to the team with the fewest, - takes one from the team with the most, and each
  has its level beside it (three levels). These are apart from the lobby's bots, which are killed
  at the start. Drawn and disabled until there are combat bots (below).
- START once every team has the same number of players, bots counted, and at least one.

**The game.**

- The whole world is in play.
- Everyone starts indoors, at one of nine sites: each of the tower's four floors, each keep's
  ground floor, the pineapple's living room and the Krusty Krab's dining room. The sites are dealt
  to the teams so no two teams share one, and a team's players are spread over its own.
- A team's colour is its players' for the game, wherever a player is named or marked (the name over
  their head, the roster, their pin, their mark on the maps, their name in the chat). A standard
  body is painted in it; any other look stays as it is. Everyone has their own colour back in the
  lobby.
- Opponents have no name over their heads, no pin and no mark on any map. Teammates have all
  three, and on the maps a big pointer like the player's own.
- A kill of an opponent is two points to the killer's team. Any death is a point off the dead
  player's team, however it came (a fall, out of bounds, a crash, a teammate), and a team's points
  never go below nothing. A teammate can be killed, which scores nothing for the kill, and the chat
  says "x killed y with friendly fire". Names in the kill lines are in their teams' colours.
- Death is free play's: ten seconds, the RESPAWN button, back in `RESPAWN_AREAS`.
- Allowed: weapons, gear, `/speedy`, `/unequip`, looks on foot and karts. Refused: dragons,
  teleporting, colours and bot commands.
- The HUD's top right has every team's points and the clock.
- When the clock runs out the team with the most points wins, and a tie is a tie.
- A player who leaves is gone from their team, whose points stand.

## Racing

A series of races, each on a track of its own, in karts, for points.

**Settings.**

- The number of races, 3 unless changed.
- A board of the racers: everyone in the room.
- Bots: + and - add and take away one, each with its level beside it (two levels). Apart from the
  lobby's bots, and drawn and disabled until there are racing bots (below).
- START with two racers or more, bots counted.

**The game.**

- The racers are whoever is in the room at the start, and their number, N, holds for the whole
  game. The track of every race is worked out then.
- A track is a strip a road wide, run along the roads from an island for 1.2 to 2.4 km (one to
  two minutes flat out in the Standard Kart). It ends at a dead-end island or on the floor the
  buildings stand on, which it may run onto but never through. Each race has a new one, found at
  random. A checkered line is drawn across the floor where it ends.
- Every race begins with each racer sat in a kart in their livery, lined up at the start, engines
  idling, held there for five seconds: "follow the green to the end as fast as you can!" for two,
  then a count of three. The kart is the look's they have going in, and stays so through the race
  whatever look they change to.
- Driving is driving. Nobody gets out (E does nothing), and the only commands are looks on foot.
- Off the track is out of bounds: the red box says so, and after two seconds Lakitu sets the kart
  back on the track where it left, as he does at the world's edge. The floor off the track is drawn
  grey, and where the track crosses open floor (an island, the buildings' floor at its end) its
  sides get the bold green border the floor's edge has, since what's beyond them is grey. The maps
  dull everything but the track and mark the other racers boldly.
- The HUD's top right says, hugely, what place the racer is in.
- Crossing the line brings a kart to a stop and tells its racer their place. When the first one
  crosses, everyone is told, and the rest have 45 seconds; the last ten flash on their screens, and
  whoever hasn't finished at the end of them is eliminated.
- Eliminated is no points for the race: a kart blown up (its driver thrown out, as anywhere), not
  finishing in time, or leaving the room. Their screen says ELIMINATED and to wait for the race to
  end, and they are a ghost until the next race begins. Someone who leaves is eliminated in every
  race left, and stays on the board to the end of the game, so the points come out the same.
- After each race a leaderboard gives everyone their points for it, N less one for every place
  behind first (N for first, 1 for the last of N to finish), and the next race begins.
- After the last, the racer with the most points wins, a tie being shared.

## How the code is laid out

```
packages/shared/src/modes/
  index.ts      the registry: each mode's id, name and line, and what makes its game
  mode.ts       GameMode: the questions the Room and the client ask a mode, with free play's answers
  game.ts       what every mode with a game shares: the master, settings, the phases, start and end
  shootout/     teams, spawn sites, points, and its answers
  racing/       tracks, the grid, places, elimination, points, and its answers
packages/client/src/modes/
  shootout/     its HUD (points and clock) and its board of teams
  racing/       its HUD (place), the track on the maps and the floor, the finish line
```

A mode has two halves. Its **rules** are pure functions of the game's state, in `shared`, which the
Room and the client both call, so what the server enforces and what the client shows can't
disagree and nothing worked out from the state is sent beside it: what's refused, what no hearts
means, what floor is in play, who sees whom. Its **referee** runs in the Room alone and moves the
game on: the master's changes to the settings, the start, where everyone is put, the points, the
clock, the end.

**The questions**, as the two modes need them. This list is the interface between a mode and
everything else, and it will change as modes and features are added (`CLAUDE.md` says how).

| The Room or the client asks                              | Free play answers                         | For                                                 |
| -------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| May this player do this (a command, getting out)?        | yes                                       | `runCommand`, a kart's exit; the commands card      |
| What does no hearts mean here?                           | lie 10 s, the death screen, a new body    | the Room's respawn; `ui/Death.ts`                   |
| Where is this body put?                                  | `SPAWN_AREAS`, `RESPAWN_AREAS`            | joining, a game's start, coming back, a spectator   |
| What floor is in play?                                   | the whole world's                         | a kart's rescue, the red box, the maps, the floor   |
| What did this kill or death score?                       | nothing                                   | the Room's `damage`                                 |
| How does this player see that one?                       | plainly, in their own colour              | name tags, pins, maps, the roster, the chat's names |
| What is someone who joins now?                           | a player                                  | joining                                             |
| What does this player leaving do?                        | their seat goes                           | leaving                                             |

**State and the wire.** A game's state (the mode, the master, the phase, the settings, the points,
a race's track and order) is one object a mode owns, sent whole in `welcome` and again whenever it
changes; clocks are in it as the tick they run out at. The master's changes go up as one kind of
message. A player's own part in it rides on `PlayerState` (`ghost`). The mode rides the join as
`game=` (the join's `mode=` is already create or join). The Python mirror carries all of it, and
bots take no ghost for a target.

**The hosts.** The lobby keeps a room's mode with its session and hands it on with every join, so
whichever join makes the Room makes it in the right mode; in dev the room server takes it from the
create. A room its master closed refuses every join from then on, and its session reads as dead to
the lobby, which frees its code.

**The client.** What every mode shares is written once: the banner (the lobby's lines, the
countdown, a race's last seconds), the results screen, the GAME tab, refused commands greyed, the
roster's marks (crown, ghost, team), a ghost's drawing, and the mode's say in `ui/NameTags.ts`,
`ui/Pins.ts`, `ui/MapCanvas.ts` and `ui/Death.ts`. A mode's client directory adds its own HUD and
nothing else, and `Game.ts` asks the questions rather than growing a branch per mode.

**The roads' graph.** `sim/botMap/roads.ts` builds a graph of the roads' middle lines for the bots
alone. It becomes the sim's own: a race's track is a way through it, the bots' roads map is the
same graph written out, and the client draws a track (on the maps, on the floor) from it, so
there's one account of the roads for all three. Ways across the buildings' floor join it for the
bots' laps in free play; a track takes one only to end on it.

## The stack

Merged a PR at a time, in these batches. Shootout and Racing stay out of the home screen's dropdown
outside dev until each can be played, so free play is run on every merge.

**1. What every game has**

- [ ] The mode at create: the registry, the home screen's dropdown and line, the mode through the
      lobby and the room server into the Room, and into `welcome`.
- [ ] The room master: the crown, the master's leaving closing the room, the warning on LEAVE ROOM,
      a closed room's code freed.
- [ ] The flow: the phases, START and END GAME, the banner and the countdown, the results screen,
      back to the lobby; the lobby's bots killed at the start and bot seats refused in a game.
- [ ] The GAME tab: there in a room with a game, the master's to change and everyone's to see.
- [ ] Refused commands, greyed where commands are offered.
- [ ] What no hearts means, per phase: the lobby's three seconds and no screen.

**2. Ghosts**

- [ ] `PlayerState.ghost`: nothing a ghost does touches the world, and nothing touches it.
- [ ] A ghost drawn translucent, to itself too, and unheard by others; its icon on the roster.
- [ ] Joining a game that's playing: a spectator, 10 m from someone, a player again in the lobby.

**3. Shootout**

- [ ] Teams in the settings: the board, adding and taking away teams, dragging, joiners dealt in,
      the condition to start; bots' rows drawn and disabled.
- [ ] The game: colours, the sites dealt, the clock, the points, the kill lines, the end.
- [ ] Who sees whom: names, pins and maps; the HUD's points and clock; the roster by team.
- [ ] Shootout on the home screen and in the guide.

**4. Racing**

- [ ] The roads' graph in the sim, and tracks found through it.
- [ ] The floor in play: a kart off the track rescued onto it, the red box.
- [ ] A race: the grid, the countdown, no getting out, places, the line, the 45 seconds,
      elimination, points, the leaderboard, the series.
- [ ] Its HUD: the place, the track on the maps, the grey floor, the checkered line.
- [ ] Racing on the home screen and in the guide.

## Later: the modes' bots

A separate piece of work. Until it's done the bots' rows in both modes' settings are disabled, and
a game is people alone.

- **Racing bots**, two levels: one that keeps to the road's middle and drifts or tricks only to
  get back to it, and one that drifts, tricks and holds its line like the best racer there is. They
  drive by the roads' graph (above), corrected for how far off the middle they are. In free play
  they lap the whole of the roads, the ways across the buildings' floor included.
- **Combat bots**, three levels, with a better reading of the map than the bots have today: the
  gun and the flamethrower, swapped between as the fight asks; a jetpack used sparingly; a kart
  taken to cover a long way and then blown up with the gun; moving smoothly rather than from node
  to node of the ground's graph.

## To settle

- Whether the first race's five seconds on the grid follow the game's own "game is starting in 5",
  counted in the lobby as every mode's is, or stand in for it. As written, they follow it.
