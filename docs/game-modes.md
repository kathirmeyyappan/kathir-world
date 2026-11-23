# Game modes

A room has a game mode, chosen as it's created (issue 493). Freeplay is what every room was and
what `global` always is. The others are games with rules of their own, shootout and racing first.
This is what each is to do, how the code is to be laid out for them, and how far it has got.
`CLAUDE.md` ("Game modes") has the two rules every change is held to; everything else is here.

Keep it true as the work lands: a part that's built is ticked off the stack at the end, and its
description here (or in `CLAUDE.md`, where it's something every agent needs) is put in the present
tense. **Only what's ticked there is built.**

## The modes

| Mode      | What the home screen says of it                                                            |
| --------- | ------------------------------------------------------------------------------------------ |
| Freeplay | No rules. Do whatever you want with friends!                                               |
| Racing    | Race against other players in a 3 round competition.                                       |
| Shootout  | Split up into even teams and get as many kills as you can. Team with the most kills wins. |

The home screen's CREATE tab has a GAME MODE dropdown, freeplay unless another is picked, with the
mode's line under it. The modes are `GAME_MODES` (`packages/shared/src/modes/index.ts`: each one's
id, name and line). `global` is always freeplay, and so is an offline room. Freeplay has
no room master, no GAME tab and no banner: it is the game as it stands, and stays so.

## What every game has

### The room master

- Whoever created a room with a game is its room master, for as long as the room lasts, with a
  crown by their name on the roster. Freeplay has none. "Room master" is the name, in what players
  read and in the code: never "game master".
- Only the master changes the game's settings, starts it and ends it.
- When the master leaves, the room closes for everyone, who get the disconnected page saying the
  room master ended the room. Any way of leaving counts: the LEAVE ROOM button, a closed tab, a
  lost connection, a reloaded page. A master whose page comes back after one of those is told the
  same as everyone.
- Every way out of the room the game itself offers warns the master first that it closes the room,
  and goes at a second press: the menu's LEAVE ROOM, JOIN GLOBAL and room code, and the death
  screen's EXIT TO HOME.
- A closed room's code is free to be created again once its session has idled out, about a minute
  on.

The master is `GameState.master`, kept by `Game` (`modes/game.ts`, what every mode with a game
shares): the player whose join made the room, which the Room is told by its host (`JoinOptions.made`:
the lobby's word, `made=1` on the join whose request started the room's session, and on a bare
server a create). It isn't whoever is seated first, since someone told the code can be in before
the room's maker. A page can say `made=1` for itself before the maker's does, and is believed: the
lobby vouches for nothing the room server can check. The master leaving ends the room (`Room.end`,
through the mode's `close`): every link is closed with the reason, which the client's disconnected
page shows, and the room server keeps the room's key as ended, so a join that still reaches its
session is told the same rather than made a new room under it. On the client the crown is the
roster's (`Hud.setMaster`), and the warning is `Game.leaving`, given to the menu's ways out
(`ui/menu/tabs.ts`) and the death screen's, each a press made twice (`ui/pressTwice.ts`).

### The flow

Every game goes through the same phases, written once (`Game`, `modes/game.ts`; `GameState.phase`,
which is null in freeplay, where there's no game to be anywhere in).

1. **Lobby.** Freeplay in every way, with three differences. A banner keeps flashing over the
   view (`ui/GameBanner.ts`): "Waiting for room master to organize and start the game..." for
   everyone but the master, whose own says "Go to the menu (press M) to start the game." A body at
   no hearts lies three seconds, so its player sees they died, and is then back at full hearts in
   `RESPAWN_AREAS`, with no death screen and no death sound (No hearts, below). And whoever joins
   is a player. The room's default bots come as they do in freeplay, and bots can be called.
2. **Starting.** The master presses START GAME, which is there to press once the mode's own
   condition to start holds. Everyone is told "Game is starting in 5", counted down
   (`START_SECONDS`, against `GameState.until`), still in the lobby. The lobby's bots are killed
   (as `/kill-bots` does), no bot of a player's calling is seated from here until the lobby is
   back, and the bots' commands are refused until then (Refused commands, below). The game's own
   bots (A game's bots, below) are asked of the host now, each by the name it's to come as
   (`Game.gather`, `ModeRoom.call`); one that comes by one of those names is taken in (`awaits`)
   and, once counted down, the start waits for the ones still to come (`gathered`: `until` is null
   meanwhile, and the banner says the game's bots are joining) until it gives up on them.
3. **Playing.** The world is cleared (karts, frost, hearts left lying, the bots' seats) and every
   player gets a new body: full hearts, nothing held or worn, in the look they had if it's one on
   foot and the standard body if it isn't. The roster's kills and deaths start from nothing. The
   mode puts everyone where they start, and its rules hold until it ends, by its own rule or by the
   master's END GAME, which goes straight back to the lobby with no results: "room master ended the
   game!" stands over the lobby's banner for a moment, and goes.
4. **Results.** Who won, on one screen every mode fills in (`ui/Results.ts`, from the mode's
   `Rules.standings`): the winner big at the top with a crown, or every side level on the most
   under "it's a tie", and the rest small under them in their order. It stands for ten seconds
   (`RESULTS_SECONDS`), the world going on under it with nothing left to score. A game whose mode gives it a length (`Game.runs`) comes here as its clock
   runs out; one without is its master's to end.
5. Back to the **lobby**: everyone gets a new body in `RESPAWN_AREAS`, as after a death, ghosts are
   players again, the world is cleared, the game's own bots go with it, and the lobby's bots don't
   come back.

Someone who joins once a game is being played is a ghost (below) until the lobby is back. Someone
who joins through the countdown is in the game it's counting down to.

What a game does to its room it does through `ModeRoom` (`modes/mode.ts`): a new body for a player
somewhere (`embody`, the Room's `rebody`, which is also what brings the dead back, and counts
`PlayerState.body` up so every client knows the body for a new one), the world cleared (`clear`,
dead bots' seats with it), the bots dropped dead (`dropBots`), a bot of its own asked of the host
(`call`), and everyone it's played with (`everyone`: the people, and the bots alive, which once a
game has begun are its own). The master asks for the start and the end with a `game`
message (`GameAction`), which the Room hands its mode (`asked`); the mode is stepped with the room
(`step`) and says what a join is made: a player, a ghost, or turned away (`joining`).

### The GAME tab

The menu's third tab, there only in a room with a game, and the one the master's menu opens on
(`Tab.shown` and `Tab.first`, `ui/menu/rows.ts`; `theGame` in `ui/menu/tabs.ts`). It names the mode,
and has START GAME in the lobby and END GAME in a game, the master's to press and greyed for
everyone else; the menu goes as either is pressed. START is there to press once the game is set up
to start, the mode's rule (`Rules.starts`, which the Room holds the master's START to), and says
what's missing until then. Each mode's settings come with the mode, in a section of its own under
it (`MODE_SETTINGS`, the client's `modes/index.ts`, a section to each mode, there in a room of that
mode): everyone sees the same ones, changing as the master changes them, only the master's live,
and only in the lobby. A change goes up as a `settings` message, which the Room hands its mode to
read (`GameMode.changed`; `Game.changed` takes one from the master, in the lobby, and the mode's
own `set` reads it). Its rows are the menu's own kinds with the few new ones the modes need (a
board of players in columns, `Board` in `ui/menu/rows.ts`), and it has to stay clean and easy on a
phone: a player is dragged to a team, or tapped and then the team.

### Refused commands

A mode says which commands its game allows, and every other is refused there with its reason, as
the Room refuses anything, and greyed on the commands card and in the chat's completions. Bot
commands are refused in every game. A new command doesn't build until every mode says whether its
game allows it.

It's a rule of the mode's (`Rules.refuses`, `modes/rules.ts`), holding from a game's start until
its lobby is back. A command is of a kind (`CommandKind`, `kindOf`: a weapon, gear, a look on
foot, a dragon, a bot's), and a game says of every kind whether it allows it (`Playing.allows`, an
`Allowed`: a table, made rules by `gameRules` in `modes/game.ts`), so a new kind is a compile error
until each game has said. The Room asks before anything else about a command (`runCommand`), and the
client asks the same function of the state it was sent (`rulesOf` for both; `refusedBy` in
`ui/commands.ts`): a refused command's button on the commands card is greyed, and at a press says
why in the red box, the card staying up, and its line in the chat's completions is greyed too. One
sent anyway is refused by the Room like any.

### No hearts

What no hearts means is a rule of the mode's too (`Rules.dying`, a `Dying`): how many seconds a
person's body lies before the Room brings them back in a new one, and whether the death screen
stands over that, with its count, its RESPAWN button to come back sooner and the look's death
sound. Freeplay's is ten seconds under the screen (`FREEPLAY_DYING`). A game's lobby, its
countdown included, is somewhere to wait: three seconds and no screen (`LOBBY_DYING`), the mouse
staying the world's, and the player watching their body lie from the boom whatever their view
(`View.watching`), since nothing else says they died but the kill line. While a game is played
it's the mode's own to say (`Playing.dying`), freeplay's until it does. The Room reads it each
step for how long the dead lie and takes a `respawn` message only where there's a screen to have
sent it; the client reads it as its player dies (`Game.die`).

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

A ghost is `PlayerState.ghost`, which every client is sent. The world's doings are kept to the
Room's `bodies`, everyone but the ghosts: pounds, storms, karts and pickups reach bodies alone, and
shots and strikes pass through a ghost (`combat.ts` `spared`, which the client's crosshair and aim
ask the same). What a ghost does comes to nothing: its step lands on nothing and swings at nobody
(`Room.advance`), its shot is seen and reaches no one, no kart and no frost (`applyActions`;
`resolveFire` for the client's crosshair), it swings no door (`use`) and no door stops it
(`Structures.throughDoors`, taken in `stepPlayer`, so prediction agrees), and `damage` turns it
away whatever got that far, so nothing can kill one into a player's body. What it may ask for is a
table of its own (`GHOST_ALLOWS`: no kart, no dragon), checked before the game's
(`refusal`, which the Room enforces and the client greys by). What a join is made is the mode's to
say (`GameMode.joining`: a player, a ghost, or turned away): a game being played makes a person a
ghost, who comes in 10 m across the floor from someone in it (`Room.besideSomeone`), and every new
body the lobby hands out is a player's.

On the client a ghost is seen through, by everyone and by itself: its body, what it holds and
wears (`seeThrough`, `render/avatars/common.ts`: every mesh under the avatar at a share of its
visibility, each frame it's a ghost, since what it carries comes and goes), its name over its head,
its own hands in first person and its body in the menu's preview. Nobody else hears one: the
frame's `heard` players (`Game.ts`) leave ghosts out of the footsteps, the moves' sounds and the
loops, a ghost's lines aren't said (`Game.line`), and its shot is seen and not heard (`hearShots`).
The roster shows a ghost's mark where its hearts would be. Its own HUD has no hearts, a banner
that says it's spectating, no word about being out of bounds or at full health, and no prompt at a
door.

### A game's bots

Every game brings bots of its own the one way (`Game`, with `modes/bots.ts`). Its master adds and
takes them away in its settings, up to eight (`MOST_BOTS`), and steps each one's level, 1 to 5
(`BOT_LEVELS`; a new one is at the last one's). Each is a `GameBot` in the game's state
(`GameState.bots`, the first of them bot 1): its `key`, which its mode lists it by among its
players, its level, the look the room drew for it as it was added (`BOT_LOOKS`: one nobody there
wears, while there's one), and once it has come the `id` of the player it is. The master's changes
are `BotsChange`s, the same for every mode, so the rows for them are too (the client's
`modes/bots.ts`: the BOTS stepper, and a bot as a board lists it, its level between a - and a +).

A mode says only which of the bots app's bots plays its game (`Game.plays`: a racer, a fighter),
and where it lists its players itself, what a bot added or taken away does to that list (`added`,
`dropped`, and `goes`, which one is taken: shootout's teams). The bots are apart from the lobby's,
which are killed at the start: asked for as the game starts, called bot 1, bot 2 and on, in the
game as anyone is (a dead one is brought back as a person is until the lobby is back,
`GameMode.revives`), and gone with it, still set for the next. A bot reads what it was brought as
off the game's state, by its id (`WorldState.brought` and `rating`, `modal-bots/common/state.py`).

### Leaving mid-game

Each mode says what a player leaving does to its game. The master leaving closes the room.

## Shootout

Teams, a clock, and the most points when it runs out.

**Settings.**

- The clock: 5:00, moved 30 seconds at a time with + and -.
- Teams: two to four, named A, B, C and D and coloured red, green, blue and yellow. + adds an
  empty team. - takes the last one away and deals its players round the others in turn. Someone who
  joins the lobby goes on the team with the fewest. The master drags players from team to team.
- Bots (A game's bots, above): + adds one to the team with the fewest, and - takes away the last
  on the team with the most. Each is on the board on its team, moved like anyone, with its level
  to step.
- START once every team has the same number of players, bots counted, and at least one.

Its settings are its own part of the game's state (`ShootoutState`, `modes/shootout/state.ts`: the
clock's `seconds` and each team's members, a person by their id and one of its bots by its key,
`memberOf`), changed by the master's `ShootoutChange`s (the clock, how
many teams, a member to a team; `Shootout.set`, `modes/shootout/referee.ts`). The referee keeps
everyone on a team: whoever comes into the lobby or the countdown, and whoever watched the last
game as a ghost once the lobby is back, goes on the one with the fewest, and whoever leaves is off
theirs. The start's condition is `SHOOTOUT_RULES.starts`. On the client they're
`modes/shootout/settings.ts`: the TEAMS, CLOCK and BOTS steppers and the board of teams, its bots
on it.

**The game.**

- The whole world is in play.
- Everyone starts indoors, at one of nine sites: each of the tower's four floors, each keep's
  ground floor, the pineapple's living room and the Krusty Krab's dining room. The sites are dealt
  to the teams so no two teams share one, and a team's players are spread over its own.
- A team's colour is its players' for the game, wherever a player is named or marked (the name over
  their head, the roster, their pin, their mark on the maps, their name in the chat). A standard
  body is painted in it; any other look stays as it is. Everyone has their own colour back in the
  lobby.
- Everyone has their name over their head, a pin and a mark on the maps, in their team's colour.
  A teammate's mark on the maps is a big pointer like the player's own.
- A kill of an opponent is two points to the killer's team. Any death is a point off the dead
  player's team, however it came (a fall, out of bounds, a crash, a teammate), and a team's points
  never go below nothing. A teammate can be killed, which scores nothing for the kill, and the chat
  says "x killed y with friendly fire". Names in the kill lines are in their teams' colours.
- Death is freeplay's: ten seconds, the RESPAWN button, back in `RESPAWN_AREAS`.
- Allowed: weapons, gear, `/speedy`, `/unequip`, looks on foot and karts. Refused: dragons,
  teleporting, colours and bot commands.
- The HUD's top right has every team's points and the clock.
- When the clock runs out the team with the most points wins, and a tie is a tie.
- A player who leaves is gone from their team, whose points stand.

As the game begins (`Shootout.begin`) the rooms indoors (`INDOOR_ROOMS`, `content/regions.ts`) are
shuffled and dealt round the teams, each player starts in one of their team's (`startsAt`), and
takes the team's colour as their own (`PlayerState.color`, which paints a standard body and rides
with whatever is made out in their name), their own kept for the lobby. The Room tells the mode of
every death (`GameMode.died`, from its one `damage`), and the referee keeps each team's points
(`ShootoutState.points`, `POINTS`) while the game is being played. A player's team is their side
(`Rules.side`, null in the lobby), which is how the client knows a teammate's kill for friendly
fire, and the teams by their points are its standings (`Rules.standings`).

Who's shown to whom is a rule too (`Rules.sees`: `plain`, `side` or `hidden`; shootout's is `side`
for a teammate and `plain` for everyone else, and `hidden` is there for a mode that hides its
opponents). The client asks it
once a frame (`ui/sight.ts` `shownTo`) and hands the name tags, the pins and the maps only those
the player is shown, each with the colour they go by (`colourOf`: their side's, else their own
look's) and whether their mark is a pointer as big as the player's own; the roster takes the same
colour and keeps a side's players together, and the names in the kill lines are in it while the
game has sides. While a game with standings is played they're in the top right with its clock
(`ui/Scores.ts`).

## Racing

A series of races, each on a track of its own, in karts, for points.

**Settings.**

- The number of races, 3 unless changed.
- Bots (A game's bots, above): + and - add and take away one.
- A board of the racers: everyone in the room, and under them its bots, each with its level to
  step.
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
  then a count of three. For those two seconds the new track's map stands over the view, the
  track lit on it, with which race it is and how long the track is. Lakitu hangs the starting
  lights over the road ahead of them: a lamp lights red with each second of the count, with a
  beep, and all three turn green as the grid is let go. The kart is the look's they have going
  in, and stays so through the race whatever look they change to.
- Driving is driving. Nobody gets out (E does nothing), and the only commands are looks on foot.
- Off the track is out of bounds: the red box says so, and after two seconds Lakitu sets the kart
  back on the track where it left, as he does at the world's edge. The floor off the track is drawn
  grey, and where the track crosses open floor (an island, the buildings' floor at its end) its
  sides get the bold green border the floor's edge has, since what's beyond them is grey. The maps
  dull everything but the track and mark the other racers boldly.
- The HUD's top right says, hugely, what place the racer is in.
- Crossing the line brings a kart to a stop and tells its racer their place. All of the disc the
  track ends on is in play, so a kart over the line has the whole platform to stop on, and Lakitu
  comes only for one that falls off it. Five seconds on, the racer is let out, their kart gone
  with them: a ghost, free to go where they like until the next race. When the first one crosses,
  everyone is told, and the rest have 45 seconds; the last ten flash on their screens, and whoever
  hasn't finished at the end of them is eliminated.
- Eliminated is no points for the race: a kart blown up (its driver thrown out, as anywhere), not
  finishing in time, or leaving the room. Their screen says ELIMINATED and to wait for the race to
  end, and they are a ghost until the next race begins. Someone who leaves is eliminated in every
  race left, and stays on the board to the end of the game, so the points come out the same.
- After each race a leaderboard gives everyone their points for it, N less one for every place
  behind first (N for first, 1 for the last of N to finish), and the next race begins.
- After the last, the racer with the most points wins, a tie being shared.

A game's own state is `RacingState` (`modes/racing/state.ts`): how many `races`, the `racers` (each
with the name, colour and look they had as it began, and whether they've left), their `points`, and
the
`round` being run: its track (a place in `routes()`), the tick it's let `go`, the tick it `closes`
once someone has finished, who has `finished` in order, who's `out`, and once it's run the tick
the next begins. The referee (`Racing`, `referee.ts`) deals the tracks as the game begins, seats
every racer in a kart on the grid (`ModeRoom.seat`, the garage's `park`), and each tick asks the
track where every racer's kart is (`onTrack`): over the line is finished, in no kart is out
(`ModeRoom.haunt`: a ghost until the next race), and when the clock on the rest runs out, or
nobody is left racing, the places are scored (`pointsFor`) and the leaderboard stands. Its rules
(`rules.ts`) are what the Room and the client both ask: only looks on foot are allowed, the
round's track is the floor in play (`track`), a racer can't get out (`seated`), and a kart is held
on the grid, over the line and once the race is run (`held`, by the Room's own tick, so everyone
with the gas down leaves the grid on the same tick whatever their lag; a driver's prediction counts
that tick on from the last it heard, one for each frame not yet answered).

The client's part (`modes/racing/hud.ts`) is read off that state and the karts in the snapshot,
with nothing more sent: the grid's words and its count and GO!, by the same count of the Room's
tick the kart is let go by; a racer's place, hugely, in the top right (`placesOf`: over the line
in the order crossed, then by how far along the track each kart is, then whoever's out), with
which race it is and, once someone has finished, the clock on the rest, flashing through its last
ten seconds; over the view, who finished and how long is left, the place a racer finished in, or
ELIMINATED; and when the race is run, its leaderboard (each racer's points so far and what the
race gave them) until the next begins. In the world it says where Lakitu starts the race from, how
far he's come and what's lit (`Showing.starter`, a `Start`), which `render/lakitu/Starter.ts`
draws. A racer is offered no way out of their kart: no key in
the legend, no hint, no OUT on touch.

## How the code is laid out

```
packages/shared/src/modes/
  index.ts      the registry: each mode's id, name and line, what makes its game (makeMode) and its rules (rulesOf)
  mode.ts       GameMode: what the Room tells a mode and asks it, with freeplay's answers
  rules.ts      Rules: what the Room and the client both ask of a game's state, with freeplay's answers
  game.ts       Game: what every mode with a game shares: the master, settings, the phases, start and end, its bots
  bots.ts       a game's bots: their levels, looks and names, and the changes its master makes to them
  shootout/     its state (state.ts), rules (rules.ts) and referee (referee.ts): teams, spawn sites, points
  racing/       its state (state.ts), rules (rules.ts) and referee (referee.ts): the series, a race's clocks, places
packages/client/src/modes/
  index.ts      what each mode adds to the client, by mode: its settings' rows, what its game has on the HUD
  bots.ts       the rows every game's settings have for its bots: how many, and one on a board with its level
  shootout/     its settings (settings.ts: the board of teams, the clock) and its HUD (hud.ts: points and clock)
  racing/       its settings (settings.ts: how many races, the racers) and its HUD (hud.ts: the grid's
                count, a racer's place, the clock on the rest, the leaderboard)
```

A mode has two halves. Its **rules** (`Rules`, `modes/rules.ts`; a mode's are `rulesOf` its state)
are pure functions of the game's state, in `shared`, which the Room and the client both call, so
what the server enforces and what the client shows can't disagree and nothing worked out from the
state is sent beside it: what's refused, what no hearts means, what floor is in play, who sees
whom. Its **referee** (`GameMode`, `modes/mode.ts`) runs in the Room alone and moves the game on:
the master's changes to the settings, the start, where everyone is put, the points, the clock, the
end. A rule is never the referee's to answer: the Room asks the rules as the client does.

**The questions**, as the two modes need them. This list is the interface between a mode and
everything else, and it will change as modes and features are added (`CLAUDE.md` says how).

| The Room or the client asks                       | Freeplay answers                       | For                                                 | Asked as                        |
| ------------------------------------------------- | -------------------------------------- | --------------------------------------------------- | ------------------------------- |
| May this player do this (a command, getting out)? | yes                                    | `runCommand`, a kart's exit; the commands card      | `Rules.refuses`, `Rules.seated` |
| Is this player's kart held where it stands?       | no                                     | the Room's drive; the driver's prediction           | `Rules.held`                    |
| What does no hearts mean here?                    | lie 10 s, the death screen, a new body | the Room's respawn; `ui/Death.ts`                   | `Rules.dying`                   |
| Where is this body put?                           | `SPAWN_AREAS`, `RESPAWN_AREAS`         | joining, a game's start, coming back, a spectator   | `Game.place`, at a start        |
| What floor is in play?                            | the whole world's                      | a kart's rescue, the red box, the maps, the floor   | `Rules.track`                   |
| What did this kill or death score?                | nothing                                | the Room's `damage`                                 | `GameMode.died`                 |
| Whose side is this player on?                     | nobody's                               | friendly fire's kill line; names and marks (to come)| `Rules.side`                    |
| How does the game stand?                          | it doesn't                             | the results screen; the roster's order              | `Rules.standings`               |
| What's on the HUD while the game is played?       | nothing                                | the banner's line, the top right, a leaderboard     | the client's `MODE_HUD`         |
| How does this player see that one?                | plainly, in their own colour           | name tags, pins, maps, the roster, the chat's names | `Rules.sees`, `Rules.side`      |
| What is someone who joins now?                    | a player                               | joining                                             | `GameMode.joining`, `joined`    |
| What does this player leaving do?                 | their seat goes                        | leaving                                             | `GameMode.left`                 |
| Is the game set up to start?                      | there's none                           | the master's START; the GAME tab                    | `Rules.starts`                  |

**State and the wire.** A game's state (`GameState`: the mode, the master and the phase with its
clock, and to come the settings, the points, a race's track and order) is one object a mode owns,
sent whole in `welcome` (`welcome.game`) and again whenever it changes (the `game` message); clocks
are in it as the tick they run out at, read against the tick of the client's last snapshot. A
mode's own part of it is a type of its own over the shared one (`ShootoutState extends GameState`),
which only that mode's code reads, by its guard (`isShootout`). The master's changes go up as one
kind of message (`settings`, its `change` the mode's own to read). A player's own part in it rides on `PlayerState` (`ghost`). The mode rides the join as
`game=` (the join's `mode=` is already create or join). The Python mirror carries all of it, and
bots take no ghost for a target.

**The hosts.** A create's pick rides it as `?game=`. The lobby keeps it with the room's session
(checking only its shape: which modes there are is the shared package's to know) and hands it on
with every join, whatever that join asks for, so whichever join makes the Room makes it in the
right mode (`RoomOptions.mode`); in dev the room server takes it from the create. The join whose
request started the session is told it made the room (`made=1`), and the page hands both on to
the room server as given (`LOBBY_SAYS`, the client's `net/lobby.ts`). A room its master closed
refuses every join from then on, and its code is free once its session has idled out.

**The client.** What every mode shares is written once: the banner (the lobby's lines, the
countdown, a race's last seconds), the results screen, the GAME tab, refused commands greyed, the
roster's marks (crown, ghost, team), a ghost's drawing, and the mode's say in `ui/NameTags.ts`,
`ui/Pins.ts`, `ui/MapCanvas.ts` and `ui/Death.ts`. A mode's client directory adds its settings'
rows (`MODE_SETTINGS`) and what its game has on the HUD while it's played (`MODE_HUD`, a
`Showing`: the line standing over the view, what's in the top right, a leaderboard over the view,
the track's map shown whole, and Lakitu starting a race), which the shared `ui/GameBanner.ts`,
`ui/Scores.ts`, `ui/Results.ts`, `ui/TrackPreview.ts` and `render/lakitu/Starter.ts` draw;
`Game.ts` asks rather than growing a branch per mode.

**The roads' graph.** `sim/tracks.ts` reads the roads as a graph off the road layer's own account
of each (`Road.middle`): a road is a leg between the two discs it's laid from and to, and a route
is a run of legs from an island to a dead-end island or onto the buildings' floor, 1.2 to 2.4 km,
taking no road and passing no place twice (`routes()`, about a thousand of them, listed once in an
order that's the same everywhere, so a race names its track by its place in the list). `layTrack`
turns a route into its track: its middle as a spot every few metres with the road's height and the
way it runs (both strands of a split), its start line at the rim of the island it leaves, with a
grid behind it (`gridOf`), and its finish line short of where it ends. `onTrack` places a body
against it (how far along, how far off the middle, by the road's own level, so a deck and the road
under it are apart), which is what the floor in play, a racer's place and the finish are all asked
of. The bots' roads map (`sim/botMap/roads.ts`) is built from the same `Road.middle` and lists
every track as the roads it takes, so a bot reads the middle of the track a race names
(`roads.track`, `modal-bots/common/map/roads.py`).

**The floor in play.** A mode narrows it with a track (`Rules.track`): its road, and all of the
disc it ends on (`inPlay`). The Room hands the garage
the track as the course its karts are held to (`Course`, `sim/vehicles/rescue.ts`; `courseOf`),
and a driven kart's watch counts it stranded off the course as it does on the ground past the
world's edge: two seconds on, Lakitu sets it down on the track's middle where it left, nose along
it. The client asks the same of the kart it predicts, for the red box, and draws the track
wherever the floor is drawn, whichever mode narrowed it: the ground's shader reads a picture of
the track from above (`render/TrackMask.ts`, made as the track is set, `Environment.setTrack`: a
texel to four metres saying how far across the track each spot is at the height it runs at, for
both levels where a deck goes over a road) and draws what's off it grey, as the ground past the
edge is, with a bold line of the grid along its sides, so it reads as the one way through where it
crosses open floor; `render/FinishLine.ts` lays the checkered line across its finish; and every
map (`ui/MapCanvas.ts`, the frame's `track`) dulls all but the track, lights it, marks the line,
and draws everyone as boldly as you.

## The stack

Merged a PR at a time, in these batches. Shootout and Racing each came to the home screen's
dropdown with the last PR of its batch, so freeplay was all anyone was offered until a mode could
be played.

**1. What every game has**

- [x] The mode at create: the registry, the home screen's dropdown and line, the mode through the
      lobby and the room server into the Room, and into `welcome`.
- [x] The room master: the crown, the master's leaving closing the room, the warning on LEAVE ROOM,
      a closed room's code freed.
- [x] The flow: the phases, START and END GAME, the banner and the countdown, back to the lobby;
      the lobby's bots killed at the start and no bot seated in a game.
- [x] The GAME tab: there in a room with a game, opening first for its master, with START and END
      GAME. Each mode's settings come with the mode.
- [x] Refused commands, greyed where commands are offered.
- [x] What no hearts means, per phase: the lobby's three seconds and no screen.

**2. Ghosts**

- [x] `PlayerState.ghost`: nothing a ghost does touches the world, and nothing touches it.
- [x] Joining a game that's playing: a spectator, 10 m from someone, a player again in the lobby.
- [x] A ghost drawn translucent, to itself too, and unheard by others; its icon on the roster.

**3. Shootout**

- [x] Teams in the settings: the board, adding and taking away teams, dragging, joiners dealt in,
      the condition to start.
- [x] The game: colours, the sites dealt, the clock, the points, the kill lines, the end, and the
      results screen every mode fills in.
- [x] Who sees whom: names, pins and maps; the HUD's points and clock; the roster by team.
- [x] Shootout on the home screen and in the guide.
- [x] Its bots: fighters, set in its settings as every game's are, on its teams, back from the
      dead as anyone is, gone with the game.

**4. Racing**

- [x] The roads' graph in the sim, and tracks found through it.
- [x] The floor in play: a kart off the track rescued onto it, the red box.
- [x] A race: the grid, the countdown, no getting out, places, the line, the 45 seconds,
      elimination, points, the leaderboard, the series; its settings and its HUD.
- [x] Its look: the track on the maps, the grey floor, the checkered line.
- [x] Lakitu at the start.
- [x] Racing on the home screen and in the guide.
- [x] Its bots: set in its settings by level, asked for and waited on as a game starts, racing
      beside everyone, gone with the game.

## The modes' bots

**Racing bots** are built, and are a race's own (A game's bots, above). A racer is as good as its
level asks (`RATINGS` in the bot, of all a driver can be:
from 0, the middle of the road short of flat out, to 1, all of the road and every drift and trick
there is; the best of them cut the corner where two of a track's roads meet, across the floor of
the island they meet on, off the track for about a second of the two a race gives before Lakitu
comes, and chain drifts down its straights, one after another, each let go at its first spark for
the boost). The bot (`modal-bots/bots/racer_bot.py`) reads its level off the game's state, the track off
the bots' roads map, and drives (`common/driving.py`, along a `common/racing_line.py`). No two of
a level race alike: each has a talent of its own for the lobby it's in, so one of them is the one
to beat, a day it's having, a mood that warms and cools through a race, and its own line and
start, from dice seeded by the room and its name. Still to come: in freeplay, lapping the whole of
the roads, the ways across the buildings' floor included.

**Combat bots** are the fighters (`modal-bots/bots/fighter_bot.py`, with `common/fighting.py`),
a shootout's own (A game's bots, above), each on a team, fighting from the game's start to its
results and stood by either side of that; called from chat
(`/fighter-bot`) one fights every person in a freeplay room. A fighter is as good as its level
says (of five, the middle one where no game gives it one) and fights in a way of its own, both
from dice seeded by its room and its name: the weapons it carries and which it likes best (the
gun, the flamethrower, the ice blower, the rifle), how it handles each, and its nerve, from one
that keeps its distance and waits to one that goes and finds whoever it's after. It misses nobody
on purpose: its aim follows where it believes its target is, a read a moment old carried on by how
they were moving, with a hand that comes round only so fast and never holds quite still, so a
level is how soon it notices someone, how well it stays on them, how often its weapon fires, how
much it moves in a fight, and how far it thinks past its aim (the other weapon when the first
doesn't suit, a heart when it's hurt). A rifle is fired only at someone who has gone on as they
were for a while, so whoever keeps moving isn't shot from across the map. In a game with sides it
leaves its own side alone, holds its fire while one of them is in the way, and keeps with them
when there's nobody near to fight.

Still to come for them: a jetpack used sparingly; a kart taken to cover a long way and then blown
up with the gun.

## To settle

- Whether the first race's five seconds on the grid follow the game's own "game is starting in 5",
  counted in the lobby as every mode's is, or stand in for it. As written, they follow it.
