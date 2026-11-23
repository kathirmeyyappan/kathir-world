# kathir world

Babylon.js multiplayer 3D playground. `packages/shared` is the pure sim + protocol + Room,
`packages/client` the Vite renderer, `packages/server` the Node host, `infra/` the Modal deploy.
`AGENTS.md` is a symlink to this file, so every agent reads the same rules: edit this one.

## Pull requests

- Anything visual gets screenshots in the PR description. Push the images to the orphan
  `screenshots` branch under `pr-<number>/` and embed each one in the description as an image,
  `![alt](https://raw.githubusercontent.com/kathirmeyyappan/world/screenshots/pr-<number>/<file>.png)`,
  so it renders inline rather than as a bare link.
  Capture them headless (Playwright with the swiftshader flags; `window.__world.debug()` and
  `setLook()` are exposed for scripting) and include a mobile shot when the HUD changes.
- Architecture diagrams live in `docs/` with their SVG-in-HTML sources in `docs/src/`. When a flow
  changes, edit the source and re-render the PNG with headless Chromium at 2x (a 1560 px viewport,
  `deviceScaleFactor: 2`, full page).

## Writing for the long run

Write each change as if the code had been designed with it in mind from the start, not patched to
fit. When a fix or a feature doesn't fit the shape of the code, reshape the code (rename, split, or
merge two mechanisms that do the same job) rather than add a special case beside it, and leave each
file you touch at least as clear as you found it. Keep one mechanism per job: before adding a second
way to load, cache, register or configure something, extend the first. Prefer a name and a type
that say what a thing is over a comment that explains a confusing one. If doing it properly is much
bigger than what was asked, do the targeted change and say what the proper one would be.

## Game modes

A room has a game mode, chosen as it's created: freeplay, which is what every room was and what
`global` always is, or a game with rules of its own (shootout and racing first; issue 493).
`docs/game-modes.md` is what each mode does, how the code is laid out for them and how much of it
is built. Read it before changing a room's rules, a command, a spawn, death and respawn, a kart's
rescue, the menu, the roster, a map or a bot, and keep it true as the modes land. Two rules come
before everything in it, and they hold for every change to the game from here on, whichever part
of it the change is in.

**Every change is weighed in every mode.** Nothing in the game is freeplay's alone any more. A
command, an item, a pickup, a kart, a look, a move, a bot, a thing on the HUD or a map, a sound, a
way to be hurt or to be put somewhere: each is met in a lobby, in a game of every mode, over a
results screen and by a ghost, and has to be right in all of them. So before the PR, answer these
for whatever the change adds or touches, and put the answers in it:

- **When:** what it does in a lobby, in each mode's game and over its results, and whether a mode
  refuses it (a race holds its karts and keeps their drivers in them: `Rules.held`, `Rules.seated`). A new command doesn't build until every mode says whether its game allows it (its
  `CommandKind` and each game's `Allowed`, `modes/rules.ts`).
- **Ghosts:** what a ghost (a spectator, a racer who's out) can do with it, and that a ghost doing
  it changes nothing in the world and isn't heard doing it. Whatever the world does to people it
  does to the Room's `bodies`, which leaves the ghosts out, and what a ghost's own step, shot or
  click would do is stopped where each is taken (`room.ts` `advance`, `applyActions`, `use`); a new
  kind of command says whether a ghost may ask for it (`GHOST_ALLOWS`, `modes/rules.ts`). On the
  client, whatever is heard of other players is heard of the frame's `heard` (`Game.ts`), which
  leaves the ghosts out, and whatever is drawn of a player's body is seen through on a ghost
  (`seeThrough`, `render/avatars/common.ts`).
- **Points:** if it can hurt or kill, that it goes through the Room's one `damage`, which tells
  the mode of every death (`GameMode.died`), so every mode scores it and says what the death means.
- **Place:** if it puts a body somewhere (a spawn, a teleport, a respawn, a rescue), that it goes
  through the Room's own placing, where the mode has its say.
- **Bounds:** if it asks where the world ends, that it asks for the floor in play, which a mode can
  narrow (a race's track: `Rules.track`, which a kart's rescue is held to as its `Course`).
- **Sight:** if it shows where someone is (a name, a pin, a mark on a map), that it asks who may
  see them: a mode hides opponents. It draws from the players `shownTo` the viewer, in the colour
  each comes with (`ui/sight.ts`, which asks the mode's `Rules.sees` and `Rules.side`), never from
  everyone in the snapshot.
- **Room state:** if it leaves anything in a room (things lying about, a toggle, a count), what a
  game's start and end do with it, and what becomes of it when its player leaves mid-game.
- **Both sides:** a rule the client has to agree with (what's refused, what's in bounds, who's
  seen) is one pure function in `shared` that the Room and the client both call, never written
  twice.

Until the part of the modes a question names is built (the doc's stack says how far it has got),
answer it against what stands in its place today: `damage`, `spawnPoint` and `respawn`,
`Structures.ground`.

**Neither a pile of special cases nor a framework.** The modes share most of what they are (the
lobby, the room master, the settings tab, the countdown, results, the way back to the lobby,
refused commands, ghosts, placing bodies), and each also has a great deal that is its own. The code
can go wrong both ways: everything copied per mode, with `if racing` scattered through the Room and
the client, or a framework so general that a mode is pages of answers to questions nobody asked.
Holding the middle comes first in any change here, ahead of getting it working, and a change that
only works by leaning one way isn't done:

- Freeplay is the Room as it stands. A mode changes the game only by answering one of the
  questions the Room and the client ask it (the mode's interface, `modes/mode.ts`), and freeplay
  answers none of them, so `global` behaves as it does whatever is added.
- Shared code never names a mode. Nothing outside `modes/<mode>/` asks whether this is racing: it
  asks the question and takes the answer. Inside its own directory a mode is plain code, as much as
  it needs, and its own HUD, settings and rules stay there.
- A question is asked only where shared code owns the thing and a mode needs it to go another way.
  Where modes differ by a value (which commands, how many seconds, who's on which team) the answer
  is data both sides read; a function only where they differ by a rule.
- The list of questions is not fixed, and is never grown to dodge a refactor. When a mode or a
  feature doesn't fit it, reshape it (merge two questions, split one, change what one is asked
  about) and every mode's answers with it, in the same PR, rather than add a flag, an optional
  argument or a second path beside the first. A question no two modes answer differently any more
  is deleted.
- What the modes being built both need is shared from the start. What only one needs is written in
  that mode, and moves into the shared flow when a second needs it: nothing is built for a mode
  that isn't being built, and nothing is copied into a second one.
- When something the game already has doesn't fit (it was written for a room with no phases, no
  ghosts and one kind of death), rewrite it to fit rather than build round it, and cut what the
  rewrite leaves unused.
- The measure: a new mode should be a directory and a row in the registry, and a change to one mode
  shouldn't show outside its directory. When it does, the shared part has the wrong shape, which is
  the thing to fix, and to say in the PR.

## Formatting and type checks

CI fails on any of these, so run them before pushing:

- `npm run format` (Prettier: TS, CSS, HTML, JSON) and `ruff format modal-bots infra` (Python).
- `npm run lint` checks formatting and bans explicit `any` and `@ts-` comments; `npm run typecheck` is
  strict `tsc`. Type the thing instead of casting around it: no `as unknown as`.
- `mypy` from the repo root is strict over `modal-bots/` and `infra/`. `Any` is for JSON at the wire,
  nowhere else.

## Tests

Don't overtest; the suite is already near the point of bloat. Before adding a test:

- Test behavior that would break silently and isn't covered yet. One test per behavior, and
  extend an existing test or fixture before writing a new one.
- Skip tests for copy, styling, constants, and one-line wiring; check those by running the app.
- Measurement, load, and screenshot scripts are throwaway: keep them in the scratchpad, report
  their numbers in the PR, and don't commit them.
- If a change seems to need many new tests, the change is probably too big.

## Comments

Comments are welcome; the rule is about who they're written for. Write them for someone reading
the code cold, long after the conversation or PR that produced it: say what a function, constant or
block is and why it has to be that way (`// The middle of a node and everything under it, in world
space` is the kind to keep). Don't narrate the change or answer the request that prompted it.

- No history or contrast with the old behavior: "now", "instead of", "rather than just", "no longer",
  "used to", "on purpose", "as requested". That belongs in the commit message and PR description.
- Comment what the code can't say itself: units, invariants, constraints, and the reason behind a
  non-obvious choice. Skip comments that restate the line below them.

## Client loading

Weigh performance in every change, and put the player's experience first. Loading less is only
a win where nobody can tell: a line that goes missing, a sound that comes in late enough to be
heard as late, or anything that pops in where the player is looking costs more than the kilobytes
it saved. So fetch ahead, not at the last moment: send for a thing as soon as it becomes likely
(a look's lines when it's first seen worn, the next region before it's in view), keep on the
path everyone pays what has to be there the instant it's wanted, and when a saving and a smooth
experience pull apart, take the smooth one and tell Kathir what it costs.

What a client fetches without the player asking for it, every player pays for, on a phone's
connection and memory as much as a desktop's. Joining the world today fetches about 1.25 MB of code
(gzipped), 7 MB of assets and 0.9 MB of sounds. Know which of these a change adds to, and keep
anything that can wait off the path everyone pays:

- Code is one chunk (1.15 MB gzipped), mostly the engine. A dynamic `import()` takes something out
  of it, as every look's model is (below).
- Anything heavy that stands somewhere (a model's parts, a region's meshes) registers with
  `render/Loader.ts` and arrives nearest first. What's inside a building (the pineapple's rooms,
  about 1.3 MB; a storey's pictures) is fetched only once it's wanted: within 25 m, or seen through
  an open door within 125 m, 560 m scoped, and let go again once it's 200 m off and neither seen
  nor wanted for 30 s (`render/Interiors.ts`).
- A look's files (its model, 15 to 60 KB of code on foot and 260 to 300 KB a dragon, and its
  atlases, about 100 KB on foot and 600 KB a dragon) are fetched the first time someone is seen
  wearing it, as a skin's command is pointed at or sent, or as it's picked on the home screen
  (`LOOKS` and `wantLook` in `render/avatars/index.ts`), so a look's cost is paid only by the
  clients that meet it. Until a look on foot is here the player keeps the body they had, or has none
  drawn (where that was a dragon, or for someone first seen in it), never a look they aren't
  wearing; a dragon rises and roars at once and its body fills in as it lands.
- A kart's files (its model's parts and pictures, about 110 KB for the Standard Kart) are fetched
  as its command is pointed at or sent, or else the first time a kart of that model is drawn
  (`wantKart` in `render/vehicles/KartMesh.ts`); every livery is the same picture painted on the
  client, and only its emblem (about 5 KB) is fetched per livery. Nothing of a kart is drawn until
  its files are here, and a fetch that fails is tried again by the next frame that wants it
  (`render/fetchOnce.ts`, as a look's is).
- Lakitu's files (his body with his rod, his hook and their picture, about 80 KB) are fetched the
  first time a driver is seen stranded within `SCOPED_SIGHT`, two seconds before he comes
  (`wantLakitu` in `render/lakitu/Lakitu.ts`). A rescue never waits on them: until they're here
  the kart is hoisted and set down with nobody holding it.
- A sound is fetched by everyone up front unless it's `lazy` in `SOUNDS` (`Sfx.soon`, `Sfx.want`).
  Every look's voice is lazy: an intro is fetched as it's said within earshot, and a look's jumps,
  long jumps, hurts and kills (with its death and its theme for its own player) as it's first seen worn
  (`Game.wantVoice`); a jump not here yet is the swoosh.

Fetch on demand whatever only some players will see or hear, so long as it can arrive a moment
late, and say what stands in until it arrives and if it never does (a `lazy` sound late is left
out; nothing may wait on a fetch to work). In the PR, give what a change adds up front, in files
and KB, and why it can't wait.

Flag it to Kathir, before building on it, when a change adds more than about 100 KB up front, or
when something paid by everyone grows with each thing added. That pattern is the one that gets out
of hand, and the fix is to fetch each thing the first time someone meets it, as a look's body and
voice are.

A model is only as detailed as it's seen. A rip or a Sketchfab model comes with what its own game
or scene needed, so its script simplifies it to what reads at the size and distance it's drawn
here: thin its meshes (decimate, or rebuild what doesn't thin, as `krusty-krab-model.py` does),
drop whatever is too small to see at that size, and scale its textures down to the pixels it
covers on screen. Look at it beside the source from the distances it's seen at, and give the
triangles and KB before and after in the PR.

An interior is let go past 200 m once it's been neither seen nor wanted for 30 s, well past
`SIGHT` (125 m) where it's wanted unscoped, so walking back and forth across one line can't load
and unload it over and over; coming back fetches it again from the browser's cache, through the
loader's budget, and one part is begun or let go a frame at most, so neither costs a frame.

Everything else heavy that stands somewhere streams by distance through the loader
(`render/Loader.ts`): a chunk of the ground's slab, a region's structure meshes, a model's parts
outside. Each is wanted within `REACH` (600 m) of the player, nearest first, and let go past 700 m
(`SLACK` further out, so walking back and forth across one line can't load and unload it over and
over), one a frame at most, coming back through the loader's budget as it comes back within reach:
built again from the content for a slab chunk or a region, fetched again from the browser's cache
for a model's part. 600 m is past `SCOPED_SIGHT`, so a scope never sees anything go. A landmark
drawn from a model (the pineapple, the Krusty Krab) has a shell (`render/models/Models.ts`): a mesh
of a few thousand triangles in its own colours, made at once from the shape the content already
has and kept for good, that keeps its outline against the sky wherever its parts aren't all here,
and they're drawn only once every one of them is, all at once in the shell's place, so the two
never overlap. Everything else that's too far to be loaded still stands against the sky, as the
skyline (`render/Skyline.ts`): the world's whole shape in the fog's colour, the floor's slab part
by part, the roads' risen lengths and every built piece 8 m or more some way, made from the
content with no texture, a mesh to each 960 m square (`TILE`), through the loader with a reach of
its own (`SKYLINE_REACH`, 2,400 m, about where a deck is down to a pixel; today's whole world is
4 tiles, 25,400 triangles and 0.9 MB, built in about 40 ms across the loader's frames, and however big
the world grows only the tiles within that reach are kept). Each of its shapes stands 0.3 m inside
the real thing, which covers it wherever that's loaded, and anything far enough off to be let go is
all fog, the skyline's own colour, so nothing shows where one takes over from the other (the floor
too: its shader fades it, its kerb and its risen roads to the fog's colour, and the ground past
the edge to a grey haze a little lighter, which the sky takes up at the horizon,
`render/shaders.ts`, so far off the world is one dark shape lying on ground that reads as ground). A new
landmark of structures is in it with nothing to do. With its roads the world is about 1,250 m by 1,000 m, the buildings toward its east: from them
everything east of the west island is within reach, and the roads' far west (the west island, the
world's end, the lookouts) is let go and comes back as it's driven toward, as the buildings are
from out there.

The distances that decide what's fetched, drawn and let go are one system, and each is set
against the others, scoped and unscoped alike. Whenever one changes or a new one is added, audit
it against all of them for an order that would read as wrong in play (rooms fetched inside a
shell, something let go while it's still in view, a fetch and a let-go on either side of one
line, a door the scope shows clearly with nothing behind it) and say in the PR how each clash
was settled. As they stand:

| Distance | Unscoped | Scoped | What it decides |
| --- | --- | --- | --- |
| `NEAR` | 25 m | 25 m | an interior wanted whatever's in view |
| `SIGHT`, `SCOPED_SIGHT` | 125 m | 560 m | the fog nine tenths thick (`BASE_FOG_DENSITY` and `SCOPED_FOG_SCALE` are worked out from them); an interior wanted through an open opening in view (scoped, within the scope's circle and a little round it) |
| `CRISP_RANGE` | 45 m | 45 m | a wall frame's picture drawn crisp rather than as a texture |
| `LET_GO`, `FORGET` | 200 m, 30 s | same | an interior let go, neither seen nor wanted for `FORGET`; past every unscoped fetch, so no line flaps |
| `REACH`, `SLACK` (`Loader.ts`) | 600 m, 700 m | same | what stands somewhere (a slab chunk, a region, a model's parts) wanted, and let go; past where a scope sees, so nothing is seen go and no rooms inside a shell are seen |
| `SKYLINE_REACH` (`Skyline.ts`) | 2,400 m | same | a tile of the skyline kept (let go `SLACK` further out): what's past `REACH` is still seen, as its outline in the fog's colour; `REACH` is twice past where the fog is whole, so the outline and the thing itself are one colour wherever one gives way to the other |

Known and accepted: an interior a scope fetched past 200 m is let go 30 s after it's last seen and
fetched again from the browser's cache if it's scoped again. `SIGHT` and `SCOPED_SIGHT`
(`sim/constants.ts`) are the one measure of how far anyone sees; anything new that reaches as far as
the eye does reads them rather than keeping its own.

## World geometry

Buildings, walls, platforms, ramps and terrain are structures: plain data listed in
`packages/shared/src/content/structures.ts`, with kinds and authoring helpers (`wall`, `ramp`,
`stairs`, `building`, `terrain`, and the round pieces `roundWall`, `spiralStairs`, `roundFloor`) in
`packages/shared/src/sim/structures.ts`. The sim collides with them through
`sim/collision.ts` (standing, walls, ceilings, line of sight) and the client draws the same list
(`render/Structures.ts`), so adding an entry is the whole job. Nothing about structures goes over the
wire: server and client both build the world from that file.

### Adding structures

- Use the helpers rather than hand-computing yaw and centres: `wall(a, b, h)` runs between two floor
  points, `ramp(low, high, h, w)` rises from `low` to `high`, `ladder(foot, y, top, yaw)` stands a
  ladder on `foot` up to `top` (see Ladders below), `stairs(bottom, top, h, w)` is solid
  steps players walk up without jumping (the camera eases over each; with `thickness` and `rail`,
  a railed flight in the air, like the staircases up to the terrace), `building({...})` is four
  walls, a doorway and a roof, and `terrain({ height })` samples a function. The round pieces:
  `roundWall` (straight segments at any base height, with gaps for doors and windows), `spiralStairs`
  (with an optional inner rail so players can't step off the inside) and `roundFloor` (gap-free rings,
  with an optional hole for a stair coming up from below, ending exactly where the stair does, and
  with `inner` only the ring outside it, for a balcony or a roof open in the middle). Write raw `{ kind: 'box', ... }` only for simple platforms
  and pillars.
- A landmark gets its own content file exporting its list (Tung Tung Tower is `content/tower.ts`,
  `TUNG_TUNG_TOWER`), with its dimensions as named constants at the top and a comment per group of
  pieces; `content/structures.ts` just spreads the landmarks together. Tung Tung Tower and Buildings
  2 to 4 (`content/buildings.ts`) are all one round keep (`content/keep.ts`): a layout of four
  floors (each one's doors and where its flight starts), stacked from the ground and turned to face
  the way in. The tower stacks all four and a building stands one of them alone (Building 2, the
  Welcome Building, the ground floor with the Spotify widget; Building 3, the Anime Building, the first
  with the anime list; each named in `BUILDING_NAMES` by its floor), so a floor is the same room in both, stair and murals alike;
  change a floor there and both follow. Building 4 stands a bare keep until it gets a structure of
  its own.
  Building 1 is SpongeBob's house (`content/pineapple.ts`), two models the client draws (see Models
  below) on a dune of sand: the pineapple outside and, behind a door you click, the rooms of the
  game inside (living room, closet, kitchen, bathroom, the bedroom upstairs, the library on top; the
  living room's side door, painted shut in the model, is dug through to the dune), joined by a stair
  of the sim's round the back of the house (out of the kitchen's back door, clear of the shell with
  rails both sides, up to a balcony at the hall's door); upstairs a corridor runs from that door
  along the bedroom and round the bathroom, walled off from the rest of the hall, the ground
  floor's closet and bathroom are copied off the bedroom, and a straight stair of solid steps
  climbs from the corridor's end through the hall's ceiling to a hole in the library's floor, open
  along the corridor and walled both sides and roofed over from where the corridor's wall meets it
  (`house_interior.py` lays it out, the sim stands its steps); high in the library's wall a round
  hatch opens onto a railed platform, with a slide curving down from it along the wall to the floor,
  as the show has them (the generator cuts the wall, builds the tube, the door, the platform and the
  slide's trough, and gives the sim the slide as ramps);
  through it a brick lobby outside the wall, where a flight winds up each way to a gallery round
  the plastered cylinder standing on the library's ceiling, with doorways into it, and inside the
  attic stair spirals up through the crown to a railed deck on top (`content/pineapple.ts` stands
  all of that from the profile, in the hollow top of the shell);
  the sim collides with boxes cut from every surface of the rooms, hidden rings for the shell,
  walls along the flat faces carved round its doors, and the path's flagstones as ramps lying with
  the dune.
  The Krusty Krab (`content/krustyKrab.ts`) stands on grounds of its own across the main disc
  from the tower, between Buildings 2 and 3, its door facing the middle: a model the client draws
  (see Models below), a barrel of timber between two arches, 36 m long, 24 m deep and 18 m tall,
  glazed along the front, with a double glass door that swings as one; inside, the dining room
  (tables and barrels to stand on, the cashier's boat) in front of the kitchen, a solid block with
  a loft on top. Its size is one rule: Squidward, standing in the boat, has the top of his head a
  third of the way up the order window. To the sim it is the boxes and wedges of its profile
  (`content/krustyKrabProfile.ts`), all hidden.
  The terrace (`content/terrace.ts`) is reached from the keeps:
  the tower's sky bridge, and a staircase from each keep's roof. A piece you'll reuse (a
  staircase, a round wall) is a function returning `Structure[]` in `sim/structures.ts`.
- Coordinates are world metres, yaw 0 facing +z. The playable outline is `WORLD_OUTLINE` in
  `sim/outline.ts`, the ground (`WORLD_GROUND`, `sim/ground.ts`) that every part of the game asks
  where the floor ends, through `Structures.ground` in the sim: its parts indexed by `CHUNK` (48 m)
  square, so a question about a spot looks only at the parts near it. Its parts: the main disc (r 50 at the origin), the annex
  (r 30 at x 112) and the bridge between them (16 m wide), the four buildings' grounds (discs the
  annex's size round the main disc at 70°, 125°, 235° and 290°, the keeps' 100 m out and SpongeBob's house's further out, at 124 m, on much wider grounds, r 52, so its dune and the sand round it sits on
  the floor with room round it), the Krusty Krab's grounds between Buildings 2 and 3 (r 32 at 180°,
  100 m out, so the five sites are 55° apart), a road 20 m wide straight out from behind it, 200 m
  past its grounds, to a plateau r 40 at its end, the crossroads the roads beyond meet at (`KRUSTY_KRAB_ROAD`, `ROAD_PLATEAU`), the islands
  and roads out past them all (`ISLANDS`, `ROADS`, see Roads below), and the fan
  between the buildings, a slice of the main
  disc's middle out to the keeps' from the first building's bearing round to the last's, its two
  straight sides held 10 m out, parallel to those bearings, by a strip of floor along each (`FAN_SIDES`),
  so the bridge to the tower is the only corridor and everything between the buildings is open floor. A part is a disc,
  a straight `bridge` (its ends round, or `square`: cut straight across), a `bend` (a corridor round
  an arc, its ends square) or a pie-slice `sector`. The ground is a solid slab: its top the floor, its
  sides a drop of `OUTSIDE_HEIGHT` (10 m) to the ground past the edge, all three of them solid to
  bodies and to rays (`Structures` stands bodies on it, holds a body below the floor off the drop's
  face as a wall, and stops shots and sprays on it). Nothing keeps a walker on the floor: one walks
  off the edge, falls down the drop, and for every half second (`OUT_OF_BOUNDS_SECONDS`) it stands
  on the grey ground past it (`onOutsideGround`) loses a heart, time to jetpack out, or dies there
  (an `out`, `room.ts` `outOfBounds`), its heart dropped where it lies as anywhere; the red box
  (`ui/Alert.ts`) tells a walker stood there they're out of bounds. Nothing bounds the world
  past that: a dragon or a jetpack can go as far out as it likes, over ground past the edge that
  follows the camera (`render/Environment.ts`), and a kart is fished back by Lakitu. Keep
  structures inside the outline.
  The slab is drawn a `CHUNK` at a time (`render/Floor.ts`, one mesh each, streamed in by the
  loader): its floor, and along its edge a bold kerb (`KERB_WIDTH` across inside it, `KERB_HEIGHT`
  up, its top lit) whose outer face drops to the ground past the edge, with a toe as bold along its
  foot (both rims of the drop lit grey, the kerb's top green, so the border reads from the drop
  too), `OUTSIDE_HEIGHT` (10 m) down, so where the floor ends reads from afar. Each chunk's edge is
  traced from the ground's distance to it, sampled every metre on one grid for the whole world, so
  neighbouring chunks meet without a seam and nothing about the outline reaches a shader. The ground
  past the edge is one plane under everything (`render/Environment.ts`). The grid carries on down
  the drop, each face gridded across the two axes its normal lies furthest from
  (`surfaceGridLine`, so one family of lines runs over any surface, terrain included). The floor
  ends under the kerb, so every edge in sight is real geometry rather than a shader's cut. The kerb is only drawn:
  the sim's floor is flat to the edge, and a foot sinks its 8 cm into it unseen. A dragon can fly
  down into the drop, where the floor's rim is a wall it climbs before coming back in
  (`dragon.ts`), and a walker it turns back into there, or anywhere out over the void, falls where
  it is. The camera follows it down. The bots' ground map stands its nodes a metre inside the edge, and
  the circle bot, which strafes rather than following that map (it never loads it), asks the
  solids for ground ahead before it steps and tightens its ring where there's none, turning back
  only where no ring has any.
- Size things to the player: eyes at 1.7 m, head at 2.0 m, radius 0.35 m, steps up to 0.5 m climb on
  their own, and a running jump at the standard jump power lands on tops up to about 1.9 m (make
  anything meant to stop a jump 2.1 m or taller; Sulley's 1.2 rises 1.92 m, and may get over it). Doorways at least 1.2 m wide and 2.2 m tall; ramps no steeper than about 30°;
  walls at least 0.3 m thick.
- A person first comes in in `SPAWN_AREAS` (`content/regions.ts`: the middle of the main disc and
  its side facing the tower), and back from the dead (see Death and respawn) in
  `RESPAWN_AREAS` (half the time the main disc, otherwise the ground floor inside a building), each
  area by its `weight`, standing on its floor (or anything within a step of it) with headroom, so a
  building's ground floor can be a spawn point and roofs, decks and wall tops never are. Info cubes wander the main disc at about 3 m and
  pass through structures, so tall pieces there will have cubes floating through them.
- Seal what players walk on: a floor with gaps drops people through it, and a body stands wherever
  its middle is, so a hair's gap between two tops is a gap (overlap pieces that meet edge to edge,
  as the Krusty Krab's roof boards do). Give each floor a single
  hole where its stair arrives (`roundFloor`'s `hole`), and leave headroom over the flight below it:
  the hole has to cover the stretch where the stair is within about 2.7 m of the floor above.
- Terrain: keep edge heights at 0 so it meets the floor (no side walls are drawn), and keep sample
  grids modest (the default is one sample every 2 m); every sample is a vertex.
- Looks: set `material` to a pixel texture (`brick`, `wood`, `red-tile`, `flagstone`, `sand`,
  `plaster`, `steel`; each is a painter in `packages/client/src/render/structureMaterials.ts`, and a
  new one is another painter there). `color` is a flat fallback. Structures are unlit and shaded by face direction, so
  they look the same inside and out; don't reach for lights. `hidden` pieces are collided with but
  never drawn: the shape of something the client draws its own way.
- Coplanar faces: two faces that overlap in the same plane and point the same way z-fight, and the
  flicker shows wherever they paint different pixels. Structure textures are mapped from the world
  origin, so pieces of one look (with `worldTop` for their tops) paint identical pixels there, which
  is what lets the helpers overlap their joints. A round wall's pieces carry their `ring`, and
  their long sides map round it by arc, so the bricks run on across the joints. Anywhere else (two looks, or tops mapped in each
  piece's frame) keep faces out of one plane: drop one piece a couple of centimetres (a door sill
  under a floor, a stair's landing step, a bridge deck under a balcony, a wall or flight under a
  floor of another look stopping inside its slab) or stand it on the other rather than beside it
  (a stair's rail posts); where pieces of a plank look have to overlap (the deck's sectors), set
  `worldTop: true` on them so their tops map alike. The same goes for anything else the client
  draws: never lay a decal, glow or second mesh exactly on a surface.
- Client cost: the renderer merges pieces with the same look in the same 48 m square into one mesh,
  so draw calls stay in the tens however many pieces there are. The world's 16,024 pieces (5,630
  drawn; the house's rooms and shell are 7,516 hidden pieces, the Krusty Krab 175 and the roads'
  2,703: their risen banks, a block and a wedge to each 4 m of a graded climb, their decks and
  their boost pads) render as
  about 90 meshes (about 15 in view at once; the roads' built ramps are 12 pieces in 9 of them, a
  road's lengths of risen road are one mesh, 1,165 lengths in 20, and its boost pads a mesh of their
  frames and a panel each, 39 pads in 64, and the floor is 299 chunks), and a raycast tries the pieces a stretch of grid cells at a
  time, so one across open floor costs a few µs, one through the Krusty Krab about 10 µs and one
  through the house about 130 µs. The sim's grid has height bands as well as cells, so a walker's
  tick pays only for the pieces at its own height (about 70 µs inside the house, 27 µs inside the
  Krusty Krab). Check both numbers in the PR when a landmark adds a lot.
  Everything heavy is streamed in through `render/Loader.ts` (see Models below).

### Roads

A road (`sim/roads.ts`) is a strip of floor laid through the points it's given: straight from each
to the next, and round a bend at each one between (left without a radius, the two runs just meet,
as they do in the middle of a disc). The floor under a road is flat like all the floor, so its
height is its bank, structures stood on that floor: a wedge under a stretch that climbs or drops, a
block under one that runs level up off the floor, each a `SHOULDER` in from the floor's edge so its
sides rise out of the kerb, or where the stretch is `open` (`span`) a deck `DECK` thick with
nothing under it, not even floor (a deck lays none: under it is the floor of whatever road it
goes over, or the drop), for another road to pass beneath (with `HEADROOM` clear under it, or the
road won't lay; one that climbs is as thick all along, its underside drawn sloping with its top,
and to the sim a run of short wedges, each flat underneath, never more than `STEP` thicker). A bend up off the floor is level: on a bank, or with its run `open` a deck the
same, so a road can go over others the whole sweep of a bend. A stretch of deck can split
(`split(length, Split)`): the road forks into two strands that swing `out` to either side, run on
side by side, the left one climbing and the right one dropping once they're clear of each other,
each eased up and back (`grade`), and come together again at the stretch's end, back at the road's height. Each strand is laid as
part of the road, a road of its own up on the deck at both ends (`RoadSpec.joins`); from the
fork until their inner sides part, and again into the meeting, the two are one level surface,
each `bare` along the side they share (no wall and no kerb's line there, and no line on the
maps), so which strand a kart takes is where it is across the road. For the few metres next to a
split the road and each strand are bare both sides, where a strand's outer side is still inside
the road's own, so no line of one is drawn in the other's surface; and a risen length has a wall
across an end only where that end shows (`Caps`: all of it where the road stops there, under a
deck that carries on from a bank, and none between two lengths that run on into each other), so
none stands edge-on in a surface. Two things drawn in one plane flicker wherever they differ. A bank looks one of two ways: under a padded stretch that climbs it's a ramp built
on the floor, of stone, drawn as the structures it is; anywhere else (a level stretch up off the
floor with a pad lying on it too) it's the floor itself risen,
its pieces `hidden`, and the client draws the road there in the floor's own look
(`render/RaisedGround.ts`, from the road's `raised`, `ROAD_RAISED`, a road's lengths one mesh: the grid carried on up over
what faces up with a bold green line down each side, and walls of the drop's grey face with a bold
line along their top, so a road's border reads all the way over a hill; a bend is drawn round,
whatever blocks its bank is to the sim, and a deck with its underside). A gap is a stretch with neither floor nor bank, to be jumped; `jump(run,
rise, across)` is one with a ramp either side, so it's jumped both ways. A boost pad is a stretch
`padded`: to the sim a sliver of its own shape lying a hair over it, four fifths of the road
across, hidden, whose surface (`boost`) boosts a kart rolling forward over it (see Surfaces and
frost, and Karts); the client draws it (`render/BoostPads.ts`, from the road's `Pad` marks, `ROAD_PADS`) as a panel let into a frame that stands proud of the
road (a road's frames one mesh, and a panel each, since a halo is thinned by how far off its own
mesh is): lanes of rainbow arrowheads pointing up a climb, or along a level stretch the way the road
runs, running that way, with a halo of their colours that swells and falls (`Engine.glow`, which the fog
thins as it thins whatever glows, so nothing far off has a halo). The
frame's rim is only drawn, as the floor's kerb is. A road is authored as runs, each cut into stretches (`level`, `climb`, `gap`, `span`, any of them
`padded`; one with no length takes an even share of what the others leave; `grade(length, rise)` is
a climb that eases in and out, level at both ends, as a run of 4 m lengths along an S, one slope to
the maps: each a length of deck with `'all'`, or with `'clear'`, for a climb between the floor and a
deck, those with `HEADROOM` under them, so the road is a bank only as far up as nothing could pass
beneath), and `layRoad` turns it
into its floor (square bridges and bends, for the outline), its bank with its pads (for
`content/roads.ts`), what of it is the floor risen (`raised`), its `middle` (the line it runs
along with its height, each strand of a split apart, for the bots' roads map) and its marks, each
with the height of its top (for the maps, which draw each slope as arrowheads pointing up it, each pad as a
rainbow and each deck over the road that passes under it; `content/landmarks.ts` lists them from
the highest down and the maps lay them in that order, each under the last, so a deck covers
whatever lies on the road beneath it and what lies on the deck shows on it). It throws on a road that can't be laid: stretches that don't fill their
run, a bend too tight, an end left up off the floor.

The world's roads and islands are in `sim/outline.ts` (`ROADS`, `ISLANDS`), every road 20 m across
(`ROAD_WIDTH`), room to drift a bend on: 25 roads, 10 km of them (2 km of that deck), mostly west of the buildings.
One main circuit (`CIRCUIT`) runs round the west of the world, from Building 2's grounds by the
north, northwest, west, southwest and south islands to Building 3's, closing across the floor
between the keeps: a lap of about 2.5 km. Every road but the Krusty Krab's and three short
straights with a jump is wound (`wound` in `outline.ts`): a list of `Turn`s, each a bend with where
it stands (a spot, or how far along and off the straight way between its two discs), its
radius, and the height it's level at, with the straights between easing from one height to the
next (`grade`), so no climb of it is a flat ramp; a turn can carry a boost pad round it, and a
level straight a jump, a pad or a split in its middle (`carries`). No two roads wind alike, and a
new one should be another kind again. The circuit's: two wide sweepers, low; a climb to a plateau
20 m up, held through two wide bends, and a plunge off it; six quick chicanes along a level
causeway; a double dip, 15 m, down to 3 and up to 17; a straight on the floor with a jump into a
right-angle bend and a climb round the next; a long climb to a hairpin and a flick down. A wound
road throws where a straight is too short for its climb (the steepest of a graded climb is half
again its mean, kept to 0.4), which says what to change. Inside it a web (`WEB`): the Krusty Krab's road itself,
laid over the floor the home has there for the pad on it, and carried
on west from the crossroads at its end to the west island, a spoke from the crossroads to each of
the northwest and southwest islands, and an inner ring from the north island by two small islands
to the south one. Those wind low where a deck goes over them and climb where none does: the west
road an S that rises to 7 m once the flyover is behind it, the northwest spoke an S that passes
under the high road three times, the southwest spoke three sweepers over a hill 14 m up, the
ring's roads a bend or two each. Over them go three roads up on decks, a triangle between the west
island and the ring's two small ones, each a wound road `decked`: its first straight a ramp up
from just clear of the island it leaves, its last a ramp down to the one it reaches, each a bank
only until there's `HEADROOM` under it, and deck all between, round every bend. A deck has no
floor of its own under it, so an overpass is over the roads it crosses and otherwise over the
drop. Along one long straight each splits in two, as Rainbow Road does (`SPLIT`): the strands
part, run side by side 14 m apart, the left one climbing 3.6 m and the right one dropping as far,
with a pad each, and come together again, so the two are at heights that change against each
other, and a kart off the high one's inner side at speed comes down on the low one. The flyover
(13 m up, 17 at its top) is an S over the world's long straight, the west road and the Krusty
Krab's: up from the west island beside the west road, north over it at a slant, split, over the
west road's own S; round over the crossroads' north side and the roads into it; south again over
the Krusty Krab's road, dropping, and through a kink down to the south small island. The high
road goes from the west island round to the east, splits along its straight, 13 m up, turns north
over the northwest spoke and climbs to a hairpin 22 m up, the world's highest road, and comes
down to the north small island from the northwest, the spoke winding under its loop. The skyway,
12 m up, goes from one small island to the other east of the flyover's way in, split down its
straight, its strands over the Krusty Krab's road.
Outside it (`REACHES`) a road out to a small island at each of three corners of the world: the
world's end and two lookouts. Round the east (`EAST`) goes one road, from the north island by the
east island to the south, with a way out to it from the tower, from SpongeBob's house and from
Building 4, each of those an S or a run of sweepers over hills; the south road straightens onto
the floor before Building 4's road meets it. The big islands (r 36 to 44) are each a site for a
building to come, the small ones (the inner ring's and the ends of the reaches) places to pull
off. `HOME_OUTLINE` is the floor without them, where people mostly are, which the sky's objects
float round. A walker can't cross a gap: the south lookout, past one, is a kart's alone, and
everywhere else is reached on foot some way round. A deck is walked like any floor, with the
drop either side of it.

Size a road to the karts (see Karts): a ramp no steeper than about 0.4 (a kart rolls up what's
within a kerb's height each quarter of its width), a gap the Standard Kart clears well short of
its top speed (`JUMP` is cleared from 16 m/s of its 20, and flat out it lands at the far ramp's
foot) with a pad on the ramp either side of it (`hop`), so a kart that rolls onto one however
slowly leaves the lip boosted, about 1.4 s in the air, time for a trick, and comes down some 20 m
past the far ramp's foot (so keep 50 m of straight road past a jump; a `kicker` is a hill as
steep with a pad up each side, flown off the same with floor under the whole flight), a bend no
tighter than about 22 m along its middle (a kart's own circle is 15 m; the high road's hairpin is
24), and where one road crosses another between islands, a deck over it (a `decked` wound road; a
bend doesn't climb, so a deck's ups and downs are on its straights, eased). A wound road's pad
lies halfway round a bend a boosted kart holds: never on a hairpin or a tight bend up on a deck,
where a boost throws it off. What passes under a deck is kept low there, with `HEADROOM` clear
over it at the least and no lip a kart could fly off up into the deck; check the room under every
deck's marks, and that no bank stands on another road's floor, in a scratch script after moving
either.
A slope's top a sixth or more steeper than what
follows is left in the air at a kart's speed (`LIFT` in `kart.ts`), so a hill with a sharp top is
flown off and a gentle ridge, or a graded climb, isn't. After changing one, drive every road both ways
with `stepKart` in a scratch script, flat out and boosted, and check nothing is hit and no landing
costs a wrench.

### Ladders

A ladder (`sim/structures.ts` `ladder(foot, y, top, yaw, { material, width, girth, lean, hidden })`, kind
`ladder`) is a frame of two rails and rungs, `LADDER_WIDTH` across unless given a width, and
`LADDER_GIRTH` through unless given a girth (its rails drawn as stout as it; the keeps' and the
tower's are `WALL_LADDER`, half again both), climbed from either of its faces (its local ±z); to everything else it is
a thin box, and it never frosts. With a `lean` (radians from upright, `MAX_LADDER_LEAN`, 45°, at
most, further over being a ramp with rungs) its top is over toward its local +z, as a ladder stood
against a wall there leans: the climb keeps to the rails (the climber's speed
along them, the body moving over as it rises, the face it reaches for and the spot it swaps to at
its feet's height, the step over the top where the top is), the avatar leans with it, and the
drawn frame tips over; a jump is still straight up, and gravity still straight down. Where it leans
it is the wedge under its rails to everyone else (a ramp over its footprint, in the sim and the
bots' map), so a body never fits under it: lean one against something, and only the face it leans
away from is climbed. A walker holding forward (W) within
`LADDER_REACH` of a face, between the rails, facing it, takes hold (`walker.ts` `takeHold`,
`PlayerState.climb`: the piece and the face, ±1) and climbs at `CLIMB_SHARE` of its walk on W and S, nothing
pulling it down; one holding back (S) beside a ladder's top (its feet up to `OVER_TOP` under it, so
from the floor beyond a rail it tops out at), looking away, backs onto it by its far face a body's
height down it (so the first steps up don't step it straight back over), to climb down: holding up at the top steps it over onto whatever is beyond the ladder there (so
the library's ladder, against the hatch platform's rail, tops out at the rail's top and lands you
on the rail), holding down at the foot, or onto anything under the feet, steps it off, a jump is
straight up and off (hold forward on the way down to take hold again), and A or D (the `swap-left`
and `swap-right` actions; the touch SWAP button is A's) goes round to the other face by the
ladder's left or its right, where a body fits there (where it doesn't, a rail at the top say,
taking hold from that side goes through to the face with room); `climb.way` keeps which way, for
the swing. Fitting is the whole body, its width and all (`Structures.fits` with the body's
radius), and the climb itself goes only as far as the body fits, so a face under a floor is climbed
only up to the floor's underside and no swap goes through a rail standing against the ladder.
Weapons work as on the ground. The look is client-authoritative, so the client holds it within a
quarter turn of facing the ladder while climbing and turns it round with a swap (`Game.holdLook`),
the camera swinging after it; every avatar on foot squares up to the rungs, steps them with
whatever legs it has and reaches up with its free hand, points its weapon arm where the look goes,
and swings half a turn round the ladder on a swap (`render/avatars/Walker.ts`). Its limbs are placed
by how far up the ladder its feet are, never by time (`holding`): each stays on its rung while the
body climbs past it, then goes up to the rung two above, a hand and then the foot across from it,
so they run backward on the way down and hold still when it stops. Bots' map treats a
ladder as a wall.
Two ladders stand in the house (`content/pineapple.ts`): the library's, upright from the floor to
the hatch's platform, since the slide is no way up, and the bedroom's, up the end of SpongeBob's
bunk to the top bunk. A ladder a model draws, like the bunk's, is a `hidden` one stood on the
model's rails with their lean, and the rooms' boxes cut from its rails and rungs are left out
where a climber's body goes (up its face and over its top), since they were cut a cell round them.

The foghorn alarm clock by that bunk is an easter egg: a click with the look on it within reach
(`PINEAPPLE_HORN`, a box measured off the model, in `content/pineapple.ts`; `Game.hornAt`) plays
the boat horn, for the player who clicked alone. Nothing of it reaches the Room.

### Surfaces and frost

A structure's `material` is its look; its `surface` (`sim/surfaces.ts`) is what it's like underfoot:
`hard`, `sand`, `ice` or `boost`, named on the piece (a boost pad's is) or implied by its material
(`MATERIAL_SURFACES`: sand is sand, everything else hard; the bare floor is hard). A
`SurfaceSpec` is its `grip` (m/s², how fast the feet can change the walk's velocity; `Infinity` is a
sure footing, where the walk goes exactly where the keys send it, as every surface did before), its
`footfall` (what a step on it sounds like: `thud` or `crunch`) and whether it `boosts` a kart on it
(a boost pad, hard to a walker; frosted over it's ice like any top, and boosts nothing). On a footing with finite grip the walker keeps its momentum
(`PlayerState.vx`, `vz`): the feet push toward the keys at the grip, never past the walk's speed,
slow it at that rate with none held, and gravity pulls it down any slope harder than they can hold
(`walker.ts` `slide`, capped at `SLIDE_SPEED`), so an icy 15° slope can't be climbed and the
library's slide is ridden. The keys steer the walk in the air as on the ground, unless it was
thrown (`PlayerState.thrown`, `walker.ts` `throwWalker`): a throw joins a velocity to the walk's
and, until it lands, leaves the keys only the throw's grip to bend the flight with. Ice throws:
it pushes back only square to itself, so a jump off it goes along the ice's normal (straight up
on the flat, partly downhill on a slope) with what the walk had, stepping off it is a throw too,
and both leave the keys the ice's grip, so a hop up a steep icy slope is thrown back down while a
shallow one can be hopped up. A weapon's knockback or a bounce is a `throwWalker` call with the
grip it leaves. A jetpack's thrust is something to push against, so it steers through any throw. `Structures.footing(x, z, reach)` is the ground, its piece, its surface
and its slope at a spot, and the client's `Footsteps` asks it at each footfall for the sound
(`FOOTFALLS` there maps a footfall to its recordings; a gait with sounds of its own keeps them).
The legs, footsteps and head bob are paced by `PlayerState.walk`, how fast the feet walk: the
keys' walk on a slippery footing (feet scrabbling on ice at full pace while the body crawls, and
standing still while it slides), the body's own anywhere else (none against a wall).
A new surface is a row in `SURFACES`, and with a new footfall, its sounds in the client. On a
slippery footing a tick the server runs without a frame (one arriving late) moves the walk too,
so `correction` can show a tick's worth of slide there; on a sure footing it stays 0.

Frost (`sim/frost.ts`) is ice laid over surfaces by an ice spray and melted by fire, kept by the
Room like the doors (`Structures.frost`, its own per room) and sent to every client (`welcome.frost`,
then `frost` messages with the cells that turned). It lies in `FROST_CELL` squares on a grid from
the corner of each face of a piece (its top, underside and four sides, numbered 0 to 5; the floor
from the origin, as piece `FLOOR`), a cell on the wire as `[piece, face, i, j]`. A frosted top is ice
underfoot whatever the piece is made of, under the spot or under any of the body's width round it,
so a hole smaller than a body doesn't catch a slide, and on whichever of the pieces whose tops meet
in one plane there the spray landed on (the house's hidden floor boxes lie in the dune's sand). On every shot of a hold weapon with an
element the Room casts `sprayFrost`: a dozen rays spread over the cone (a low-discrepancy sequence,
each shot's between the last ones'), each landing (`Structures.touch`, which says which face)
turning the cells under its blot on that face (`Blot`: `SPLAT` across at the least, `SPREAD` of
the spray's width where it lands, and drawn out along the ray where it meets the face at a glancing
angle, as a spray skimming the floor does), so a shot or two frosts the patch in front of you
solid and a level spray lays a long tongue along the ground. Doors never frost (they swing); hidden
pieces do, so the house's rooms frost where the model draws them. Frost never thaws by itself; past
`MAX_FROST` cells the oldest melt. The client draws every cell as a crust a hair off its face
(`render/Frost.ts`, from `frostQuad`, merged by region like the structures and rebuilt the frame
after a change): a translucent glaze with crystals that glint and twinkle, the surface showing
through it, pulled toward the eye in depth (`zOffset`) so a far-off floor's depth, coarse across a
big triangle, can't swallow a crust a hair over it.

### Models and doors

A landmark too shapely for boxes is a model: a mesh the client draws from files in
`packages/client/public/assets/models/<model>/`, its meshes and textures together, written by a
script in `packages/client/scripts/` (`house-model.py` makes the pineapple from two Sketchfab
GLBs: the outside turned afresh as a smooth lathe through one model's rings, flattened into an
upright face round each door, with a steel vestibule behind the front doorway and its door a flat
slab on a pin at its edge; and inside, the other model's rooms at half scale, in their own textures packed
into one atlas, with the hall round the bedroom and the stairwell up into the library built to join
them, `house_interior.py`; both written out mirrored in x, glTF's frame being right-handed and
Babylon's left-handed) along with a profile of its shape for the sim (`content/pineappleProfile.ts`:
the shell's rings, the levels, the stairs and every door) and the boxes the rooms are cut into on a
quarter-metre grid (`content/pineappleInterior.ts`, floors, walls and furniture alike). The sim never
sees a mesh: the content stands those as `hidden` structures (`content/pineapple.ts`, with rings for
the solid shell round the rooms) and the renderer skips them, so what you bump into is the
generator's to keep true to the models. `render/models/Models.ts` fetches each part listed in
`render/models/pineappleParts.ts` (generated too) and hangs it where the content's placement says,
a door's on a node at its pin. The rooms are written a part per floor (`interior-ground`,
`-upstairs`, `-library`, each triangle the floor's whose storey its middle is in), and each inside
part carries its `floor` (see Interiors below); the profile's `doorways` through the shell name the
door each holds.

`krusty-krab-model.py` makes the Krusty Krab from one Sketchfab GLB of 4.2 million triangles (176
MB) by rebuilding rather than thinning it, since the model's bevelled meshes don't thin: anything
cut from a board (the roof's staves, the arches, the plinth, the kitchen's doors, the rope nets,
the flags) is its silhouette traced and pushed through again (`prism`), anything convex (crates,
barrels, rivets, the chimney) the hull of its outermost points (`hull`), and the boat a hull lofted
through its outline at each plank's edge (`boat`); what's too small to see is dropped (the floor's
nails, the rivets round the doors), and the bolts along the kitchen wall's plates are kept as their
heads alone, a square each. The timber gets plank textures painted in the script and wrapped over
it in metres, and everything else a plain colour from one small atlas (the model's own colours,
but the kitchen's wall darker and greyer, as steel), which also carries the menu and the ORDER HERE
sign. It comes to about 9,300 triangles and 260 KB in nine parts, all lit like the pineapple's
outside, and a profile (`content/krustyKrabProfile.ts`) of 167 boxes, the roof's
four leaning staves as ramps (each run on a few centimetres into its neighbours, so no seam is left
between them to drop through), and the door's two leaves. A model's parts list is all `Models.ts`
needs of it, with its shell: a new model is a script, its files, and a row in `MODELS` there,
whose `shell` is its outline in a few thousand triangles or fewer, built from what the content
already has (the pineapple's profile turned on a lathe, the Krusty Krab's hidden boxes and
wedges), in its own colours, in its vertices.

Nothing is fetched at startup. `render/Loader.ts` streams the world in: anything heavy that stands
somewhere (a region's structure meshes to build, a chunk of the ground's slab, a model part to
fetch) registers with where it is,
and the nearest things not yet begun are begun first, so the player is in the world at once and it
fills in round them nearest first, the far side within a second or two. Within `REACH` (600 m)
nothing outside waits on distance (a scope sees the far side as sharp as the near) and the loader
only sets the order; past it, things are let go and wait to come back within reach (see Client
loading). What's inside a building waits until it's wanted (see Interiors). No frame waits on loading: each thing's
load is a job, a generator that yields between pieces of its work (a region yields after every
piece it places) or yields a fetch to wait on (`yield* wait(promise)`), and each frame the loader
steps the jobs that are ready only until `BUDGET_MS` of it is spent, the rest carrying on the next.
A region is built as plain vertex data (`VertexData`, each piece placed where it stands and all of
them joined) and only then made one mesh, so nothing is made and thrown away per piece. Register a
new model or any big build with the loader as a job that yields, rather than loading it in the
constructor or in one go.

A door (`sim/doors.ts`) is a slab on a hinge, shut or swung open, kept by the Room for everyone:
`doorPieces` makes its two hidden structures (where it stands shut, where it stands open), each
marked with the door and its state, and `Structures.setDoor` turns them on and off, so collision
and line of sight follow the door and prediction agrees. A click on a door within `DOOR_REACH`
sends `InputFrame.use`; the Room checks the look reaches that door, swings it, and broadcasts
`door`, which clients apply to their `WORLD_STRUCTURES` and to the model's door node (the swing
plays over `DOOR_SWING_SECONDS`). Bots' map walks as if every door stood open and lists each
door's slab; a bot's way keeps out of doorways unless it opens doors (the sniper), whose route
stops at a shut one in its way, turns to it and sends the same `use`. A Room keeps its own `Structures` for this; the client's `WORLD_STRUCTURES` is its page's.
A ghost (see Game modes) swings no door and walks through any, shut or open: its step is taken with
no door's pieces standing (`Structures.throughDoors`, in `stepPlayer`).

### Interiors

What's inside a building that only its openings show is an interior (`sim/interiors.ts`): a
floor of the pineapple's rooms, or a storey of a keep (the tower's four, a building's one). A
building lists its own (`InteriorBuilding`, gathered in `content/interiors.ts`): the upright
cylinder a camera is inside it within, and each interior's openings (a flat rectangle facing out:
`wallOpening` for a gap in a round wall, `roofOpening` for a hole facing up, each reaching
`MARGIN` past the gap, with the sim door that shuts it, if one does) and the others it `shows`
through it (a stair's hole, a net ceiling). The client (`render/Interiors.ts`) loads an interior
while it's wanted, draws it only while it could be seen, and lets it go once it's far off and long
out of mind. Seen: all of a building's from
inside it, and from outside, one with an opening in view, the camera on its outer side and its door
open or swinging, with what it shows; once loaded, seeing waits on no distance. Wanted:
from inside its building or within `NEAR` (25 m) of its round whatever's in view, so a door swung
open in front of you shows rooms already there, and while it's seen through an opening within
`SIGHT` (125 m, where a doorway is all but fog), `SCOPED_SIGHT` (560 m) through a scope. Let go:
loaded, more than `LET_GO` (200 m) from its building, and neither seen nor wanted for `FORGET` (30
s). Whatever is part of one registers with `Interiors.add`, with a `load` begun whenever it's
wanted and not here and an `unload` that lets all of it go (neither for what's there from the
start), and a `show`: a model's part by its `floor` (interior
`<model>:<floor>`), fetched through the loader then, and a wall frame by its room's
(`RoundRoom.interior`, a keep's storeys named `<name>:<floor>`), its picture fetched then; let go,
a part's mesh is disposed with its material and texture, and a picture's panels are taken back
(`CrispPanels.remove`). The doors
in the pineapple's shell are drawn from outside with the outside, so they're painted from an atlas
of their own (`doors.png`), the rooms' (`interior.png`) waiting with the rooms. A keep's stair and floors aren't split from its walls (about 13k triangles
across the tower's four storeys), and the Krusty Krab has none: its glazed front shows the dining
room from anywhere before it. A shut door's outline is a pixel either way of its edge, where what's
behind it shows, so there the culling isn't pixel-exact. Check a new opening or interior by
rendering viewpoints all round it with `Interiors.everything` on and off and comparing them.

### Wall frames

Murals hung inside a round room (the tower's floors) are listed per floor in
`packages/shared/src/content/towerFrames.ts`, and each floor's hang in both the tower's room
(`TUNG_TUNG_TOWER_ROOMS`) and the building that is that floor alone (`BUILDING_ROOMS`). Each is an
`angle` in degrees from the main entrance (to your right as you stand in the middle facing it), a `height` in
metres, and what it `show`s (an image's path, or a live `widget` by name; its aspect; and the
`line` typed out while you look at it), with `crt: true` to play it like an old screen (faint bands
rolling down it and a little static, a shader pass over the picture, `render/OldScreen.ts`, that
costs no memory whatever the picture's size; the two widgets have it). The width is height times aspect, and every frame is centred halfway up its storey (the
room's `middle`: 10 m up on the ground floor).
`layoutWallFrame` (`sim/wallFrames.ts`) lays one out as a flat panel per wall segment it crosses, a
few centimetres off the brick, and throws if it doesn't fit between floor and ceiling, comes down
over a doorway, or crosses the stair (whose steps must pass well under it or over it);
a test hangs every listed frame, so a bad one fails CI. Only the client draws them
(`render/WallFrames.ts`, picture on a wood border); nothing collides with them and they're not
structures, so the bots' maps don't change. The browser draws each frame's picture at full
resolution (and without the scene's tone mapping) in a layer under the 3D view, one slice per wall
panel, seen through a hole the frame's mesh cuts in the depth buffer (`render/CrispPanels.ts`), so
it stays sharp while walls and players still cover it. A frame is drawn, and its widget fed, only
while its room could be seen (see Interiors).

A widget is a copy of one at widgets.kathirm.com that the client draws itself
(`packages/client/src/widgets/`): it fetches the same data the web widget does and paints the same
layout onto a canvas, fetching and animating only while its frame is in view. One longer than its
frame (the anime activity list, floor to ceiling on the tower's first floor and in Building 3)
lays out as a page and scrolls with the mouse wheel while you look at it (`Widget.scroll`). A new
one is a name in `WidgetName` (`sim/wallFrames.ts`) and a factory in `WIDGETS`; its data source has
to allow the game's origin (CORS), and any image it paints has to come with CORS headers too, or
the canvas can't become the frame's texture from afar.

### Regions and pickups

- A region (`sim/regions.ts`) is a disc, a ring (a disc with a hole) or an axis-aligned rectangle on a
  floor at height `y`.
  Landmarks export theirs (a keep's `levels`: each floor inside its stair and its roof, so the
  tower's `TUNG_TUNG_TOWER_LEVELS` and the buildings' `BUILDING_LEVELS`; the terrace's
  `TERRACE_DECK`) and `content/regions.ts` names the ones the game uses (`MIDDLE`, `TERRACE`,
  `TOWER_LEVELS`, `BUILDING_LEVELS`, `SPAWN_AREAS`, `RESPAWN_AREAS`). Anything that spawns somewhere picks its spot with `randomPointInRegion`, so
  reshape a place where it's defined, never at the spawner.
- Pickups (`sim/pickups.ts`) float in the pickup areas listed in `content/pickups.ts`: a region, a
  kind, how many, and how often one comes back. What's where is that list alone, plus drops:
  `dropPickup` leaves one at a spot, in no area, where it stays until taken and never comes back. A
  dead player's body leaves `CORPSE_DROP` (a big heart, two and a half times the size, back to full health) on
  whatever it was lying on as it goes (its player brought back, or its seat dropped), each kept as theirs (`from`, how they
  appeared), which the client draws in their livery (see Liveries).
- A new kind is a row in `PICKUPS` (float height, reach, and `heals`, the hearts it gives back, a
  full life at `Infinity`; one at full health leaves it where it is, and the red box, `ui/Alert.ts`,
  tells them so for as long as they touch it) plus a shape in `render/Pickups.ts`; the
  `Record<PickupKind, …>` there makes the compiler ask. The Room, the wire and the Python mirror
  already carry every kind.
- Pickups pass through structures like cubes, so keep a region clear of stairs and walls at the
  pickup's height. Test a new kind's effect once in `room.test.ts`; content changes need no test.

### Loading a landmark

Every landmark, and every change to one, is weighed for how it loads and is drawn from near and
far, as every look is audited in every state (see Avatars): before the PR, answer each of these
and put the answers in it.

- **Up front:** what every player fetches for it at join, in files and KB (structures cost nothing
  to fetch; a model's outside parts do), and that it registers with `render/Loader.ts` as jobs
  that yield, nearest first.
- **Inside:** what of it only its openings show is an interior (`content/interiors.ts`): its
  openings, the doors that shut them, what each `shows`, and that its parts register with
  `Interiors.add` with a `load` and an `unload`, so it's fetched when wanted and let go far off.
  Render viewpoints all round it with `Interiors.everything` on and off and compare them.
- **Far off:** whatever of it stands somewhere registers with the loader with an `unload`, so it's
  let go past 700 m and comes back within 600 m; a model landmark has a shell in its `MODELS` row
  (see Models and doors), and its structures are in the skyline as they are (`render/Skyline.ts`:
  check its outline from past 700 m). Look at the shell beside the full model from the same spot (lower the
  loader's `reach` to see it close), from the front, the side and above.
- **The distance table:** where it sits against every distance in Client loading, scoped and
  unscoped: nothing of it let go while it can be seen, no fetch and let-go either side of one line,
  no doorway a scope shows clearly with nothing behind it, no rooms inside a shell. Any new
  distance goes in the table.
- **Cost:** triangles, meshes and textures it adds near and far, and the client's per-frame cost
  of whatever watches it (`Interiors.update`, `Loader.update`), measured, with the numbers in the
  PR.

### Checking a change

Structures are content, so don't add a test per structure. Run `npm run dev`, walk the new pieces in
a browser, and put screenshots in the PR. Headless, `window.__world.debug()` gives your position, and
in dev `window.__game.correction.length()` should stay at 0 while you walk over them (anything else
means prediction and the server disagree). A new kind is different: add a case in `surfaceOf` and in
the client's `build` (the compiler asks for both), a check in `validateStructure` for any new fields,
and one test of its surface in `packages/shared/test/sim.test.ts`.

Bots read the world from maps in `modal-bots/common/map/`, each kind a file of its own that
`npm run bot-map` builds with the real sim (`sim/botMap/`, a builder each) beside the Python module
that reads it, and a bot loads only the ones it needs. Each carries a fingerprint of what it was
built from, so a change rebuilds only the maps it touches:

- **The solids** (`solids.ts`, `solids.py`): the floor's parts and every structure, the whole
  world's, for line of sight and for where there's ground to stand on. Built at once. Python works
  both out from the shapes, and the map carries the sim's own answers to a few of each, which a
  test holds it to.
- **The ground** (`ground.ts`, `ground.py`): the walkable graph, a spot every metre round whatever
  stands and the open floor between as a few rectangles, with the standard body's jumps, the
  lookouts and the insides. It covers the floor the buildings stand on alone (`BUILDINGS_OUTLINE`):
  nothing more than 30 m past that floor is in the sim it's walked in or in its fingerprint, so a
  road laid or moved out beyond rebuilds nothing, and a building on an island to come is a part
  added to that list. Under a minute on four cores, after a structure near that floor is added or
  changed, the floor there, or the player's body or movement constants.
- **The moves** (`ground.ts`, read with the ground): the jumps of each way a look on foot moves,
  each distinct walk and jump power simulated over the whole graph once; a look that moves as one
  already there adds nothing, and one that moves its own way only its own jumps. A few minutes.
- **The roads** (`roads.ts`, `roads.py`): the roads' middles as a sparse graph, a node every 20 m
  or so (10 round a bend) with the road's height there, from the road layer's own `middle`, each
  stretch with no road under it marked a gap; roads that meet share a node, and one that starts
  on the buildings' floor starts at its rim. Built at once, and it throws where the sim's ground
  isn't the road's top under a node. No bot follows it yet.
- **The bodies** (`bodies.ts`, `bodies.py`): every avatar's hitbox, eyes, walk and way of moving.
  Built at once.

Nearly all of the time is each spot's walks and jumps, worked out apart from every other spot's,
so the ground's and the moves' are cut into shares (`Share` in `botMap/ground.ts`, which stays
plain sim code) and done on every core at once (`scripts/botMapHands.ts`, a worker thread a core,
each taking the next share as it finishes its last): about three and a half minutes on four cores
as the world stands, and what it writes is what one thread would. Run it and commit what it writes
with the change whenever any of those inputs move; a test in `sim.test.ts` fails until you do. The
ground and the moves also carry `code`, a hash of the sim files their builder runs
(`scripts/botMapCode.ts`), which no test holds them to, so a change to how a body walks or collides
needs no rebuild from you: `deploy.sh` runs `npm run bot-map` too, building either when its source
or code is off, and CI keeps what a deploy built for the next one.

Start `npm run bot-map` in a shell of its own, in the background, as soon as what it's built from
is final, and carry on with whatever doesn't wait on it (the other checks, the docs, the PR's
description) rather than sitting on it. It's one command for every map, and a shell a map wouldn't
be faster: the three built at once are written in about a second between them, and the ground and
then the moves each take every core, the moves over the ground just built, so a second build beside
it only slows both. Finish the files `code` hashes before it starts: an edit to one while it runs,
even to a comment, leaves the committed `code` behind.

Cubes don't know about structures. Every map (the HUD's minimap, the menu's and the guide's) draws
through `ui/MapCanvas.ts`, which reads the outline (`WORLD_GROUND`) and `content/landmarks.ts` itself
(a road's marks among them: each climb drawn as arrowheads pointing up it, each boost pad as a rainbow),
drawing only the parts, landmarks and grid lines its view covers (`Ground.partsIn`), so a frame
costs what's on the map however big the world is, and they all show one world and a map change is a
change there: footprints grey on the floor (a disc's
`rings` drawn inside it: Tung Tung Tower has one per floor above the ground), SpongeBob's house as
itself (a `PineappleMark`: the fruit hatched, its leaves in the middle, on the sand of its dune), the
Krusty Krab as itself (a `KrustyKrabMark`: its plinth, the barrel of its roof, its arches), and
with your feet past `HIGH_UP` (35 m) `HIGH_LANDMARKS` too: the terrace, the sky bridge and the
staircases. List a landmark's there when it's worth navigating by.

## Death and respawn

A player is one seat in the Room from joining to leaving: their id, name, colour, `kills` and
`deaths` (`PlayerState`, both on the roster) last the whole visit, and nothing about dying loads a
page. A body at no hearts is `dead` and lies where it fell. How long a person's lies, and what
their player sees meanwhile, is a rule of the room's game that the Room and the client both read
(`Dying`, the shared package's `modes/rules.ts`): in freeplay ten seconds, which their death screen
(`ui/Death.ts`) counts down, or until its RESPAWN button sends the `respawn` message; in a game's
lobby three, with no screen and no death sound, the mouse still the world's and the body watched
from the boom whatever the view (`View.watching`). Then the Room (`room.ts` `respawn`) buries the
body (`buryBody`: it leaves
`CORPSE_DROP`, see Regions and pickups) and gives the seat a new one, as whoever comes in is given
(a full life, nothing held or worn), somewhere in `RESPAWN_AREAS`, in the look they died in
if it's one on foot (a dragon's rider comes back as the standard body). A bot is never brought back: its
corpse lies five seconds and its seat is dropped. A new body is the Room's `rebody`, which a game
uses too, to put everyone where it starts and back in its lobby (see Game modes): the seat's
`PlayerState` made afresh with its name, colour and score, and `body` counted one up. Nothing else
on the wire says it happened: clients read it off the snapshots, a `body` that isn't the one they
knew. The last one's avatar goes, in a poof where it lay if it was dead, and is made afresh
(`Game.dropAvatar`), nothing is drawn between the old body and the new (`Interpolation`), the
player's own client takes its look from the new body and, back from under the death screen, takes it
down (`Game.embody`), back in the world at once where the browser gives the mouse back (the RESPAWN
button's press, or any key pressed in the last few seconds) and behind the start press
(`ui/StartGate.ts`) where it won't, and the Room forgets where the old body was for lag compensation
(`PositionHistory.forget`). Whatever else decides when or whether the dead come back is a change to
that rule, or to when the Room calls `respawn`, and nothing else.

## Avatars

An avatar is a row in `AVATARS` (`packages/shared/src/sim/avatars.ts`: command, eye
height, hitbox, and on foot its `walk` in m/s and its `jump` power, 1 rising `JUMP_RISE`, 1.6 m;
`walkSpeedOf`, `jumpVelocityOf` and `climbSpeedOf` read them for the sim; with a `leap`, a jump
taken at a run, on the move, is a long jump: off the way the keys go at a multiple of its run,
rising a share of its jump under a share of gravity with little grip on the flight, until it lands,
`PlayerState.leap` and `walker.ts`; with a `chain`, a plain jump taken within its `gap` of landing
the last is the next of the chain, each rising `rise` times as high as the one before, and the jump
after its last, or after a longer wait on the ground, is the first again (`PlayerState.hop`, which
jump of the chain the last was, and `down`, the seconds since landing; holding the jump key runs
the chain, since a held key repeats); with a `pound`, the `pound` action in the air (X, or the touch
POUND button) is a ground pound, `PlayerState.pound`: the body hangs turning over for the `twirl`,
drops straight down from `speed` under gravity, and lands planted for `recover`, the keys and a
jetpack doing nothing throughout; the landing is judged as a fall from rest where the pound began, whatever fall the body
was in before it (so one begun low breaks a long fall, and one begun high hurts as its height does), and the Room
takes `damage` off everyone else on foot within `reach` across the floor, about level with it
(`POUND_HEIGHT`, so a jump clears it) and in its sight, and throws them back off their feet (its
`knock`, a `throwWalker` like the storm's), a kill by it announced with `item: 'pound'`; the client plays its turn's sound and runs a ring out over the floor it hurt across,
`render/PoundRing.ts`; with a `crouch`, the `crouch` action held with its feet down (X again: held
on the ground it's the crouch, and only a press in the air is a pound; the touch CROUCH button
turns it on and off, since a thumb can't hold it and press JUMP) is a crouch,
`PlayerState.crouch`: its walk at the `crawl` share, the run adding nothing, and a jump out of it
held still a backflip, `PlayerState.backflip`, rising `flip` times its jump's height in the
chain's place, and out of a crawl its long jump, the run or no; that last is for players to find,
so the hint, the legend and the guide don't say it; with a `strike`, the `strike` action (X once
more, or the touch BAT button) swings what its free hand carries, whatever the other holds and
wherever it stands, `PlayerState.strike`, the seconds into it: `windup` after the press the Room
takes `damage` off everyone with any of their hit shape within `reach` of the middle of its body
and within `arc` of the way it faces, level whatever its pitch (`combat.ts` `findStrikeHits`),
and throws a walker back (its `knock`), a kill by it announced with `item: 'strike'`, and
`recover` later it can be swung again; Tung Tung Tung Sahur's bat is the one there is; with a `float`, the `float` action (the jump
key held, which the touch JUMP button holds too) coming down holds the fall, `PlayerState.floating`:
it sinks at `sink` for as long as it's held, up to `seconds` between one landing and the next
(`floated`), and a long jump and a ground pound don't float; the client gives it a few sparkles
under the body, `render/Sparkles.ts`, and a faint shimmer for as long as it lasts, a loop of `Footsteps`) and a builder in `packages/client/src/render/avatars/` (`LOOKS` in `index.ts`, a dynamic `import()` of its module,
which the compiler asks for). Everyone on foot is a `Figure` (`render/avatars/Walker.ts`): the
builder makes the avatar's parts under the base node and says which plays which role (what tips
with the look, a head, the legs, the free arm, the weapon arm with its grip and the way it reaches
in the model) and the numbers its walk takes (swings, bob, sway, how it lies dead), and
`WalkerAvatar` poses every figure the same way: standing, walking, aiming what it holds, falling,
climbing a ladder, sat driving a kart and lying dead. Empty-handed the body turns to face the way it's going (the look
only turns its head) and stays facing that way when it stops, unless it's `headless` (Tung Tung
Tung Sahur, his face on the log), when standing still it turns whole to the look; with something to
aim it faces its look, so the aim shows. It watches how it moves from where it's drawn, which for a player's own
body is a sim tick at a time, on whichever frames the ticks fall, with a hair of drift on every
frame between as its prediction's correction dies away. So nothing is read from a speed taken
frame to frame (it comes out zero and double by turns, and a pose hung on it flickers): the
heading is taken over the time since the body last moved by more than that drift, and in the air
only which way it last moved is read, up or down. A body dying leaps `DEATH_LEAP` of its height and goes
over in the air, landing as it lies (`WalkerAvatar.lie`); one first seen dead just lies. Motion is written there once, for all of them, and an avatar's
own touches (a tail, a twitch, feet that lift) are its `extra` hook. A body that differs by a
number (how far a leg swings, a two-part tentacle, no legs at all) is still a figure; one that
differs by a rule (a sidestep, a slither, tentacles wrapping the rungs, running on a kart's
steering wheel) extends `WalkerAvatar` and overrides that one phase (`walk`, `climb`, `sit`, `lie`
or `aim`), registered in `LOOKS` by its class (a `BodySpec` names it as its `avatar`), and the
walker never asks which avatar it is posing. A Sketchfab
model goes through `packages/client/scripts/avatar-model.py` into a `<name>Model.ts` and a texture
atlas (`public/assets/textures/avatars/<id>.png`, fetched with the look's chunk, see Client
loading); a trunk on two arms and two legs is a `BodySpec` (`Body.ts`), and one with
a whole skeleton a jointed body (below). Tung Tung Tung Sahur (`Sahur.ts`) is rigid parts from
`scripts/sahur-model.py`: a sculpt's log and legs with arms and a bat drawn by the script, every
part closed and turning on a joint sunk in the log, the bat in its left fist and an item in its
right; the builder's `extra` poses the bat arm (carried, swung on a strike, held clear on a ladder).
Sandy (`Sandy.ts`) comes from a model with no rig at all, one mesh in separate pieces, so
`avatar-model.py` gives each bone the pieces that lie where it is (a `Piece` by side, height and
how far out, turning on its inner end, its bottom or its front) and thins each piece on its own
(`apart`); the helmet's glass is left out of the mesh (`skip`) and drawn by the builder as a clear
dome the size the model file gives (`glass`). Mrs. Puff and Larry the Lobster (`Puff.ts`,
`Larry.ts`) are on that game's own rig, a head, two arms and two legs on a trunk (and Larry's
tail); her eyelids, which the rig binds shut, are left out of the mesh (`bare`), and her eyeballs,
cream in its texture, painted white (`whitened`); the shine drawn on his claws is painted over
(`plain`). Rebuild the bots' maps after
adding one, and keep it as cheap as the ones there (triangles, one mesh, a small atlas), with the
numbers in the PR.

A character that should move like itself is a jointed body (`render/avatars/Jointed.ts`,
`JointedAvatar`, a `WalkerAvatar` that poses every phase itself): a whole skeleton (hips, spine,
chest, head, arms with elbows, hands with fingers and a thumb, legs with knees and feet) under a
model from `scripts/jointed-model.py`, which reads a rip of the character's own model (Mario's,
Luigi's, Wario's, Waluigi's, Peach's and Daisy's are on one rig, in a T-pose), moved by animation clips (`render/avatars/clips.ts`):
frames of where the hips are and how each bone is turned, drawn by an animator, never worked out.
Mario's are Super Mario 64's own (`sm64Clips.ts`, baked by `scripts/sm64-clips.py` from a
rigged, animated rip of that game's Mario: each source bone's turn from its T-pose carried onto
the jointed body's, the hips in leg lengths so a longer-legged body bobs as far for its size, and
each frame stood on the ground). A `Style` is its clips (idle, walk, run, jump, fall, land, and
for a look with the move a `leap`, a long jump played takeoff to landing, `double` and
`doubleFall`, the second of a chain of jumps going up and coming down, `triple`, its third, a
somersault fitted to the flight so it's over just before the landing, and `pound` and
`pounded`, a ground pound turning over into the seat it drops in, then landing sat and getting
up, and `crouch`, `crawl` and `backflip`, sat low, a cycle of the crawl's limbs, and the backward
somersault of the jump out of it, fitted to its flight as the triple's is, and `float`, hanging
in the air through a float, and `die`, dying where it stands, played once and held where it leaves
the body, in the leap's place: the game's own reel and fall, which Mario's whole family plays) and a few numbers; the frame's pose is those sampled and blended: the idle into the walk or run at the
point in the stride its feet have got to (the footsteps' phase, so feet land with their sounds,
and the stride is the same at any speed, the legs only quicker), the jump going up into the fall
coming down, and a landing as hard as the drop. Don't invent a character's motion from numbers:
it reads as wrong however it's tuned. Find its clips. The walker turns the body as it does any
figure's, and the jointed body leans into the turn by the style's `bank`; with something to aim,
its hips turn toward the way its feet go and its chest back, running the stride backward past a
point. A landing's weight is the drop from its highest point. Every change of pose runs from
rest to rest over a few frames, never snapped. The poses no clip covers (on a ladder, lying dead)
are written as a `BodyPose` (`render/avatars/motion.ts`), which the rig solves, bending each leg
to put its foot where the pose says; on a ladder each fist and foot is put on a rung of it
(`rungHeld`, `Rig.reach` and `Rig.tread`), the hips an arm's length back. A clip's arms are as
long as the body it was drawn on, so where its hands have to be somewhere on another body the rig
puts them there over the clip: sat in a crouch, flat beside the head (`Rig.clasp`), each as far
out as rests it on whatever of the head is under it (`Rig.resting`, from the head's relief and the
hand's vertices, the model script's `skull` and `mitt`), so it touches the head and is never in it. Characters on one rig can share clips (Luigi plays
Mario's, his legs running on in the air, and Wario plays them on his own short, wide-set legs with most of the arms' swing taken out and
his body rocking over each foot, the style's `arms` and `waddle`; Waluigi plays them as they are), and a new one is a row in the model script's
`CHARACTERS`, its files, and clips of its own if it moves its own way. What the family shares is
said once and each member is that with its own over it: on the client `SM64_STYLE`
(`render/avatars/sm64.ts`), a character's style spreading it and setting its own numbers or its
own clips in the places it differs; in the sim `SM64_MOVES` (`sim/avatars.ts`), a row spreading it,
setting its own over a move (Wario's pound) and adding what is its alone (Peach's float). A move
is its field on the row, its state on `PlayerState` and its clip in the style, each optional, so a
character has any mix of them. Peach moves her own way
wherever Mario's won't do for her: her idle, her walk, the quick walk she has in a run's place, her
jump, fall, landing and float are Super Smash Bros. Brawl's (`peachClips.ts`, baked by
`scripts/peach-clips.py` from her files in that game, which `scripts/brawl.py` reads: the model's
bones and the animations' keys), and the rest Mario's; what the two bake scripts share, carrying a
source skeleton's poses onto the jointed body's and writing a clips file, is `scripts/clips.py`.
Daisy is Peach over again in her own model and voice: Peach's row in the sim, her style and her
skirt; her hair is short, so it has no tail.

A model may carry bones no clip or pose turns (`SoftBone`, the model script's `SOFT`), which move
by themselves after the frame's pose (`render/avatars/soft.ts`, run as the figure's `extra`).
Peach's skirt (`Skirt`: three rings down from the hips, with the model's `hem`) is a stiff bell
that hangs straight down the body's frame however the hips lean, its hem carried level only as far
as keeps her knees and ankles under it (a foot may show under the hem at the end of a step), pushed
wider where they are further apart than it is, tipped whole over legs held out further still
(right over them, sat with them up in front of her in a ground pound), gathered up short of the
floor when the hips come down, and taken round with the hips in a somersault; the model script
closes its hem with a lining (`lining`), so nothing shows up it when it tips. Her legs move under
it and stay out of sight: a knee or an ankle out past the cloth as it hangs that frame (a leg
quicker than the skirt, a long jump's two further apart than it spreads) is turned back in under
it (`Skirt.tuck`). And on her feet her hands rest on it, never in it: an arm whose palm a clip has
left inside the bell (`Bell`, measured off the model's skirt vertices) is swung out from the
shoulder until the palm lies on the cloth (`Rig.drape`, `Skirt.clear`). Her ponytail (`Tail`, with the look's
`tail`, the way each link runs as the hair is dressed) is a chain of points that fall, are pulled
toward that dressing and drag, kept off the head and the floor, worked out from where the body
stands so the body's stepped travel never yanks it: it hangs down her back, swings behind a turn
and a start, and trails a run a little.

Its walk is a row in `GAITS` (`render/avatars/gaits.ts`): the metres between its footfalls, which pace
its step sounds and its limbs alike (and, for a look that crouches, its `crawl`, the metres between
its hands coming down, each a shuffle, quieter and lower than a step), what a footfall sounds like (the thuds, a bar of its own
sounds, or a loop) and the sounds' pitch; the swing of its limbs is the renderer's. Ask for each
when adding one. What it says in its own voice is its row in `VOICES` (`audio/voices.ts`), which
every look has: ask for its lines when adding one, and then, as a question of its own, which of
them it cries at a kart's boost (`boost`, below; none unless told). Its `enter` is its intro, the line every character is expected to have (empty
until its recording is added): said as a player switches to the look, to them and everyone near,
until they switch again (`Sfx.hush`; the home screen's stops at the next pick too),
on the home screen as the look is picked (`Sfx.ts` `audition`), and to the player alone as they
come into the world wearing it, after the start press (with longer to arrive, `START_INTRO_LATE_MS`). An intro is `lazy` in `SOUNDS`
and played with `Sfx.soon`: fetched the first time it's said within earshot and played as it
arrives (let go if that takes over `LATE_MS`), so a client pays for the intros it hears and no
others. Adding one is its file (mono mp3, levelled to the others' loudness), a `lazy` row in
`SOUNDS` and its name in the look's `enter`. The rest only some looks have: its sounds
for a jump in the swoosh's place (`jump`, by where the jump is in a chain of them: the first, the
second, the third, the last one given serving the rest), and the takes it picks from on a long jump, at a hit (heard by
everyone near, never before the last cry has run out nor within `CRY_GAP_MS` of it; its own player
hears it over the hurt sound, which sounds at every hit whatever the look, so a spray's run of
hits, fire's and ice's, is a hurt sound at each and a cry at a time) and a moment after a kill (`Game.say`);
its `boost`, what it cries as the kart it drives begins a boost (a drift's, a trick's or a boost
pad's), heard by everyone near and held off like a hit's cry while its last cry sounds (`Game.cry`,
so two boosts a moment apart are one cry): takes borrowed from its other lines (none unless given), each
played at the one volume (`BOOST_CRY`) whichever line it's from, since the lines' recordings are level and it's only their volumes that differ (an
intro's is over twice a jump's), and sent for as the look is first seen driving; and its `death`,
which its own player alone hears over the death screen (cut to its ten seconds; the respawn ends
it), `DEATH_SOUND_DELAY` after dying so the hit that killed them sounds first, as any hit does,
and over that hit's cry rather than cutting it as a look's other lines cut its last. While it
plays it's the player's only music: the theme they were hearing is gone by the time it starts
(`Sfx.endLoops`) and none comes back until it ends (`Game.music`). A
hurt, a kill and a death are `lazy` too, sent for (`Sfx.want`, `Game.wantVoice`) as a look is
first seen worn, a death by its own player alone, since they have to be there the moment they're
said; a hurt or a death that hasn't arrived is left out, and a kill not here yet is played as it
arrives (`Sfx.soon`). Keep to one of those for any sound only some players hear: everything else in `SOUNDS` is fetched by everyone up
front, which is right for what anyone near can hear at any moment and wrong for anything long
or rarely heard. A clip cut from something longer gets a `swell` and a `fade` in `SOUNDS` to suit
how its cut begins and ends (a one-shot's `fade` dies away into its end): listen to both ends of
every new recording, a death's above all, since one shorter than the death screen ends in silence,
where a hard stop is plain. A death as long as the death screen takes no `fade`: the respawn ends it.

Every sound is level with the rest of its set, so no clip stands out from its neighbours: a set
is the sounds a player hears as one kind of thing and compares (one character's hit cry beside
another's, one footstep beside the next), and every sound in a set plays
within 1.5 dB of the set's middle. `python packages/client/scripts/sound-levels.py` is the measure:
it lists every sound in `SOUNDS` by set with the loudness of its file (over its sounding part
alone, weighted as hearing is, so the silence round a clip, a gap in it and a long tail don't count
against it as they do in a plain mean), its `volume` and what the two come to, flags any that
stands out, and exits 1 if one does. Run it whenever a sound is added or its `volume` changed, and
put its lines for the new clips in the PR. Level the file itself to its set's loudness and give it
the `volume` its set has (the comment in `SOUNDS` ranks the kinds of line against each other),
never a `volume` of its own to make up for a quiet file. A new kind of sound that should be level
with others goes in a set in the script; one meant to differ from its neighbours (a soft landing
and a hard one, the two guns, a tentacle's light plop and its heavy one), and a dragon's roars,
cries and theme, each set to carry across the world, stay out of them.

Craft a character with love: look at it in every state before the PR, and put the shots in it.
Standing, walking, holding and aiming each weapon, firing, hit, dead, on a ladder; from the front,
the side and behind; and your own body in third person. The model's bind pose decides how the arms
hang (`armsDown`) and where the palm is (`model.hand`), and a held gun has to sit in the hand with
its barrel along the look: the weapon arm is turned from its `reach` (shoulder to hand as the model
holds it) to the look, and the grip at its hand turned so the barrel runs that way.

Audit every look in every state, up close: standing, walking, each weapon held and aimed up and
down, firing, hit, dying, dead, on a ladder with and without an item, driving a kart with the
wheel straight and full over, and any move of its own. A
sheet of the whole body hides what's wrong at a hand, so look at the hand itself from the front,
the side, behind and above for each weapon: a weapon is held by its handle (`HANDLE` in
`render/Weapons.ts`, whose middle `HeldItems` puts at the hand's grip), so the handle is in the hand
as that hand can hold one (in a fist, in the gap between a claw's pincers, against the palm of a
hand that can't close) and the weapon's body lies over the hand or ahead of it, never through the hand or hidden
inside it. What a look needs for that is its builder's to say: `hold` moves the handle from the
grip, `roll` turns the weapon arm about its length as it aims (a hand turned thumb up, a claw's
pincers closing on a handle from its sides), and `itemScale` draws the items to the body's size. When something every look
shares changes (the walker, a weapon's shape, a rig), audit every look it reaches, not the one the
change was made for.

### Liveries

A look's livery (`render/liveries.ts`, `LIVERIES`) is what anything made out in its wearer's name
is drawn in: a primary colour, the one the look is known by, a secondary that goes with it, and an
emblem, a picture of a badge (the look's mark on a disc, filling the picture edge to
edge) in `public/assets/textures/emblems/`, about 5 KB, fetched by whatever first draws it. A kart
wears its dropper's as they appeared when they dropped it (see Karts; `Appearance`, the look and
the colour, which is what the Room keeps and sends of it), and the heart a dead body leaves is
its player's (`render/Pickups.ts`: the heart in the primary, the emblem on a disc a hair off each
face, sent for as the body is seen dead and left off until it's here). Its primary is also the
colour a player goes by wherever they're named or marked: the roster's dot, the name over their
head, their pin at the screen's edge, their mark on the maps and their name in the chat all read
`nameColour`, which lightens one too dark to read on the dark those are drawn over. The Mario family's are Mario Kart 8's,
the colours and the emblems `scripts/kart-model.py` takes from the Standard Kart's rip. The rest
are made here, their emblems drawn by `scripts/emblems.py` (a row each in its `EMBLEMS`: the
disc's colour and its mark, a picture or one drawn there). Every look has one (`liveryOf`): a
look's row in `LIVERIES` says only what of it is its own, and what it leaves unsaid, or all of it
for a look with no row (the standard body among them), is its wearer's colour over black and the
default emblem, the game's initials on a white disc, the K over the W on a diagonal. Their
picture has them in a key red (`INK`) that the client paints over with the livery's primary as
it's drawn (`emblemPixels`, with a dark line round the letters so a pale primary still shows), so one picture serves every colour, and whatever keeps an emblem
as drawn keeps it by `emblemKey`. Elizabeth's row is her white over the orange of her feet, and
the site's logo, which is her, on a dark disc. Every other look's row is two colours off its
own model, what most of it is and what it wears or is marked with, under the default emblem
until it has a mark of its own: a picture of them or of something of theirs, cut out of its background
(`scripts/marks/`, with what it is and where it's from beside its row in `scripts/emblems.py`), and
drawn there only where there's no picture to go off. A new
one is a row in `LIVERIES` and, with a mark of its own, its emblem's picture; nothing that wears a livery has to know the look.

## Player classes

A class is what kind of body a player has (`packages/shared/src/sim/classes.ts`): every avatar names
one (`AVATARS[id].class`), and `stepPlayer` applies the look and the held item every class shares,
then the class's own `step`. A `ClassSpec` carries everything the Room, the client and the bots need
to treat the class on its own terms: a full life and its HUD rows, whether it takes the kit (weapons
by command, gear, `/speedy`), whether bots may wear it, its own tap actions on keys of their own (reported in `InputFrame.actions`
like an item's and announced by the Room as `action` messages), whether it `fits` where a player is
switching into it, `enter`/`exit` for its own state on `PlayerState`, its `hitShape` for shots (a
capsule or spheres, `combat.ts`; a hit lands on a `HitPart`, the head, the body or one of the
shape's weak points by number), `hurt` for what a hit on a part costs when it isn't the damage as
it comes, and where a dead one `lies` for the hearts it leaves. The walker
(`walker.ts`) is everyone on foot; the asian dragon (`asian-dragon`, `dragon.ts`) is a head sphere flying where its rider
looks, at the forward input's share of cruise, with a spine of points following it, kept 5 m up and too big for a door, its head turned
toward the look only as far as the neck lets it, breathing a wide cone where the head points
(the look's own hold item: the light dragon's `firebreath`, Colgera's `frostbreath`) and roaring on
A, S and D (on touch, a throttle in the pad's place, slid up for the speed and left where it's
put, since forward is the only way it moves, and no JUMP); a new one climbs straight out of the ground, head up, until its whole spine is out. Its
rules are in that file; its body is its look's (`DragonShape`, the `dragon` on the look's row in
`AVATARS`): the spine's links (metres from the eyes to the first point and between the points after
it, so a skin with a long rigid stretch of body has one long link there), the head's and body's
radius, its `underside` (metres the model reaches below the eyes and below a spine point, where a
dead one's points come to rest over the ground, so a flat body lies on it rather than hanging at
its radius), how fast it cruises and how tight it turns, its `weak` points and how it comes up
(`rising`), all as the model has them, and its `size`, how many times that the dragon is:
`dragonShape` hands out the links, radii, underside, turn and weak points at that size, the client
draws the model that many times over, and the row's hitbox and the camera's boom (`DRAGON_BOOMS`)
go with it, so a dragon grows or shrinks by that one number (and the bots' bodies map, which carries the
hitboxes). A weak point (`WeakPoint`: the link it's under, how far `below` the link's middle, its
radius) is a sphere hung under a link, there only while the link lies flat enough to have an
underside (`weakPointAt`), and a shot reaches it only from below (`combat.ts` keeps it out of a
shot coming down); a look with any is hurt through them alone (`hurt`: a whole heart a crystal,
the bullet that reaches one shattering it, a spray washing over it (`ItemSpec.shatters`),
`DragonState.shattered` over the wire, and nothing for a hit anywhere else or on one already
gone), so Colgera's three rings are three crystal hearts.
With `rising` the look comes up in a storm (`Room.storm`): a disc of ice on the floor under it
(`frost.ts` `frostDisc`) and a blast that throws every walker within reach away and up for its
damage (`throwWalker`). A life is a `LifeSpec` (hearts, the HUD's row and the sprite it's drawn
with: `heart`, or Colgera's `crystal`, each a pixel shape in `ui/Hearts.ts`), the class's unless
the look has one of its own (`lifeOf`: Gary's five hearts and Plankton's three, small bodies with
small lives). `becomeAvatar` (`player.ts`) is the one way a player changes look: a new look is a
new body at the same eye point, with the same hearts where the life is the same, the same share of
a full life where it's another life of hearts in the same class (so switching skins never heals),
and a full life otherwise (a new class, or crystals, whole ones to a weak point). The HUD's bar
(`ui/Hearts.ts`) and the roster read the worn look's life, and a heart pickup fills to it; a
fall's or a weapon's damage is the same hearts whatever the life, so a small one dies sooner.

A new look in a class is a row in `AVATARS` (with `item` for one that comes with its own weapon,
`regen` for hearts back steadily at `REGEN_RATE`, `hidden` to keep it out of the menu, `life` for a
life of its own), and for a dragon its shape there and a row in the client's `DRAGONS`
(`render/avatars/dragons.ts`): the model it's drawn from, what it rises out of the ground through
(the light dragon's, the ground itself rippling out from the body in rings, `render/GroundRipple.ts`:
a patch of the floor or of the structure's top it comes up through, drawn with that surface's own
look so only the bending shows, glowing white and barely gold as a pool round the body and a
little more on the crests; Colgera's storm, `render/Storm.ts`, a wide white pool lit blue at its
rim, crawling with static and rippling outward, with a gale of grey and white "+"s and white fog
whirling over it; either way, what of the body is still under the surface it rises from is
clipped, so a deck or a roof hides it as the floor does), and
the wave down its body (`Wave`, in metres of body: the spine's points ride it, so a body of rigid
pieces tilts along it joint by joint and a skinned one bends); with its voice in `DRAGON_VOICES` (`audio/Sfx.ts`: its roars by action and
the cry it rises with, each a `Call` with a take heard up close and, where the rip has one, a take
recorded from afar that plays instead past `FAR` metres) and its theme in its row in `VOICES`, and
how far back it's watched from in `DRAGON_BOOMS` (`game/View.ts`).

A player hears one theme at a time (`Game.ts` `music`), and none while their look's death plays
(see Avatars). A look can have a theme of its own
(`VOICES`' `theme`, a loop, with an intro if it has one), and to whoever wears it that's the only
music there is, wherever they go: no dragon's or building's plays over it. Its `heardBy` says who
else hears it: `everyone` round the wearer, from where they are (a dragon's, so one is heard
coming), or the `wearer` alone (Elizabeth's, Katsura's theme from Gintama), heard flat at its
volume. A player wearing no theme of their own hears the nearest of those round them: a living
player's that everyone hears, from its head, or a building's (`PLACE_THEMES` in `audio/Sfx.ts`: the
Krusty Krab's hornpipe, SpongeBob's house's rag, Tung Tung Tower's tower music on every floor up to
the roof), measured from its walls (`toKrustyKrab`, `toPineapple`, `toTower`) and heard flat across
its grounds, the only one heard from inside them; kept until another is `THEME_HYSTERESIS` nearer,
one crossing into the next over the sounds' `swell` and `fade`. A worn theme runs for as long as
anyone the player could hear it from wears it, and a building's for the rest of the visit, each
from the first frame its recording is here (`Game.running`, so it begins from the top however long
it took to arrive), and one taken up again is heard from where it has got to (`setLoops`'
`elapsed`). A look's own theme is sent for as its player takes it (`Game.wantVoice`). Anything that
should one day carry a theme of its own (a power-up, say) is one more source for the player's own
in `music`. A looping track is cut on exact samples and encoded
with LAME (ffmpeg's `libmp3lame`), whose header the browsers' decoders read to trim the padding,
so the loop and the join from its intro are gapless; check a new one decodes to its exact sample
count before trusting it. A new class is a spec
and its sim in a file of its own, a case in `PlayerClass`, and a row in `CLASSES`; nothing else
has to know it exists, except the client's `createAvatar` for how it's drawn, `VIEWS`
(`game/View.ts`) for how it's seen, and `BOARDS` (`ui/legend.ts`) for the key legend along the
bottom, a board of cells read off the player's state every frame (a walker's swaps to the climb's
keys on a ladder, keeping only the look's moves that work there). Every dragon is drawn by `render/avatars/Dragon.ts`: its model
puts a bone at the eyes, one wherever it needs on the spine (`along` metres behind the eyes) and
one hung on another for a part that moves on its own (the jaw; a wing, hung at its shoulder and
listed in `wings`, which the renderer beats, each pair behind the one before), and the
renderer carries each along the spine the sim moves; the pieces that go with a weak point (`DragonModel.weak`, a ring's
crown of spikes, the crystal plate in its hollow and the ice sealing the hollow over and under it,
drawn translucent so the crystal glows through) are hidden once the sim says it's shattered,
with a burst of shards where it was (`render/Poof.ts` `shards`), so the ring is left a hole. A
skin with a glow atlas (`DragonLook.glow`: `<id>-glow.png` beside its atlas, laid out alike, what
shines on it in the dark: Colgera's eyes, crystals and the veins through its ice, from the rip's
emission maps, with the self-light every skin has baked in) shines by that as light itself
(`skinMaterial`'s `glow`); the model script's `Look` says what paints each material and what of
it shines. The light dragon's is rigged by `scripts/dragon-model.py` (its
docstring says how) from a Sketchfab GLB; Colgera's (`colgera`, the Tears of the Kingdom boss: three
ring segments, each a rigid link of the spine, on a stiff spine with wings and arms) by
`scripts/colgera-model.py` from the game's own rip, a Collada file whose every piece is rigid on a
joint of a straight skeleton, so the sim's links are the rig's joint spacings and a bone sits at
the middle of each link carrying the pieces hung on it (the script prints the shape for `AVATARS`).
The helpers the model scripts share (reading a GLB, decimating, packing an atlas) are in
`scripts/glb.py`.

## Karts

Karts are their own module, apart from players' classes: `sim/vehicles/` in the shared package.
A kart is a row in `KARTS` (`karts.ts`): its name and command, and its stats, each a number in
the units it's felt in: `speed` (S, m/s flat out on the gas), `acceleration` (seconds from
standing to S), `handling` (metres across the circle it turns at S with the wheel full over),
`weight` (who shoves whom in a bump), `miniTurboTime` (seconds of drifting to a blue spark,
smaller better) and `wrenches` (its health), with the box it drives as. Traction isn't a stat:
it's one constant for every kart, and only an icy footing's grip is less, along the kart as across
it: on ice it slides wide of a turn, and its gas, its brake, a boost and its roll to a stop all
come on no faster than the ice grips. A kart is built to seat
its driver (`sizeFor`, `KartState.size`, set as it's dropped and every tick it's driven): at its
model's size for one no bigger than `SEATS` (as tall as Luigi, as wide as the standard body), and
for a bigger one grown as many times as they're bigger, by up to `GROWTH` (a fifth), too little to
see karts come in sizes; everything about its box is read at that size through `bodyOf`. `stepKart` (`kart.ts`)
is how every kart drives, a pure step of its `KartState` by its driver's `KartControls` (gas or
brake, the wheel, the drift key) that the Room runs and the driver's client predicts with: the gas
and the brake along it (the brake backing it up once it stops; with neither it slows fast, to a
stop from flat out in under two seconds, `COAST`), a turn as tight at any speed,
the wheels taking back what slides across, rolling up anything within a kerb's height and
flying off a ramp's lip, and walls in the way, which it meets as two circles, at its nose and its
tail, so a corner hit turns it; it bounces off one at a share of the speed it ran in at (`BOUNCE`),
and from a real hit it reels a moment (`REEL`, `KartState.reel`), its tires doing nothing, so it
rolls back as it bounced before the gas, held, takes hold again. Each circle, and its middle, rolls along the ground under it a
quarter of its width at a time, up onto whatever is within a kerb's height of where it was (0.4 m
at its model's size and as much more for one built bigger, `kerbOf`, so every size climbs the same
slopes and pads), so a
slope is climbed however fast it's taken and only a face taller than a kerb is a wall; and it
leaves the ground at a lip, or over a crest it's going `LIFT` faster upward than the ground past
it would carry it, whichever tick it crosses on; it reports how fast it ran into what it hit and
how fast it came down when it lands. A drift is Space: a press hops it (`HOP`: 0.44 m up and down again in 0.42 s on the flat), and the way the wheel is
held over as it hops, or first goes over in the hop, is the hop's (`KartState.hop`): landing with
the key still held, at speed, it drifts that way whatever the wheel has done since. A hop the wheel
stayed straight through lands in no drift, and one begins the way the wheel next goes over with the
key held. A drift turns by the wheel from all but straight (held out of its way)
to tighter than any turn without one (held into it, `DRIFT_TURN`), coming round to that turn
from the one it began with over `DRIFT_EASE` (0.45 s, and up to 0.7 s with the wheel held full into
it, the tightest turn coming on the most gently), so a hop's slight turn doesn't snap into the
drift's as it lands, a spark blue, yellow and
purple at 1, 2.25 and 3.5 `miniTurboTime`s of it on the ground (`SPARKS`); let go on a spark, it's a
mini-turbo, its top speed raised by half over `TURBO.rise`, held as long as the spark gives
and let down over `TURBO.fall`, the kart slowing with it, so a boost is over when it says. A press in the air, off a ramp or a ledge but not its own hop (or
every hop would be a boost; a hop is up and back down to where it left the ground, so one taken off
a ledge is in the air as off any once it's falling faster than a hop comes down), is a trick
(`KartState.trick`), left or right the way the wheel is
held, else neither way: a trick straight up, which turns nothing; with the
wheel held its way through it, a trick edges the kart across that way, `TRICK.edge` m/s by its end,
which shifts where a jump comes down by about the kart's own width and is all the steering a
flight has; once a
trick is through (`TRICK.seconds`) another press is another, as many as the flight has room for,
and landing after any is one boost like a mini-turbo's held for `TRICK.hold`. Only a flight is
tricked in: `TRICK.clear` (0.5 m) or more over the ground under the kart, which is more than its
own hop lifts it, so the top of a climb or a bump in the road is none. The press needn't be
timed: one up to `TRICK.early` before the kart is that far up is the trick as it gets there
(`KartState.press`), one anywhere up a ramp that's carrying it up as fast as a hop would makes no
hop and keeps to the lip (but one a drift begins with is spent on the drift), and one up to
`TRICK.late` after landing from a flight with no trick in it (`KartState.down`; a flight, so down
as fast as a fall from `TRICK.clear`, not off a kerb or a bump) is that trick late, boosting at
once. A boost pad (a footing whose
surface `boosts`, see Roads) under a kart rolling forward is a boost too: held at full for as long
as the kart is on it, the pad pushing it on as the gas would whatever its pedal, and for `PAD.hold`
after it leaves, unless the boost it came with has longer left; one parked on a pad is let be.
`turbo` is any of them, by how long it holds, and `boosts` counts each as it begins (a pad's as the
kart rolls onto it, `KartState.pad`), so one begun while another still holds is seen to begin
like any.

A room's karts are its `Garage` (`garage.ts`), which the Room steps and whose hurts it deals out,
and every client is sent them (`karts` in `welcome` and `snap`, each a `Kart`: its `KartState`,
its paint, its wrenches and its driver). One is dropped `DROP_AHEAD` in front of whoever asks,
short of a wall down to right over them, from `DROP_HEIGHT` up; there are never more than two karts
for each player in the room, and one left empty `IDLE_SECONDS` is taken away. A person on foot gets
into an empty one by walking or jumping into it (`Garage.runInto`: any touch that doesn't hurt
them; bots are left out, and someone who has just got out isn't taken back in until they've stood
clear of it): what they hold and wear is put away till they get
out with E (the `exit` action; never while the room's game keeps them in it, `Rules.seated`, when no
way out is offered either), whatever move they were in stops, and they ride in its seat
(`PlayerState.riding`), their frames driving it (`my` the gas, `mx` the wheel, the `drift`
action held) and only what stands out of the seat hit by shots (`SEATED`); kit and bodies that
can't sit are refused till they get out. Everything that hurts is judged by how fast two things
close square to where they touch, nothing under 10 m/s and in step with the speed from there, to
the nearest quarter of a heart or a wrench:
hearts off a player on foot a kart runs into (`IMPACT`, 5 at 20 m/s), who is thrown back hard (and
5 off one it comes down on), credited to its driver, else whoever last drove or dropped it; and
wrenches off a kart (`WEAR`, 2 at 20 m/s, so it takes crash after crash flat out) from a wall or
another kart (which also part by their `weight`s) and from the ground it lands on, more gently
still (`LANDING`: half how fast it comes down counts, so it's worn only from a 10 m drop), and a
bullet's damage from anyone, a bullet stopping at a kart nearer than whoever it would have hit (a
spray, fire or ice, washes over a kart as over a dragon's crystal), and a ground pound's or a
strike's that reaches it (`Garage.within`), which its driver is sheltered from. At
no wrenches it explodes (`boom`): it's gone, its driver is left where they sat, and everyone on foot
within `BLAST.reach` with nothing between takes `BLAST.damage` and is thrown away from it (its
driver high and back off its tail, `BLAST.driver`, so the blast is before their eyes and whatever
it ran into beyond that),
credited to whoever took its last wrench; what wore it down never reaches the driver. A kill by a kart is
announced as one (`kill` with `item: 'kart'` or `'explosion'`), and a death of one's own doing in
one as `crashed`.

A kart's model is written by `scripts/kart-model.py` from a rip of a Mario Kart 8 body and tire
set, sized as MK8 sizes it against Mario and a tenth bigger (`ROOM`), so he sits in it with room: its parts (`body`, the `steer`ing wheel that turns, the
`emblem` and one `tire`, each simplified to its size) and their pictures in
`public/assets/models/kart-<id>/`, and `render/vehicles/<id>KartModel.ts`, read through
`KART_MODELS` (`render/vehicles/kartModel.ts`): where its tires stand (the tire set's own, at MK8's
size, each centred along the kart on its axle's hub with its outer face flush with the body's side,
on the edge of its wells, all four on the ground), the steering wheel's middle,
the axis it turns round and the grips a driver's hands take on it (a wheel's rim or a handlebar's
ends alike), the seat, where a driver's feet rest (against the pedals, or as far forward under the
nose as a foot fits), where its exhaust pipes end and the way they point, and where an emblem's
picture goes on the patch on its nose. A kart wears the livery of whoever dropped it (see
Liveries): the body is one picture with its two painted colours
left white and a second saying where the primary and the secondary go, painted on the client in
whichever colours, and the emblem's picture is set on the patch's canvas there.
The script prints the box the sim drives it as, for its row in `KARTS`. `render/vehicles/KartMesh.ts`
draws one: its tires rolled by how far it went and the front pair steered, its steering wheel
turned, the body tipped to the ground under its tires, all at its size, eased there; its files are
sent for ahead (see Client loading), and it's drawn once they're here. Its body is sprung over its
tires, so a hop reads as one: kicked up off them as it begins, the tires hanging under it in the
air, driven down onto them as hard as it lands, and leaning the hop's way through it (the wheel's, until the hop has one) and,
less, the drift; it's kicked again as its drift reaches each spark and as a boost begins, its nose
up while the boost rises, and through a drift it's turned into the turn, its tail out, its driver
with it. `KartMesh.update` says what it sees its kart begin from one frame to the next (`Began`:
a hop, a landing, a trick, a boost, a spark, a knock), which its effects and `Driving`'s sounds
go by, so nothing else keeps a kart's last state to compare. What it gives off is `render/vehicles/KartEffects.ts`, each made the first time the kart
needs it: at each back tire, smoke through a drift (the grey "+"s of a poof, thickening up to the
first spark, so something is seen building), and in the colour of the spark the drift has got to
(blue, yellow, purple), electricity crackling at its base for as long as the spark is held (jagged
bolts that flicker where they stand, over a glow) and sparks flying out from under it, with a burst
of both as each spark is reached, all kept in the kart's own frame so they stay at its tires at any
speed; and flames out of the mouths of its exhaust pipes through a boost, streaked the colour of
the spark its drift was let go on (`turbo.spark`; a trick's are plain fire); and through a trick
its twinkles, four-pointed stars that swell and are gone, a burst round it that turns with its
twirl and a trail of them left along its flight. A knock that costs it
wrenches flashes it grey and is heard (`Driving.onKnock`), and one blowing up (`boom`) is a blast
(`render/Blast.ts`: a flash, fire, smoke and bits) and its sound (what's heard of a kart is said
further down). `game/Driving.ts` is
the rest of driving on the client: every kart drawn, the driven one where its driver's prediction
has it (`Prediction` rides it as the Room does, rewinding and replaying it with them), run on
between its ticks by a part of a step on the keys of their last frame (`Prediction.kartBetween`),
so it, its driver's eye and their look move on every frame drawn rather than thirty times a
second; the look
turned with the kart and settled back behind it once the mouse is let be; and the drift on Space
and E to get out (`KART_ACTIONS`). A driver is watched as their kart is (`KART_VIEW`,
`game/View.ts`: a boom from its seat at its size, low and far enough back that all of it shows,
and one field of view, so a kart sits in one place on screen whoever drives it; through a boost
the view opens out and the camera closes in, `RUSH`, by how far into one the kart is,
`Driving.rush`, so the kart stands a little bigger while the road streams out past it, and streaks
fly outward past the edges of the view, `render/vehicles/SpeedLines.ts`: one mesh on the camera,
made at the first boost and drawn only through one), their legend is the
kart's keys and the hint bar says how to get out, and on touch the pad steers alone and the
jump button gives way to the pedals, DRIFT (grey, a bar over the other two, reading TRICK while a
press would be one, `canTrick`), BRAKE and GAS (red), holding Space, S and W, with OUT up under CHAT and no SELECT (a tap on the view opens a cube).
Their kart's wrenches are a row of pixel wrenches under their hearts (`Hearts` with the `wrench`
sprite), and on a mouse device a gauge under those (`ui/KartGauge.ts`) says how fast the kart is
going along its nose and how fast that's changing (`Prediction.kartPace`: a tick taken ahead on
the keys held, so it's the kart's acceleration now, not a difference between frames); what else
stands under the hearts (the area's title, the condition's banner) stands under them both
(`--under-hearts`). A kart driven off the floor lands on the ground past the edge with its driver alive in it
and no way back up but Lakitu's (`stranded`, and the rescue below); the red box (`ui/Alert.ts`)
tells the driver they're off the map and that he's coming. A tick the Room steps a driver's kart with no frame (theirs is late) is taken on the keys
of their last, ahead of the frame it stood in for, which is then taken for its keys alone
(`Garage.drive`): a kart steps once for each of its driver's frames, as their client predicted,
however late they come. Past `AHEAD_TICKS` of that its keys are let go and it rolls to a stop. A kart's meshes and its livery's materials are made once per scene and
shared by every kart of that model and livery, so a kart let go disposes its own nodes alone.

A kart stranded on the ground past the edge is fished back by Lakitu (`sim/vehicles/rescue.ts`),
a feature apart from the rest of driving: the kart's step hands a kart in a rescue to it
(`stepKart`, `KartState.rescue`, there only while one runs), the garage keeps its watch
(`Garage.drive`) and the Room lets nobody out of his hands, and that's all the sim knows of it.
Once a driver has sat stranded `RESCUE.wait` (2 s, hops not counted) the Room begins their kart's
rescue, a timeline (`RESCUE`) the kart is held along whatever its keys (`carried`): still while he
comes, hoisted `RESCUE.height`, hung while its driver's view closes, carried across in the
dark, lowered as the view opens again, and let go at rest, about 4 s in all. Nothing else about it
or its driver changes: wrenches and hearts are as they were (the fall onto that ground costs what
a 10 m landing does, as before). It's set down where it left the world (`Watch`, kept by the Room
for each driven kart: where it last stood on the world and the way its nose pointed), in the
middle of the track there, nose along it the way it was pointing (`backOnTrack`: found by walking
the ground with `groundAt`, out to the nearest edge, across to the far one and along the near
one, so it knows nothing of roads and works on a deck, a ramp or anything laid later; about a
millisecond, once a rescue); where what it left is wider than a road (an island, a road left
over its end) it's half a road in from the edge, as it pointed. The client draws him
(`render/lakitu/`): `Rescuers` stands one `Lakitu` by each kart in a rescue within
`SCOPED_SIGHT`, anyone's, coming down from up ahead of it over `RESCUE.come`, his hook on its
nose and him to its right, facing its driver, bobbing on his cloud, and going back up the way he
came once it's let go; the driver's own view is closed by `ui/Iris.ts` (`shutAt`: black but for
a circle that closes in on their head and opens out from it again, under the HUD). His model is written by
`scripts/lakitu-model.py` from the rip of MK8's referee, a Collada file of skinned meshes with no
animation: the script turns his joints into a pose (`POSES`: `fishing`, with the rod in his fist
and one of his four faces) and carries the skin along by its weights, so a new pose is a row
there, and writes each thing he holds beside him (`hook`; and `flag`, `lap`, `reverse` and
`signal`, with `props.png`, which nothing draws yet). To other players a rescue is a kart
hoisted, gone and set down, with him there if they're near.

What's heard of a kart is `KART_SOUNDS` (`audio/Sfx.ts`), every one `lazy` and sent for as the
first kart is seen. Its engine is two loops crossed over by its revs (`kartLoops`: its speed's share
of its top speed, and no less than a quarter of how far its pedal is down, `KartState.gas`, so the
gas is heard the moment it's pressed): the idle, all but unheard except from its seat, and the
running loop, a steady stretch of an engine played faster and slower by the revs (`setLoops`'
`rate`) and louder with them. A drift on the ground is its skid, an onset and then a loop, kept
quiet, and each spark the drift reaches a zap, a minor third higher than the last
(`Driving.onSpark`, `SPARK_RATE`); every boost beginning, one over another still held too, is its
rush, with its driver's cry if their look has one (`Driving.onBoost`, `VOICES`' `boost`), a trick its chime (`Driving.onTrick`), a knock that costs
wrenches its crash
(`Driving.onKnock`), and a kart blowing up its bang. The kart the player drives is heard flat and
any other from where it is, and only those within earshot are played at all, so a room full of
karts costs the few that are near. A loop here is cut on exact samples and encoded as a theme's is
(see Player classes), so it repeats without a gap.

A kart is in every menu a command or a key is: the commands card's `vehicle` group (its
`command`), the guide's Items tab under Karts (standing empty in Mario's paint, its numbers read
off its row and `kart.ts` in `guide/stats.ts`, its words `KART_TEXT`), and the
guide's Kart controls, the legend's `DRIVING` cells.

A driver sits in their kart as it's drawn: `KartMesh` puts its `Seat` (`render/vehicles/Seat.ts`)
each frame, the seat's middle and the kart's turn, tipped with it, and in its frame the grips
turned with the wheel, the feet and the top of the wheel's rim, and karts are drawn before bodies,
so a body sits where its kart is that frame. Every figure on foot `sit`s (`Walker.ts`): its hips on
the seat, back from its middle as far as keeps its trunk (measured off its vertices) behind the
steering wheel's middle, its legs straight out to the pedals or, longer, to the floor under the
nose, and, with two arms, a hand on each grip, the body leaning back or forward as far as brings its
hands there, and into the turn; a big one is cramped in, round the wheel and through the nose. A
driver's head faces ahead whatever their look: with nothing in hand to aim, the look is the
camera's alone, free to come round and see their face. A
jointed body drives as Mario Kart 8 Deluxe has its character drive: its `kart` clips
(`<name>KartClips.ts`, baked by `scripts/kart-clips.py` from each character's driver file, which
`scripts/bfres.py` reads, through `clips.py` with the hips sat rather than stood) at the wheel,
backing up, drifting each way, on a mini-turbo and in the hop into a drift, each steered (its frames
run the wheel from full right to full left, sampled where the kart's wheel is) and eased into the
next as the kart's `Seat` says what it's doing; stopped a second, waiting; hit, its hands off the
wheel. Its hips go on the seat back as far as keeps its belly behind the wheel (`Rig.seat`), and the
hands a clip keeps on the wheel are closed on the kart's own grips (`Rig.grasp`), since MK8's
wheels stand elsewhere. The driver files come whole in retexture mods (the script's docstring says
which), the animations as the game has them.
A trick (`Seat.trick`, timed by `KartMesh` from the press, `TRICK.seconds`, on through the landing)
twirls the kart's drawn body a whole turn its way under its driver, the seat staying put, and one
neither way leaves the kart as it is: a jointed body plays its trick that way (`trickL`, `trickR`:
MK8's trick that spins a whole turn that way, or the other way's mirrored, so it spins with the
kart; and `trick`, for neither way, the one of MK8's others that lifts its hips least, a little
jump in place), and every other figure is thrown up out of the seat standing with its hands up and
back down whichever the trick (`Seat.leap`, `WalkerAvatar.thrown`).
Plankton, too small to reach the pedals, stands on top of the steering wheel and runs on it
(`Plankton.ts`). The sim knows a driver only by their seat (`kart.ts` `seat`, `SEATED`), so a body
sat in a kart and its hit shape agree only roughly.

## Weapons

A weapon is a row in `ITEMS` (`packages/shared/src/sim/items.ts`: range, damage, cooldown, its
actions and their keys (a shot has none: it's a click, or the touch FIRE button), the shape of its
fire, its `element` and its tank), a shape in the client's
`render/Weapons.ts`, and a sound in `audio/Sfx.ts` (`ITEM_SOUNDS`). A hold weapon with an element
gets its tank on the back and its jet at the nozzle from that alone, on every avatar and in the
viewmodel (`render/Jet.ts`: blocks of fire, or for ice the "+" crystals of a corpse's poof, drawn as
one particle system; a cone from a point, or from a line across a dragon's mouth, `DragonLook.mouth`). What a hit does besides its damage is the Room's (`room.ts`, `applyActions`;
a hit that throws its victim is a `throwWalker` there, see Surfaces and frost):
ice chills for `CHILL_SECONDS` from the last touch (`sim/constants.ts`), a walk at
`CHILLED_SPEED_MULTIPLIER` counted down in `stepPlayer`, so prediction agrees, and fire's touch
thaws it at once, as it melts frost (see Surfaces and frost). On the client
`HitFlash` frosts a chilled body over, `ui/Condition.ts` shows the chilled player the counter
with the view frosted, and the hint bar under an ice weapon is frosted white (`Hud.setItemHint`).

## Menu

The menu (M or Esc, or the gear over the room panel) is `packages/client/src/ui/menu/`, and the rest
of the client knows it only by its hooks: `Menu.ts` builds its button and card, has the keyboard
while it's open and syncs with the player once a frame; the game opens it whenever the pointer is
let go with nothing else to use the mouse on (Esc, which the browser answers without a key event, a
click outside the page), so a free mouse always means the menu, the chat, a card or the death
screen is up, and M, Esc or a click beside the card goes back into the world; `tabs.ts` is what's in it, rows that read and change what
other parts keep (the connection, `Sfx`'s channels, `View`, the browser's fullscreen, the `Picture`),
handed in as `MenuHooks`; `rows.ts` is the kinds of row (a toggle, a stepper with < and > and maybe
an AUTO button, a field, buttons, a link to share, words to read, a board of players in columns
whose players are dragged or tapped from one to another) and how each draws, a button able
to come and go, to be greyed, and to warn of what it does and go at a second press
(`ui/pressTwice.ts`, as every way out of a room warns its room master that leaving closes it); and
`menu.css` is its look. A tab can come and go (`Tab.shown`) and be the one the menu opens on
(`Tab.first`): the GAME tab is there in a room with a game, and its room master's menu opens on it
(see Game modes). A section can come and go too (`Section.shown`): each mode's settings are a
section of the GAME tab (`modes/index.ts` `MODE_SETTINGS`, the mode's own rows), there in a room of
that mode. What a mode's game has on the HUD while it's played is its to say the same way
(`MODE_HUD`: the line over the view, the top right, a leaderboard), drawn by the shared
`ui/GameBanner.ts`, `ui/Scores.ts` and `ui/Results.ts`. A
new setting is a row in `tabs.ts`, and a new kind of row a type and a case in `rows.ts`. The PLAY
tab opens on a window (`Preview.ts`) with the player's own body in it and the map in a square in
its corner (on touch, the other way round), the two swapping places at a click on the small one, and under it the hint to press C
(which closes the menu and opens the commands, as it would from the world). The body is a second
`Engine` on a canvas of the card's, built the first time the tab is seen and drawn only while it
is, where the world's own avatar builders stand the avatar on a floor ruled in metres that fades
out toward its edge (a dragon hovering over it, its head weaving and its body trailing as the sim
would keep it), holding what the player holds and as the player is (`Me`: frosted over, a
dragon's crystals shot out, sat in the kart they drive, seen through as a ghost), so every skin's own idle motion runs there too; the view turns on
its own and under a drag, from above or below (the floor fades out as the view comes down to its
level). The map (`menu/Map.ts`) is the HUD minimap's view, CLOSE, WIDE or WORLD (the first two
centred on you and turning with you, 32 m and 100 m out to the nearer edge, WIDE to start with; P steps one wider, and
from WORLD back to CLOSE), drawn by the same
renderer (`ui/MapCanvas.ts`, which draws a `MinimapFrame` onto any canvas at the size it has; the
HUD's `Minimap` is a panel round one, and keeps the view and the latest frame for the menu's),
with the same toggle (P too), a wheel or a pinch to zoom it and a drag to slide it; on touch,
where the HUD has no minimap, it's the only map. Its ELEVATION button, apart from the views, lays
the world's heights over the floor in whichever view is up (`ui/Elevation.ts`, as the guide's map
does), in the landmarks' place, with the scale they're coloured by. A texture a renderer draws once and shares (the
shadow, a storm's fog) is made per scene (`render/perScene.ts`), since a second
scene can't use the first's.

The commands card (C, or the CMDS button, `ui/CommandsMenu.ts`) is every command as a button, on
every device, grouped as `ui/commands.ts` lists them. Opening it frees the mouse, as the menu does,
and closing it (Q, C, a click beside the card, or on touch any tap) takes the mouse back; a click
on a button sends its command and closes the card, so what the command did is in view, and a
button whose command takes options (the bots') is greyed and opens the chat with it typed, to
finish there. One the room's game refuses (`refusedBy` in `ui/commands.ts`, which asks the mode's
rules as the Room does, see Game modes) is greyed further, there and in the chat's completions, and
at a press says why in the red box, the card staying up. The chat completes what's typed itself: the commands the text could be the start
of (`completionsOf`, by name then by shortcut) stand up from the box's top over the log, the best
nearest the box, Up picks from the bottom, Down goes back toward the text, Enter or Tab fills the
box with the pick; with no completions the arrows recall what was sent, as ever. Nothing else
completes anything.

Whatever says something's wrong or can't be done says it in the red box over the view
(`ui/Alert.ts`, `#alert`): `flash` for a moment (a command the Room refused, its reason in the chat
log too; a commands button that needs its options typed), `hold` for as long as it's so (a kart
driven off the map), a flash standing over what's held. A new warning is a call to one of those,
never a box, a colour or a timer of its own; what a click would do (`HitNotice.prompt`) and how
the player is (`Condition`) are not warnings and keep their own.

L is the bare view (`ui/bareView.ts`, on a mouse device): everything laid over the world put away,
so the picture is the world alone, and brought back by the same key, the game playing on under it.
It's one rule (`#app.bare`, styles.css) that hides whatever stands in `#app` but the view and what
the player opens themselves (the menu, the commands, a cube's card, the death screen, and the chat
while it's typed in), so a new overlay is put away with the rest, and one the player opens goes in
that rule's list.

Anything that scrolls (the menu's and the commands' bodies, the cube card's body under its
bar) stands in a `.scroller` beside the rail of `ui/scrollRail.ts`, in place of the browser's
own bar (hidden in styles.css): a column of its own at the right, set first, the content drawn in
the room that's left with a clear gap between, always there (dim, its thumb filling the track,
while everything fits), with a thumb to drag and arrows to press, the bottom one blinking while
there's more below. A new scrolling area goes in a `.scroller`, gets `railScroll(el)`, and has
its native bar hidden.

The picture's settings (`render/Picture.ts`, the PICTURE rows) are the size of its pixels (CSS
pixels per rendered one, `PIXEL_SIZES`; the frame is drawn that much smaller and the browser blows
it up with nearest sampling, the retro grid) and its frame rate (15 to 90 by 15, `FRAME_RATES`;
60 unless chosen).
`Engine.run` draws a frame only when one is due, each due the rate's interval on from the last, so
30 is every other tick of a 60 Hz display, 45 alternates one tick and two and comes out right over
time, and a rate past the display's is the display's. The pixel size is auto
unless chosen: auto starts at 1.5 on a mouse device and 2 on a touch one (a touch device that
reports under 4 GB of memory, where the browser says, goes no finer than 2), steps coarser when a fifth of the last two seconds' frames came late (held
past the tick they were due on, as `Engine.run` judges it against the display's tick, the
median of the last second's gaps between its runs), and tries a step finer as soon as the first
two seconds of frames judged keep up. A step that keeps up through two seconds of frames after
settling is kept and the next finer one tried at once, so a strong machine climbs from the
coarsest to the finest in about twenty seconds from the world's first seconds; a size held with
little to spare is tried past again after twenty seconds of keeping up; one that falls behind
steps back and waits twice as long before the next try (a change of frame rate, or auto taken up
again, starts the judging afresh, trying finer as soon as it keeps up), from a minute up to eight
and then every eight minutes for the rest of the session. The
tries never stop, and one that fails costs the player a few seconds of dropped frames (three
seconds settling after the resize, then a second of frames to judge) before auto backs off: the
price of finding the finest size the machine holds, paid only by a machine that can't go finer.
The world's first seconds and the hitch of a resize don't count, nor does a sleeping tab. A size
the page dies at (the GPU dropping the context, which reloads the page; or the
tab killed in the trial of a step finer, which a marker written before the step and cleared on a
clean unload tells the next load) is pinned off for the device in localStorage, a step coarser
than it being the finest auto tries from then on, since memory gives out at the resize, before
any frame is timed. A size chosen finer than where auto has got to (`Picture.autoLevel`) gets a warning under the
row that the game might crash, one finer than the device is trusted with (`Picture.limit`) that it
has crashed there or that the device's memory is too little, and auto taken up again starts from
where it had got to. Fill is what this game
spends on (fog, frost, jets, ice, MSAA, bloom), and it goes with the square of the pixel size, so
2 is a quarter of the cost of 1.

A rename is the `rename` message: the Room cleans the name as it does a joining player's, refuses
another within `RENAME_SECONDS`, and tells the room. Names ride in every snapshot, so the roster, the
labels over heads and the bots follow; a name is only a name, giving its player nothing. Switching rooms
is a page load through `roomLink` (`net/lobby.ts`), the link an invite is, with the player's name and
skin on it.

The home screen (`app/home.ts`) is the room on the left (a JOIN tab, the default, with JOIN GLOBAL over a code, and a CREATE tab;
the lobby, or Node in dev, turns away a create on a running room and a join on none, back to home
with `?error=`; global is always there to join, and so never anyone's to create; the CREATE tab
picks the room's game mode from a dropdown with the mode's line under it, `GAME_MODES` in the shared
package's `modes/index.ts`, the ones that can't be played yet offered only in dev or with `?modes` on
the page, and the pick rides the create as `?game=`: the lobby keeps it with the room's session and
hands it to every join, the room server makes the Room in it (`RoomOptions.mode`), and `welcome.game`
tells everyone)
and the player on the right: a `BodyView` of the chosen skin with the typed name over its head, the name, and a dropdown of every look
on foot (no dragons) a person can switch to by command (the first, the standard body in a named
color drawn afresh each load, so the choice is kept but not the color; last, the standard body in each
named color; a color rides as `?color=`), both kept in localStorage. The skin
rides the join as `?avatar=` (through the lobby on the launcher), and the Room puts a person in it if
it's one on foot they could switch to.

## Guide

The guide (`world.kathirm.com/guide/`, `packages/client/guide/index.html` and `src/guide/`) is a
second Vite page: every character, item, kart, place, game mode, bot and command in tabs. A character stands
in a `BodyView` (`render/BodyView.ts`, the menu's player view), or at its ON FOOT / IN KART toggle
sits in the Standard Kart in their own paint (`Shown.kart`: the view parks a kart on its stage and
seats the body in it, `parkedKart`; a dragon has no toggle); an item, a heart or a résumé cube
floats on its own in one, and a kart stands there (`BodyView.syncThing`, built in `guide/things.ts`
from the shapes the game draws them with; a thing drawn with the scene's shared materials, as a
kart is, says so, `Thing.shared`, so they outlive it), framed by its measured size, or by the box
it gives (`Thing.bounds`) where its meshes are fetched, as a kart's are. Its numbers are worked out in `guide/stats.ts` from the
registries the game runs on, never typed in: a table's value is a number and its unit (or a command
or a key to type), never a sentence, with the keys that do an ability in its heading, and a thing's
tables hold only what its own row changes, never a constant every one of its kind shares. Its words
are `guide/content.ts`, keyed by the
registries' ids, so a new skin, item, gear, kart, pickup or game mode doesn't build until it has an entry there
(a mode's numbers are its own to give, `MODE_FACTS` in the client's `modes/index.ts`, and only a
mode that can be played is listed):
plain statements of what each thing is (Kathir writes anything more, and the fun facts), no numbers.
A character's SOUNDS are a button for every sound it makes that not every look makes alike
(`guide/sounds.ts` `linesOf`): what it says (`VOICES`), the sounds of the moves it has, its own
footsteps (`GAITS`) and a dragon's roars, rise and theme, leaving out what every look makes the same
(the swoosh, the thuds, the hurt sound). A move's sound is a function of the look in
`audio/voices.ts` (`twirlOf`, `swingOf`, `shimmerOf`) that the game plays and the guide lists, never
a literal where it's played, so a look can't make a sound the guide doesn't show: a new look's or
move's sound goes through one of those, or a new one, and into `linesOf`. The World tab opens on the world's map (`MapCanvas`, to drag about and zoom, `ui/mapControls.ts` as
the menu's map is), with a MAP and ELEVATION toggle: elevation is the floor under how high everything
on it stands (`ui/Elevation.ts`, a picture a pixel a metre of `Structures.groundAt`, worked out a few
rows each time `MapCanvas` draws it until it's all there, coloured by the root of the height so a
road's bank reads beside the tower), with its scale (`Elevation.legend`, which each page styles) and
the height under the pointer. Any map shows it by handing `MapCanvas.draw` or `drawWorld` the
picture; the menu's map does too. Its photos are in `public/assets/guide/places/`, taken in the game offline, each with a `-thumb` for its gallery. The Gallery tab is the game as it's
played, three photos to a row (`GALLERY` in `guide/content.ts`, `public/assets/guide/gallery/`, taken the
same way with the HUD hidden, 1600 × 900 with a 480 × 270 `-thumb`), and the README's Photo Gallery
shows the same files: a new one goes in both.

A diagram in the guide (each bot's page has one but the observer's, `guide/botDiagrams.ts`, keyed
by `BotId` so a new bot doesn't build until it has one or a null) shows what something does, seen from above, and is built from the
marks of `guide/diagram.ts` alone (`Diagram`: the subject, people, other bots, walls, rings, the
strokes `move`, `detour`, `look`, `turn` and `shot`, a crosshair and labels) on its 640 × 360
canvas, coloured by the `.diagram` rules in `guide.css`. Never colour or size a mark inline or add
one outside the kit; a mark a diagram needs that the kit lacks is a method and a rule there. Labels
are plain words like the rest of the guide's, no numbers, short (a line is about 25 characters),
with `note` for anything beyond the headline. Screenshot every diagram at desktop and phone width
before the PR and check nothing overlaps. This is the guide's style only; the architecture diagrams
in `docs/` keep their own.

## Adding a Modal bot

A bot is a headless Python client in `modal-bots/bots/`; it joins the same authoritative Room as
browser players and receives the same WebSocket protocol. It has no renderer, browser
interpolation, or visual picking.

### Required contract

A bot runs on one of the bots app's two Modal workers, and its signature is what that worker gives
it. A dumb bot (circle, stalker, observer) runs on `run_dumb_bot` and satisfies `DumbBotInvocation`
in `modal-bots/bots/__init__.py`; a combat bot (the sniper) runs on `run_combat_bot` and satisfies
`CombatBotInvocation`, which adds `targets`, the parts of player names it goes after (any case;
empty means every person). Make a bot a combat bot when it takes names from chat. Either kind loads
the maps of the world it needs itself (see the shared runtime below).

```python
async def run_example_bot(
    room: str,
    name: str,
    seconds: float,
    *,
    lobby_url: str | None,
    direct_ws_url: str | None = None,
    spawn: Vec3 | None = None,
    avatar: str | None = None,
) -> dict[str, Any]:
    ...
```

A combat bot also takes the names it goes after (`CombatBotInvocation`):

```python
async def run_example_bot(
    room: str,
    name: str,
    seconds: float,
    *,
    targets: tuple[str, ...] = (),
    lobby_url: str | None,
    direct_ws_url: str | None = None,
    spawn: Vec3 | None = None,
    avatar: str | None = None,
) -> dict[str, Any]:
    ...
```

- Put it in `modal-bots/bots/<name>_bot.py` and call it `run_<name>_bot`.
- Call `validate_duration(seconds)` before starting work.
- Return a JSON-serializable dictionary. Never return a live connection, dataclass, task, or token.
- `lobby_url` is used in production. `direct_ws_url` exists only for local tests.
- Pass `spawn` and `avatar` straight through to `connect` (see the placement fact below).
- Do not add a Modal decorator to a bot. The workers in `modal-bots/app.py` choose a registered
  invocation and supply the lobby URL from the `kathir-world-bots-config` Secret.

Register the function explicitly in `modal-bots/bots/__init__.py`:

```python
from .example_bot import run_example_bot

DUMB_BOTS = {
    "example": run_example_bot,
    # ...
}
```

A combat bot goes in `COMBAT_BOTS` instead.

The registry key is the `--bot` CLI value; the in-game player name is `<key>-bot` unless the caller
names it (`-n` in chat, `--name` with `modal run`). Do not use dynamic module
discovery: an explicit registry is easier to audit and gives invalid names a deterministic error.
No change to `app.py` should be needed for an ordinary bot.

### Use the shared runtime

Bots must use the modules under `modal-bots/common/`:

- `connect(...)` owns lobby admission, session-token redaction, authenticated WebSocket setup,
  one retry on stale authentication, welcome validation, JSON transport, and clean close.
- `WorldState(connection.welcome, connection.room)` owns the latest authoritative players, cubes,
  health, deaths, and server tick. Apply every received message before making the next decision.
  `state.nearest_player(people_only=...)` is the closest living player in a straight line, never
  a ghost (`Player.ghost`: in the room and not in its game).
- `Controls(connection)` owns input sequence numbers and persistent input intent.
- `run_input_loop(controls, stop)` sends that intent at the server's 30 Hz tick rate without drift.
- `log_kill`, `log_death`, and `log_message` write structured JSON to Modal's normal function logs.
- The maps of the world (`common/map/`, see Checking a change) are a loader each, read once per
  process and shared by every bot in it. Load the ones a bot needs as it starts, and no others:
  the circle bot takes all three below, the sniper the same, and a bot that only watches none.
  - `load_solids()`: `solids.clear(a, b)` is the sim's line of sight (what a shot can pass), and
    `solids.ground_at(x, z, reach)` the ground under a spot for feet that reach that high (a
    structure's top, the floor, or the ground past its edge), both anywhere in the world.
  - `load_ground()`: `ground.node_at(feet)` and `ground.path(start, goal, avatar)` find a way
    between the spots a player can stand on a 1 m grid round whatever stands and the rectangles of
    open floor between (`ground.areas`), up the stair and over the rail where only a jump gets
    there, and only by the jumps that avatar's walk and jump power make (`ground.jumps_of`). It
    covers the floor the buildings stand on: out on a road `node_at` is None.
    `Route(ground, path, tick, avatar)` (`common/navigation.py`) walks it, across open floor
    straight for the furthest node of it in reach (`ground.straight`): call `route.steer(me.pos,
    tick, controls)` on every snapshot after `look`, and plan again when `route.stuck(tick)`.
    `controls.walk_toward(origin, target)` moves toward a point whichever way the bot is looking.
    `ground.lookouts` are the high spots with a wide view (balconies, decks), `ground.places` the
    same by where they are (`tower`, `building` or `elsewhere`), `ground.insides` the floors inside
    the tower's and the keeps' walls and `ground.indoors` every spot within those walls (the
    stairs too).
  - `load_bodies()`: `bodies.hitbox(avatar)` is what a shot at that avatar has to land in (head
    band included), `bodies.eye_of(player)` where it shoots from and `bodies.walk_speed(avatar)`
    how fast it walks.
  - `load_roads()`: `roads.nearest(spot)` and `roads.path(start, goal, gaps=False)` find a way
    along the roads' middles, across a gap only for a kart (`gaps=True`).

Bot files must not import `httpx` or `websockets`, parse raw JSON, copy lobby/token code, manage
`InputFrame.seq`, or log a token-bearing redirect or authorization header.

### Controls and interactions

Use `Controls` instead of constructing client messages:

```python
controls.move(forward=1, right=0)   # values are normalized to the unit circle
controls.stop()
controls.look(yaw, pitch)
controls.look_at(state.me.pos, target.pos)
controls.jump()                     # one input frame
controls.fire_once()                # one press frame, aimed where it looks now; the next releases it
controls.shoot(True)                # persistent hold, e.g. flamethrower
controls.shoot(False)
controls.scope(True)
controls.thrust(True)               # hold a worn jetpack's lift (after /jetpack)
controls.run(True)                  # hold the run: the walk 60% faster, except scoped
controls.read_cube(cube_or_id)
controls.use(door_id)               # one frame clicking the door it looks at (Route does this)
await controls.chat("hello")
await controls.command("sniper")    # sends /sniper
```

There is no generic server-side click message. Browser cube clicks are local visual picking and
become the `reading` field; use `read_cube`. Attack clicks become the `shoot` action; use
`fire_once` or `shoot`. A door click is `use`, judged against where the bot looks. A way from
`ground.path` keeps out of doorways unless asked (`doors=True`), and a `Route` given
`doors=state.doors` opens the shut doors on such a way. Sky-object clicks are entirely client-side and have no server interaction.

Tap weapons require a press frame followed by a release frame. Hold weapons require `shoot` on
every frame. Sniper shots require scope to remain enabled, and a scoped player walks at 30% speed
and can't jump. Run exactly one input loop per connection; never call `send_input()` concurrently
from multiple tasks.

### Active-bot lifecycle

An active bot generally has one receive loop and one input task:

```python
connection = await connect(
    lobby_url,
    room,
    name,
    direct_url=direct_ws_url,
    spawn=spawn,
    avatar=avatar,
)
state = WorldState(connection.welcome, connection.room)
controls = Controls(connection)
stop = asyncio.Event()
inputs = asyncio.create_task(run_input_loop(controls, stop))

try:
    async with asyncio.timeout(seconds):
        while True:
            message = await connection.receive()
            state.apply(message)
            # Read state and update controls here.
except TimeoutError:
    pass
finally:
    stop.set()
    inputs.cancel()
    with suppress(asyncio.CancelledError, RoomConnectionError):
        await inputs
    if connection.close_code is None:
        await connection.close(reason=f"{name} complete")
```

The observer is intentionally simpler because it never sends input. Use `circle_bot.py` as the
reference for an active receive loop plus 30 Hz input task. A dead person is brought back in their
own seat after ten seconds (see Death and respawn); a dead bot never is: its corpse lies five
seconds, then the Room drops its seat and closes its connection with the reason `dead`, which ends
its run (stop the input task and keep receiving, as `circle_bot.py` does). A death from `/kill-bots` has no kill event, so react to `state.me.dead`,
not to the event. A bot that should respawn instead must close, wait for the chosen respawn
delay, and call `connect` again. Reconnection creates a fresh player ID; there is no resume
protocol.

### State and combat facts

- Snapshots arrive at 30 Hz and contain exact global player and cube state. Bots do not need
  browser interpolation.
- Look is client-authoritative; movement, jumping, shooting, damage, and death are
  server-authoritative.
- `Player.pos` is the body's eye point, 1.7 m up whatever the avatar, in three dimensions: structures
  put players on floors, stairs and bridges, so `y` varies (feet are at `pos.y - 1.7`). Use
  straight-line distance, not `x`/`z` only, when choosing targets. Yaw `0` faces `+z`; positive pitch
  looks down, and `look_at` aims in 3D. An avatar's own eyes (`AVATARS[id].eye`;
  `bodies.eye_of(player)`) may sit higher or lower, and its wearer looks and shoots from there, so aim
  from `bodies.eye_of(me)`.
- `Player.hearts`, `Player.kills` and `Player.deaths` are the scoreboard; a person's `Player.dead`
  is true until the Room brings them back, a bot's until its seat is dropped.
- Snapshots carry the floating pickups (`state.pickups`); walking into a heart below full health
  gives back 3 hearts, up to 10, and a `big-heart` (left where someone died) all 10.
- Falls hurt by landing speed: slower than a 15 m drop from rest is free, as fast as an 80 m drop
  takes every heart, and damage rises linearly between, in half hearts (a jetpack that brakes the
  fall lands slower). That arrives as a `hit` with `shooter: None`, and a fatal fall as a `fell`
  event rather than `kill`. Stood on the ground past the world's edge a heart goes every half second
  (a `hit` with `shooter: None`) and death there is an `out`: a bot that walks off the floor has
  no way back up but a jetpack, so keep routes on the map. A death by one's own
  kart is a `crashed` event.
- Snapshots reveal players globally, and shots pass through cubes; only structures block them. Perfect aim
  can therefore be much stronger than a human player. Fairness constraints such as field of view,
  reaction delay, aim error, and respawn delay belong in bot policy, not in connection code.
- Shots are lag-compensated: `Controls` sends the newest snapshot tick as `view`, and the server
  judges the shot against where targets were at that tick (`packages/shared/src/sim/rewind.ts`,
  at most `MAX_REWIND_TICKS` back). Aim at the snapshot you have; don't lead.
- A room seats 64 players, at most 32 of them bots. A bot is a visible player and occupies a seat. `connect` joins with
  `bot=1`, so `Player.bot` is true for every bot, the roster shows a robot icon, and a room with only
  bots left closes like an empty one (the server disconnects them).
- A bot may choose where it spawns and how it looks: pass `spawn` (a feet position, `Vec3`) and
  `avatar` through to `connect`, which puts them on the join URL. The Room honours them for bots only,
  clamping the spot inside the world and standing the bot on anything within a step of it, or
  leaving it in the air there to fall (and take the fall's damage); the avatar is
  fixed for the run. Any avatar whose class takes bots works (`classes.ts`; a dragon's is refused),
  including one with no chat command (`AVATARS[id].command` null) that people can't switch to.
- A bot can't join a room with no people in it: the lobby answers 409 and Node answers `no one here`,
  so a bot that spawns after everyone left never starts a room nothing would close. Local tests
  seat a person first with `connect(..., bot=False)`.

### Logging

Log meaningful behavior where it occurs:

```python
log_kill(name, victim.name, item="sniper", headshot=True)
log_death(name, killer.name, item="gun")
log_message(name, "target acquired", target=target.id, distance=distance)
```

Do not log every snapshot or input frame. Modal already timestamps stdout; the logging helpers use
`print(..., flush=True)` and emit one searchable JSON object per event.

### Tests required for a new bot

1. Add fast policy/unit tests under `modal-bots/tests/`.
2. Exercise movement and message flow against the real local Node server using
   `direct_ws_url`; do not use a browser.
3. Keep production access opt-in. Never create Modal sessions in normal CI.
4. Run:

```bash
python -m pytest modal-bots/tests
ruff format --check modal-bots infra
ruff check modal-bots infra
mypy
npm run lint
npm run typecheck
npm test
```

5. If protocol or simulation behavior changes, update the TypeScript source of truth and its tests
   first, then update the Python mirror and contract tests.

The production smoke test is:

```bash
RUN_MODAL_BOT_SMOKE=1 \
WORLD_LOBBY_URL=https://your-lobby.modal.run \
python -m pytest modal-bots/tests/test_production_smoke.py
```

Use an isolated room such as `bot-smoke`, not `global`, for automated or manual tests.

### Calling bots from chat

`/sniper-bot`, `/circle-bot`, `/stalker-bot` and `/observer-bot` start a bot in the caller's room, within 50 m
of them across the floor and at their height: on whatever is there within a step, or in the air to
fall from, never inside a wall. The sniper ignores the spot and starts indoors, in the tower or a keep. The `-bot` is optional where the bare word
isn't already a command (`/circle`, but `/sniper` is the rifle). Flags go in any order, each at most once, and each has a long form too
(`--time` for `-t`):

| Flag | Bots | Meaning |
| --- | --- | --- |
| `-t [seconds]` | all | how long it stays: 300 unless given, up to 3500 |
| `-n [name]` | all | what it plays as, instead of `<bot>-bot` |
| `-s [skin]` | all but the stalker | how it looks: any skin's chat command (`elizabeth`, `tung`) |
| `--target [name substrings]` | combat | who it goes after: the words up to the next flag, each any part of a name |

So `/sniper-bot -t 120 -n hunter -s tung --target kat bob`. A bare word, an unknown or repeated
flag, or a missing or bad value gets the usage line instead. The flags are one table, `BOT_FLAGS` in
`packages/shared/src/sim/bots.ts`: `commands.ts` parses it and the usage lines and commands menu are
written from it, so a new flag is a row there and a case in the parser. Names are taken as given,
and a name is only a name: nothing about a player comes from what it spells.

`/kill-bots` drops every living bot in the room dead where it stands, with no kill event; each
corpse is removed like any bot's, which closes its connection and ends its run.

The registry is `bots.ts` (id, player name, worker, blurb), which also fills the commands menu. The
Room validates (people only, a free seat, host must have a spawner) and calls `RoomOptions.spawnBot`
with a `BotRequest` for the bot's worker; `packages/server/src/bots.ts` implements it as one POST to
`BOT_SPAWNER_URL/<worker>`, the localhost sidecar `infra/bot_sidecar.py` that the Room container's
Python process runs. The sidecar spawns the worker's function (`BOTS_FUNCTIONS` in
`infra/config.py`: `run_dumb_bot` or `run_combat_bot`, each looked up once) with `{bot, room,
seconds}`, the request's `name` and placement (`spawn`, `avatar`) and, for a combat bot, `targets`,
using the container's own Modal credentials; Node never holds a token. A bot called from chat
therefore needs a row in `bots.ts` as well as its Python module; one without a row is started only
with `modal run`. A row's `look` is the one look that bot always wears (the stalker is always Tung
Tung Tung Sahur, the one body that shows where it looks standing still): `botRequest` dresses it so
and it takes no `-s`, and its Python module wears that look whatever it's given.

Rooms also start with bots: the first person to join brings the line-up from
`packages/shared/src/sim/defaultBots.ts` (`defaultBotsFor(room, rng)`: two circle bots anywhere, each in a different look drawn from `CIRCLE_LOOKS`, and a
Tung Tung Tung Sahur stalker in the middle of each of the tower's lower three floors), all staying 3500 s. Each entry may carry a
`BotPlacement` (`spawn`, a feet position, and `avatar`); edit that function for per-room profiles.
The Room spawns them once, with `caller: 'room'`.

### Modal and dependency constraints

- Configure the lobby once with the Modal Secret `kathir-world-bots-config`, containing
  `WORLD_LOBBY_URL`.
- Run a bot with
  `modal run modal-bots/app.py --bot <registry-key> --room <room> --seconds <n>`, which picks the
  bot's worker (`--name` renames it, and `--target kat,bob` aims a combat bot).
- Both workers share the same image, CPU allocation, Secret, and timeout, and run many bots to a
  container: they're async, so up to `MAX_BOTS_PER_CONTAINER` bots share one
  event loop, the autoscaler adds a container past `TARGET_BOTS_PER_CONTAINER`, and
  `MAX_BOT_CONTAINERS` bounds the fleet. A bot must never block the loop (no sync sleeps or I/O).
  If a bot truly needs a GPU, different dependencies, or a different timeout, define a separate
  Modal worker intentionally rather than adding conditionals to the existing ones.
- When adding a Python dependency, update both `modal-bots/pyproject.toml` and `bot_image` in
  `modal-bots/common/deployment.py`, then verify an actual `modal run`.
