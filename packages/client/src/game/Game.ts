// Ties everything together for one session in one room: renders the world, predicts the local
// player, interpolates everyone else, and forwards input to the room host through a Connection.
import { Ray, UniversalCamera, Vector3 } from '@babylonjs/core';
import {
  CUBES,
  GEAR,
  ITEMS,
  parseCommand,
  SKY_OBJECTS,
  TICK_DT,
  INPUT_WAIT_TICKS,
  WALL_FRAMES,
  INTERIOR_BUILDINGS,
  HOME_GROUND,
  stranded,
  atFullHealth,
  touchesPickup,
  shutAt,
  onOutsideGround,
  WORLD_GROUND,
  WORLD_OUTLINE,
  DOOR_REACH,
  lookVector,
  movesHelp,
  WORLD_STRUCTURES,
  ROAD_PADS,
  ROAD_RAISED,
  PINEAPPLE_HORN,
  Structures,
  actionForKey,
  actionHelp,
  classOf,
  lifeOf,
  createRng,
  hashSeed,
  isGrounded,
  poundOf,
  poundPower,
  strikeOf,
  crouchOf,
  floatOf,
  keyLabel,
  itemStats,
  lookDirection,
  resolveFire,
  type AvatarId,
  type FrostCell,
  type ItemAction,
  type ItemId,
  type ItemState,
  type Kart,
  type KillItem,
  type LifeSpec,
  type ClassSpec,
  type PlayerClass,
  type PlayerState,
  type ServerMessage,
  type Vec3,
  EYE_HEIGHT,
  KARTS,
  KART_ACTIONS,
  SEATED,
  eyeOf,
  seatedAt,
  statureOf,
  walkSpeedOf,
  SCOPED_SIGHT,
  SIGHT,
} from '@world/shared';
import { Footsteps } from '../audio/Footsteps';
import { Driving } from './Driving';
import { Rescuers } from '../render/lakitu/Rescuers';
import {
  ITEM_SOUNDS,
  KART_SOUNDS,
  SPARK_RATE,
  heard,
  kartLoops,
  levelAt,
  loopsOf,
  PLACE_THEMES,
  Sfx,
  voiceOf,
  type SoundId,
} from '../audio/Sfx';
import { BOOST_CRY, swingOf, take, twirlOf, VOICES } from '../audio/voices';
import { InputManager } from '../input/InputManager';
import { MobileActions, type MobileActionState } from '../input/MobileActions';
import { MobileControls } from '../input/MobileControls';
import { IS_TOUCH, onTap } from '../input/touch';
import type { Connection } from '../net/Connection';
import { Interpolation, type RemotePlayer } from '../net/Interpolation';
import { Prediction } from '../net/Prediction';
import { createAvatar, wantLook, type Avatar } from '../render/avatars';
import { wantKart } from '../render/vehicles/KartMesh';
import { CubeMesh } from '../render/CubeMesh';
import { Engine } from '../render/Engine';
import { Environment } from '../render/Environment';
import { Interiors } from '../render/Interiors';
import { FrostLayer } from '../render/Frost';
import { Loader } from '../render/Loader';
import { Models } from '../render/models/Models';
import { buildBoostPads } from '../render/BoostPads';
import { buildSkyline } from '../render/Skyline';
import { buildStructures } from '../render/Structures';
import { Pickups } from '../render/Pickups';
import { blast } from '../render/Blast';
import { poof } from '../render/Poof';
import { poundRing } from '../render/PoundRing';
import { WallFrames, type HungFrame } from '../render/WallFrames';
import { Viewmodel } from '../render/Weapons';
import { placeSkyObjects, type SkyObject } from '../render/SkyObject';
import { AreaTitle } from '../ui/AreaTitle';
import { Bubble } from '../ui/Bubble';
import { CommandHint } from '../ui/CommandHint';
import { CommandsMenu } from '../ui/CommandsMenu';
import { Alert } from '../ui/Alert';
import { Iris } from '../ui/Iris';
import { Condition } from '../ui/Condition';
import { KartGauge } from '../ui/KartGauge';
import { EdgeFlash } from '../ui/EdgeFlash';
import { Death } from '../ui/Death';
import { Fuel } from '../ui/Fuel';
import { GearHud } from '../ui/GearHud';
import { Hearts } from '../ui/Hearts';
import { HitNotice } from '../ui/HitNotice';
import { Hud } from '../ui/Hud';
import { legendOf } from '../ui/legend';
import { Minimap } from '../ui/Minimap';
import { Overlay } from '../ui/Overlay';
import { NameTags } from '../ui/NameTags';
import { Pins } from '../ui/Pins';
import { Menu, toggleFullscreen } from '../ui/menu/Menu';
import { toggleBareView } from '../ui/bareView';
import { rideGround } from './ride';
import { KART_VIEW, VIEWS, View, boomOf, kartBoom, kartFov, screenBoom, screenFov, type Boom } from './View';

const CORRECTION_HALF_LIFE = 0.06;
// Seconds for the camera to catch up when it goes from riding the ground (ride.ts) to following the
// body through the air, or back.
const STEP_EASE_HALF_LIFE = 0.05;
// The nearest the camera draws, in metres: NEAR, or for eyes so low that its corners would reach
// past the floor under them, NEAR_SHARE of their height (Plankton's).
const NEAR = 0.1;
const NEAR_SHARE = 0.2;
const SNAP_DISTANCE = 3;
const PING_INTERVAL_MS = 2000;
const START_INTRO_LATE_MS = 6000; // how long the intro of the look a player comes in as may take to arrive and still be said
const HOVER_RANGE = 400; // sky objects can be read from anywhere
// The foghorn alarm clock in SpongeBob's bedroom sounds at a click on it, for the player who clicked.
const HORN = new Structures([PINEAPPLE_HORN]);
const HORN_REACH = 8; // metres along the look from the eye to the clock
const HORN_SLACK = 0.3; // metres short of it the rooms' boxes cut from the clock may stop the look
const HORN_AT: Vec3 = { x: PINEAPPLE_HORN.x, y: PINEAPPLE_HORN.y + PINEAPPLE_HORN.h / 2, z: PINEAPPLE_HORN.z };
// Metres from the clock's middle past which no look within reach can land on it: the reach and the
// furthest corner of its box.
const HORN_NEAR = HORN_REACH + Math.hypot(PINEAPPLE_HORN.w, PINEAPPLE_HORN.h, PINEAPPLE_HORN.d) / 2;
const EYE_EASE = 0.25; // seconds the camera takes to settle at a new avatar's eye height and view
const CEILING_GAP = 0.15; // metres the camera keeps under a lintel or ceiling the body passes beneath
// A smaller body sees wider and a bigger one narrower, by its stature to this power: Mike's view
// is 5° wider than the standard body's and Tung Tung Tung's 5° narrower, enough to feel and no more.
const FOV_SHRINK = 0.15;
// Head bob: the eyes dip with each footfall, by this many metres at the standard body's full walk,
// in proportion to its stature, and in step with the footstep sounds. Small, so the view never
// swims and the crosshair stays where it was.
const BOB = 0.02;
// The furthest the third-person shoulder sits out to the side, as a share of the boom's length
// behind the eyes: any further and a tiny body, its camera close behind it, is off the screen.
const SHOULDER_REACH = 0.6;
const BOB_EASE = 0.15; // seconds the bob takes to come and go with the walk
const CUBE_SELECT_RANGE = 25; // cubes only from close by, so a far one isn't opened by accident
const FRAME_RANGE = 40; // metres from a frame you can read its line: the tower's width, wall to wall
const SCOPED_FOV = 0.3;
// The scope's clear circle across the shorter side of the screen (35vmin either way, `#scope` in
// styles.css); everything outside it is black.
const SCOPE_CIRCLE = 0.7;
// The fog's density is scaled by the root of this: thinned while scoped to be as thick at
// SCOPED_SIGHT as it is at SIGHT unscoped.
const SCOPED_FOG_SCALE = (SIGHT / SCOPED_SIGHT) ** 2;
const HIP_KICK = 0.02;
const SCOPED_KICK = 0.035;
const KICK_HALF_LIFE = 0.06;
const MENU_SCROLL_PX = 80; // one arrow press or W/S on the commands menu
// Your own shots play at this share of their volume: right at your ear, they'd drown out the rest.
const OWN_SHOT = 0.7;
const NEAR_MISS_DELAY = 0.1; // seconds after the shot that a near miss whizzes by (about 4 frames)
const OWN_WEAPON_SCALE = 2.2; // your own guns, seen from the boom: at true size they read as toys
// A roar comes back off the world: the same again, this much later and this much quieter.
const ECHO_DELAY = 0.5;
const ECHO_LEVEL = 0.3;
const GLOAT_DELAY = 0.4; // seconds after a kill that the killer's own line for one starts, clear of the shot
const OWN_MOVE = 0.6; // the share of its volume the player's own ground pound turns over at, as their own steps do (Footsteps.ts)
const DEATH_SOUND_DELAY = 0.5; // seconds from dying to the look's death sound: the hurt sound or cry of the last hit, played out
const CRY_GAP_MS = 600; // a player's cries, at a hit or a boost, come no closer together than this, however short the cry
type Line = 'hurt' | 'kill' | 'boost' | 'enter' | 'death'; // the lines of a look's voice that are a list of takes (voices.ts)
// Metres nearer than the player or building whose theme is playing another has to be to take the
// theme over, so two at a like distance don't trade it back and forth.
const THEME_HYSTERESIS = 15;

// A living player as the music and a dragon's cries take them: who, in what look, where (the eye
// point), and for a dragon whether it has risen out of the ground yet (null for anyone on foot).
interface Living {
  id: string;
  avatar: AvatarId;
  at: Vec3;
  risen: boolean | null;
}

// A theme as Sfx.setLoops plays it (Game `music`).
interface Music {
  key: string;
  id: SoundId;
  at: Vec3 | null;
  elapsed: number;
  level: number;
}

// One of the themes round a player with none of their own: `metres` from the ear, `holder` the
// player or building it comes from, and `inside` whether the player is within the building's walls,
// where nothing else may play over it.
interface Contender extends Music {
  metres: number;
  inside: boolean;
  holder: string;
}
const LOOK_HOLD = Math.PI / 2 - 0.01; // radians either side of facing a ladder the look may turn while on it
const SWING_HALF_LIFE = 0.08; // seconds: the camera's swing round a ladder is mostly over in a third of a second

export class Game {
  private readonly engine: Engine;
  private readonly environment: Environment;
  private readonly loader = new Loader(); // streams the world in round the player
  private readonly models: Models;
  private readonly frost: FrostLayer; // the ice sprayed over the world's surfaces (sim/frost.ts)
  // What a click uses, under the crosshair within reach: a door (sim/doors.ts).
  private hoveredUse: string | null = null;
  private introduced = false; // the look the player came in as has said its intro
  private hoveredHorn = false; // the bedroom's foghorn is under the crosshair within reach
  private use: string | null = null; // a door clicked since the last input frame
  private readonly driving: Driving;
  private readonly rescuers: Rescuers;
  private readonly camera: UniversalCamera;
  private readonly input: InputManager;
  private readonly mobile: MobileControls;
  private readonly mobileActions: MobileActions;
  private readonly overlay = new Overlay();
  private readonly hud: Hud;
  private readonly pins = new Pins();
  private readonly nameTags = new NameTags();
  private readonly interp = new Interpolation();
  private readonly cubes = new Map<string, CubeMesh>();
  private readonly cubeByMesh = new Map<string, CubeMesh>();
  private readonly avatars = new Map<string, Avatar>();
  private stature: number | null = null; // the worn avatar's size beside the standard one, eased over a change of look
  private readonly view = new View();
  private aim = { yaw: 0, pitch: 0 }; // the look sent this frame: the camera's, or in third person the eyes' at the crosshair's target
  private ownAvatar: Avatar | null = null; // the player's own body, drawn in third person
  private classId: PlayerClass | null = null; // the class the player was last seen as
  private look: AvatarId | null = null; // the avatar the player was last seen as
  private wearing: string | null = null; // the avatar and item the player was last seen with, for dropping the scope
  private heldFace: { piece: number; side: 1 | -1; way: 1 | -1 } | null = null; // the ladder face the player was last seen holding
  private swing = 0; // radians the camera has still to turn after a swap round a ladder
  private swapRequested = false; // the touch SWAP button was pressed since the last frame
  private poundRequested = false; // and the touch CROUCH button, which is POUND in the air
  private crouchOn = false; // crouched by that button: a press on the ground turns it on and off
  private readonly pounds = new Map<string, RemotePlayer['pound']>(); // the stage each player's ground pound was last seen at
  private readonly strikes = new Map<string, number>(); // how far into a strike each player striking was last seen
  private readonly cried = new Set<string>(); // the dragons heard crying on their way out of the ground
  private readonly criedOut = new Map<string, number>(); // when each player may next cry out (performance.now)
  private themeOf: string | null = null; // the player or building whose theme is playing (Contender.holder)
  // When each theme worn round the player began (ms; `running`): it runs on from then for as long as
  // anyone the player could hear it from wears it.
  private readonly wornClocks = new Map<SoundId, number>();
  // When each building's theme began (ms; `running`): it runs on from then for the rest of the visit.
  private readonly placeClocks = new Map<SoundId, number>();
  private mourningUntil = 0; // when the look's death sound, played as the player died, ends (performance.now)
  private bobbing = 0; // share of the full head bob in play: eased up with the walk and down when it stops
  private readonly skyByMesh = new Map<string, SkyObject>();
  private readonly bubble = new Bubble();
  private readonly frameBubble = new Bubble('plain'); // a frame's line, over the frame
  private readonly wallFrames: WallFrames;
  private readonly interiors: Interiors;
  private readonly minimap = new Minimap();
  private readonly death = new Death();
  private readonly hearts = new Hearts();
  // The wrenches of the kart they drive, under the hearts while they drive one.
  private readonly wrenches = new Hearts(document.getElementById('wrenches')!, WRENCHES);
  private readonly fuel = new Fuel();
  private readonly gearHud = new GearHud();
  private readonly condition = new Condition();
  private readonly kartGauge = new KartGauge();
  private readonly alert = new Alert();
  private readonly iris = new Iris();
  private readonly commandHint = new CommandHint();
  private readonly areaTitle = new AreaTitle();
  private readonly commandsMenu = new CommandsMenu();
  private readonly menu: Menu;
  private readonly damageFlash = new EdgeFlash(document.getElementById('damage-flash')!, 160);
  private readonly healFlash = new EdgeFlash(document.getElementById('heal-flash')!, 900);
  private readonly hitNotice = new HitNotice();
  private readonly viewmodel: Viewmodel;
  private readonly pickups: Pickups;
  private dead = false;
  private scoped = false;
  private canHit = false;
  private lastScopeNag = -Infinity;
  private shootWasHeld = false; // last frame's shoot level, for the press edge
  private mouseFiring = false; // the current mouse/FIRE hold started as a shot, not a select
  private mouseWasHeld = false;
  private localCooldownUntil = 0; // when the viewmodel may kick again; mirrors the server's cooldown
  private kick = 0; // camera recoil, radians of upward pitch that decays back
  private stepEase = 0; // metres the camera trails the predicted eye height after leaving the ground or landing
  private hearsKarts = false; // a kart's sounds have been sent for
  private readonly drivers = new Set<AvatarId>(); // the looks seen driving a kart, whose boost cries have been sent for
  private riding: number | null = null; // metres the camera's ground is over the sim's feet while it rides the ground
  private walkDir = { x: 0, z: 1 }; // the way the body last moved across the floor, for the ride
  private lastPos: { x: number; z: number } | null = null;
  private hoveredSky: SkyObject | null = null;
  private hoveredFrame: HungFrame | null = null;
  private readonly sfx = new Sfx();
  private readonly footsteps = new Footsteps(this.sfx, WORLD_STRUCTURES);
  // Other players' tap shots this tick, heard before the tick's snapshot says where they stood and
  // looked; `hitMe` once a hit on the local player from them comes in.
  private pendingShots: { shooter: string; hitMe: boolean }[] = [];

  private prediction: Prediction | null = null;
  private myId = '';
  private accumulator = 0;
  private correction = new Vector3();
  private hovered: CubeMesh | null = null;
  private pingTimer = 0;

  constructor(
    private readonly canvasEl: HTMLCanvasElement,
    private readonly conn: Connection,
    roomId: string,
    private readonly onDisconnect: (reason: string) => void,
  ) {
    const canvas = canvasEl;
    this.engine = new Engine(canvas, true);
    this.environment = new Environment(this.engine, WORLD_GROUND, this.loader, ROAD_RAISED);
    buildStructures(this.engine, WORLD_STRUCTURES.list, this.loader);
    buildBoostPads(this.engine, ROAD_PADS, this.loader);
    buildSkyline(this.engine, WORLD_OUTLINE, ROAD_RAISED.flat(), WORLD_STRUCTURES.list, this.loader);
    this.frost = new FrostLayer(this.engine, WORLD_STRUCTURES.list);
    this.interiors = new Interiors(INTERIOR_BUILDINGS, (door) => this.models.ajar(door));
    this.models = new Models(this.engine, this.loader, this.interiors);
    this.driving = new Driving(this.engine);
    this.rescuers = new Rescuers(this.engine.scene);
    this.driving.onKnock = (at) => this.sfx.play(KART_SOUNDS.knock, at);
    this.driving.onSpark = (at, spark) => this.sfx.play(KART_SOUNDS.spark, at, { rate: SPARK_RATE[spark] });
    this.driving.onBoost = (at, driver) => {
      this.sfx.play(KART_SOUNDS.boost, at);
      if (driver) this.cry(driver, 'boost');
    };
    this.driving.onTrick = (at) => this.sfx.play(KART_SOUNDS.trick, at);
    this.wallFrames = new WallFrames(this.engine, WALL_FRAMES, this.interiors);
    this.camera = new UniversalCamera('camera', new Vector3(0, 1.7, 0), this.engine.scene);
    this.camera.minZ = NEAR;
    this.camera.fov = VIEWS.walker.fov;
    this.engine.scene.activeCamera = this.camera;
    this.viewmodel = new Viewmodel(this.engine, this.camera);
    this.pickups = new Pickups(this.engine);

    CUBES.forEach((content) => {
      const cube = new CubeMesh(this.engine, content);
      this.cubes.set(content.id, cube);
      this.cubeByMesh.set(cube.mesh.name, cube);
    });

    this.input = new InputManager(canvas);
    this.mobile = new MobileControls(this.input);
    this.mobileActions = new MobileActions({
      // SELECT opens the cube under the crosshair; otherwise the button is the trigger, held.
      onActionDown: () => {
        if (this.hovered) this.overlay.show(this.hovered.content);
        else this.input.fireHeld = true;
      },
      onActionUp: () => (this.input.fireHeld = false),
      onScope: () => this.setScoped(!this.scoped),
      onSwap: () => (this.swapRequested = true),
      onOut: () => this.input.tap('KeyE'),
      onPound: () => (this.poundRequested = true),
      onChat: () => this.hud.openChat(),
      onCommands: () => this.commandsMenu.toggle(),
    });
    this.hud = new Hud(roomId);
    this.hud.onChat = (text) => {
      this.wantCommand(text, true);
      conn.send({ t: 'chat', text });
      this.commandsMenu.set(false); // typed over the commands: the card goes, so what it did is in view
    };
    this.commandsMenu.onCommand = (text) => this.hud.onChat?.(text);
    this.commandsMenu.onDraft = (text) => this.hud.openChat(text);
    this.commandsMenu.onPoint = (text) => this.wantCommand(text, false);
    this.commandsMenu.onNotice = (text) => this.alert.flash(text);
    // Chat, the commands and the menu are what the nudge points at: one found, it's done with.
    // The commands free the mouse for their buttons; the world has it back when they go.
    this.commandsMenu.onOpenChange = (open) => {
      if (open) this.commandHint.retire();
      else if (!IS_TOUCH && !document.pointerLockElement && !this.isBlocked()) canvas.requestPointerLock?.();
    };
    this.hud.onChatOpenChange = (open) => {
      if (open) this.commandHint.retire();
      this.syncBlocked();
      // Sending or cancelling a message is a key press, so the browser lets us take the mouse
      // straight back rather than making the player click into the world again.
      if (!open && !IS_TOUCH && !this.isBlocked()) canvas.requestPointerLock?.();
    };
    this.menu = new Menu({
      roomId,
      online: conn.kind !== 'local',
      sfx: this.sfx,
      view: this.view,
      picture: this.engine.picture,
      minimap: this.minimap,
      rename: (name) => conn.send({ t: 'rename', name }),
      commands: () => this.commandsMenu.set(true),
      command: (word) => conn.send({ t: 'chat', text: `/${word}` }),
    });
    // Closing it back into the world is a click or a key press, which lets us take the mouse too.
    this.menu.onOpenChange = (open, back) => {
      if (open) this.commandHint.retire();
      this.syncBlocked();
      if (!open && back && !IS_TOUCH && !this.isBlocked()) canvas.requestPointerLock?.();
    };
    // The mouse is free only with something to use it on: the chat, a card, the death screen or
    // the menu. Losing the pointer any other way (Esc, which the browser answers itself without a
    // key event, a click outside the page, a switch of window) opens the menu, so a visible mouse
    // always means the menu is up.
    document.addEventListener('pointerlockchange', () => {
      if (!IS_TOUCH && !document.pointerLockElement && !this.isBlocked()) this.menu.show();
    });
    window.addEventListener('keydown', (e) => {
      if (this.commandsMenu.isOpen) {
        // The menu is a little page: Q or C closes it (like the cube card), arrows and W/S scroll.
        if (e.code === 'KeyQ' || e.code === 'KeyC') this.commandsMenu.set(false);
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.commandsMenu.scroll(MENU_SCROLL_PX);
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.commandsMenu.scroll(-MENU_SCROLL_PX);
        return;
      }
      if (this.isBlocked() || e.repeat) return;
      if (e.code === 'KeyP') this.minimap.toggle();
      else if (e.code === 'KeyC') this.commandsMenu.set(true);
      else if (e.code === 'KeyM') this.menu.show();
      else if (e.code === 'KeyO') toggleFullscreen();
      else if (e.code === 'KeyZ') this.view.toggle();
      else if (e.code === 'KeyL') toggleBareView();
      else if (this.held && actionForKey(this.held.id, e.code) === 'scope') this.setScoped(!this.scoped);
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.commandsMenu.isOpen) this.hoveredFrame?.scroll?.(e.deltaY); // a long widget, under the crosshair
      },
      { passive: true },
    );
    // Shooting is not a click handler: the input layer samples the mouse button into the
    // frame's actions like any key. A click only opens the cube under the crosshair, and only
    // when the press started on it: a hold that began as a shot stays a shot.
    canvas.addEventListener('click', () => {
      if (!this.isBlocked() && this.hovered && !this.mouseFiring) this.overlay.show(this.hovered.content);
    });
    // On touch a finger on the world drags the look, so a tap (down and up in place) is the press
    // that uses the door under the crosshair; the FIRE button, when there is one, uses it too.
    onTap(canvas, () => {
      if (this.isBlocked()) return;
      if (this.hoveredUse) this.use = this.hoveredUse;
      if (this.hoveredHorn) this.sfx.play('boat-horn', HORN_AT);
    });

    conn.onMessage((m) => this.handle(m));
    conn.onClose((reason) => this.stop(reason));
  }

  start(): void {
    this.pingTimer = window.setInterval(() => this.conn.send({ t: 'ping', at: performance.now() }), PING_INTERVAL_MS);
    this.engine.run((dt) => this.frame(dt));
  }

  private stop(reason: string): void {
    clearInterval(this.pingTimer);
    this.mobile.dispose();
    this.engine.dispose();
    this.onDisconnect(reason);
  }

  private get held() {
    return this.prediction?.state.item ?? null;
  }

  private canFire(): boolean {
    return !!this.held && (!ITEMS[this.held.id].fireNeedsScope || this.scoped);
  }

  // The item actions to put in this tick's frame. Shoot is a level: key or mouse button down
  // (a press shorter than a tick still counts). A mouse press over a cube is a select, not a
  // shot; one that started clear of a cube keeps firing however the crosshair moves until
  // release. Scope is the local toggle, reported while on so the server's state follows it.
  private itemActions(): ItemAction[] {
    const mouse = this.input.fireHeld;
    if (mouse && !this.mouseWasHeld) {
      // A press on a door uses it, one on the foghorn sounds it, and one on a cube selects it; none
      // is a shot.
      if (this.hoveredUse) this.use = this.hoveredUse;
      if (this.hoveredHorn) this.sfx.play('boat-horn', HORN_AT);
      this.mouseFiring = !this.hovered && !this.hoveredUse && !this.hoveredHorn;
    }
    if (!mouse) this.mouseFiring = false;
    this.mouseWasHeld = mouse;

    if (this.dead) return [];
    if (this.prediction?.state.riding) return this.driving.actions(this.input);
    const actions: ItemAction[] = [];
    const held = this.held;
    if (held) {
      const spec = ITEMS[held.id];
      const shoot = spec.actions.shoot;
      const code = shoot?.key ?? null;
      const key = code !== null && (this.input.isDown(code) || this.input.wasPressed(code));
      if (shoot && (key || this.mouseFiring)) actions.push('shoot');
      if (spec.actions.scope && this.scoped) actions.push('scope');
    }
    this.localEffects(actions.includes('shoot'));
    // Gear actions are holds, on their key (the jetpack's is the jump key, which the touch jump
    // button also holds down). The class's own are taps, reported as levels like the shot.
    const self = this.prediction?.state;
    if (self?.gear)
      for (const [action, spec] of Object.entries(GEAR[self.gear.id].actions))
        if (spec.key !== null && this.input.isDown(spec.key)) actions.push(action as ItemAction);
    if (self)
      for (const [action, spec] of Object.entries(classOf(self.avatar).actions))
        if (spec.key !== null && (this.input.isDown(spec.key) || this.input.wasPressed(spec.key)))
          actions.push(action as ItemAction);
    // On a ladder A and D go round to its other face, by its left and by its right; the touch SWAP
    // button goes by its left.
    if (self?.climb) {
      if (this.input.wasPressed('KeyA') || this.swapRequested) actions.push('swap-left');
      else if (this.input.wasPressed('KeyD')) actions.push('swap-right');
    }
    this.swapRequested = false;
    if (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight')) actions.push('run');
    // X is a look's own moves: held on the ground it crouches, and a press in the air starts a
    // ground pound; for a look with a strike, a press is the strike. The touch button is whichever
    // the look has: a press on the ground turns the crouch on or off (a thumb can't hold it and
    // press JUMP), until the feet leave the ground.
    const pressed = this.input.wasPressed('KeyX') || this.poundRequested;
    if (!self || !crouchOf(self.avatar) || !isGrounded(self)) this.crouchOn = false;
    else if (this.poundRequested) this.crouchOn = !this.crouchOn;
    if (self && crouchOf(self.avatar) && (this.input.isDown('KeyX') || this.crouchOn)) actions.push('crouch');
    // A float is the jump key held, which the touch jump button holds down too.
    if (self && floatOf(self.avatar) && this.input.isDown('Space')) actions.push('float');
    if (self && poundOf(self.avatar) && pressed) actions.push('pound');
    if (self && strikeOf(self.avatar) && pressed) actions.push('strike');
    this.poundRequested = false;
    return actions;
  }

  // On a ladder the look stays within LOOK_HOLD of facing it, and a change of face (a swap, or
  // taking hold through to the far face) takes it half a turn round with the body, the way the
  // body went, the camera swinging after it rather than snapping.
  private holdLook(dt: number): void {
    const hold = this.prediction!.state.climb;
    const was = this.heldFace;
    this.heldFace = hold && { ...hold };
    this.swing *= Math.pow(0.5, dt / SWING_HALF_LIFE);
    if (Math.abs(this.swing) < 1e-3) this.swing = 0;
    if (!hold) return;
    const facing = WORLD_STRUCTURES.ladderFacing(hold.piece, hold.side);
    let off = wrapAngle(this.input.yaw - facing);
    if ((!was || was.piece !== hold.piece || was.side !== hold.side) && Math.abs(off) > Math.PI / 2) {
      this.input.yaw += Math.PI;
      this.swing -= hold.way * Math.PI;
      off = wrapAngle(this.input.yaw - facing);
    }
    if (Math.abs(off) > LOOK_HOLD) this.input.yaw = facing + Math.sign(off) * LOOK_HOLD;
  }

  // What the local player sees on the press of a tap weapon, before the server confirms:
  // viewmodel recoil, camera kick, scope flash. Hold weapons show their jet from the sim's
  // firing state instead. An unscoped sniper explains itself.
  private localEffects(shootHeld: boolean): void {
    const pressed = shootHeld && !this.shootWasHeld;
    this.shootWasHeld = shootHeld;
    if (!pressed || !this.held) return;
    const spec = ITEMS[this.held.id];
    if (!this.canFire()) {
      if (performance.now() - this.lastScopeNag > 2000) {
        this.lastScopeNag = performance.now();
        this.hitNotice.note(`the ${this.held.id} only fires while scoped${IS_TOUCH ? '' : ' (F)'}`);
      }
      return;
    }
    if (spec.actions.shoot?.mode !== 'tap' || performance.now() < this.localCooldownUntil) return;
    this.localCooldownUntil = performance.now() + spec.cooldownTicks * TICK_DT * 1000;
    this.viewmodel.fire();
    this.ownAvatar?.fire();
    const shot = ITEM_SOUNDS[this.held.id].shot;
    if (shot) this.sfx.play(shot, null, { level: OWN_SHOT });
    // Recoil the camera up and let it settle. Bigger for the sniper, whose viewmodel is hidden
    // behind the scope, and flash the scope so the shot is unmistakable.
    this.kick = this.scoped ? SCOPED_KICK : HIP_KICK;
    if (this.scoped) {
      const scope = document.getElementById('scope')!;
      scope.classList.add('flash');
      setTimeout(() => scope.classList.remove('flash'), 90);
    }
  }

  // Aim down the scope: narrow the camera, slow the look, swap the viewmodel for the overlay.
  private setScoped(on: boolean): void {
    const can = !!this.held && 'scope' in ITEMS[this.held.id].actions;
    on = on && can;
    if (on === this.scoped) return;
    this.scoped = on;
    this.camera.fov = on ? SCOPED_FOV : this.wornFov();
    this.input.lookScale = on ? SCOPED_FOV / this.wornFov() : 1;
    document.getElementById('scope')!.classList.toggle('hidden', !on);
  }

  // The view the player has when not scoped: driving, their kart's, opened out through a boost;
  // else the worn avatar's class's, for a walker a little wider or narrower by its stature. Either
  // is widened for a portrait screen.
  private wornFov(): number {
    if (this.prediction?.kart) return kartFov(screenFov(KART_VIEW.fov, this.aspect()), this.driving.rush);
    const cls = this.prediction ? classOf(this.prediction.state.avatar) : null;
    const fov = (cls ? VIEWS[cls.id].fov : VIEWS.walker.fov) * Math.pow(this.stature ?? 1, -FOV_SHRINK);
    return screenFov(fov, this.aspect());
  }

  // Radians from the look to the scope's circle's edge.
  private scopeCone(): number {
    return Math.atan(SCOPE_CIRCLE * Math.tan(SCOPED_FOV / 2) * Math.min(1, this.aspect()));
  }

  private aspect(): number {
    return this.engine.scene.getEngine().getAspectRatio(this.camera);
  }

  // Metres a driver's eyes are over their kart's seat: the share of the worn body's height that
  // stands out of it.
  private seatedEyes(): number {
    return (this.stature ?? 1) * EYE_HEIGHT * SEATED;
  }

  // The boom the camera hangs on in third person: a driver's kart's, else the worn look's scaled to
  // a walker's stature, fitted to a portrait screen.
  private boom(): Boom {
    const kart = this.prediction!.kart;
    if (kart) {
      const boom = kartBoom(kart.size, this.seatedEyes(), this.driving.rush);
      return screenBoom(boom, this.wornFov(), this.aspect());
    }
    const avatar = this.prediction!.state.avatar;
    const boom = boomOf(avatar);
    const scale = classOf(avatar).id === 'walker' ? (this.stature ?? 1) : 1;
    // A small body is no narrower across the shoulders than its gun arm reaches, and a tiny one's
    // shoulder no further out than SHOULDER_REACH of the boom, so the body stays on screen.
    const back = boom.back * scale;
    const right = Math.min(boom.right * Math.max(1, scale), back * SHOULDER_REACH);
    const scaled = { back, right, up: boom.up * scale };
    return screenBoom(scaled, this.wornFov(), this.aspect());
  }

  private isBlocked(): boolean {
    return (
      this.dead || this.overlay.isVisible() || this.hud.isChatOpen() || this.commandsMenu.isOpen || this.menu.isOpen
    );
  }

  private syncBlocked(): void {
    this.input.setBlocked(this.isBlocked());
  }

  private handle(m: ServerMessage): void {
    const now = performance.now();
    switch (m.t) {
      case 'welcome': {
        this.myId = m.id;
        // The sky is seeded by the room's key (the Modal session id), which welcome carries, so
        // everyone in a session shares one sky and a new session gets a new one.
        const sky = placeSkyObjects(this.engine, SKY_OBJECTS, HOME_GROUND, WORLD_GROUND, createRng(hashSeed(m.room)));
        for (const object of sky) this.skyByMesh.set(object.mesh.name, object);
        const me = m.players.find((p) => p.id === m.id)!;
        this.prediction = new Prediction(me, WORLD_STRUCTURES);
        this.prediction.reconcile(
          me,
          m.karts.find((k) => k.id === me.riding),
        );
        this.input.yaw = me.yaw;
        this.input.pitch = me.pitch;
        this.interp.push(m, now);
        this.hud.setSelf(m.id);
        this.hud.setPlayers(m.players);
        for (const door of m.doors) {
          WORLD_STRUCTURES.setDoor(door.id, door.open);
          this.models.setDoor(door.id, door.open, false);
        }
        this.setFrost(m.frost, true);
        for (const p of m.players) if (p.id !== m.id) this.addAvatar(p);
        this.hud.system(
          IS_TOUCH
            ? `you are ${me.name}. drag to look, pad to move, SELECT on a cube.`
            : `you are ${me.name}. WASD to move, click cubes, Enter to chat.`,
        );
        return;
      }
      case 'snap': {
        this.interp.push(m, now);
        const me = m.players.find((p) => p.id === this.myId);
        if (me) {
          this.hearts.setLife(lifeOf(me.avatar), me.hearts);
          // A pickup's worth of hearts flashes; a regen's trickle each tick doesn't.
          if (me.hearts - this.hearts.count >= 1 && !this.dead) this.healFlash.flash();
          this.hearts.set(me.hearts);
          const kart = m.karts.find((k) => k.id === me.riding);
          this.wrenches.show(!!kart);
          if (kart) {
            this.wrenches.setLife({ ...WRENCHES, hearts: KARTS[kart.kart].wrenches }, kart.wrenches);
            this.wrenches.set(kart.wrenches);
          }
        }
        this.hud.updateStats(m.players);
        this.hearShots(m.players);
        if (me && this.prediction) {
          const d = this.prediction.reconcile(
            me,
            m.karts.find((k) => k.id === me.riding),
          );
          const dist = Math.hypot(d.dx, d.dy, d.dz);
          if (dist > SNAP_DISTANCE) this.correction.set(0, 0, 0);
          else if (dist > 1e-4) this.correction.addInPlace(new Vector3(d.dx, d.dy, d.dz));
        }
        return;
      }
      case 'join':
        this.addAvatar(m.p);
        this.hud.addPlayer(m.p);
        return;
      case 'leave': {
        const avatar = this.avatars.get(m.id);
        const corpse = avatar?.corpse();
        if (corpse) {
          poof(this.engine, corpse);
          this.sfx.play('hurt', corpse);
        }
        avatar?.dispose();
        this.avatars.delete(m.id);
        this.criedOut.delete(m.id);
        this.pounds.delete(m.id);
        this.strikes.delete(m.id);
        this.hud.removePlayer(m.id, m.name);
        return;
      }
      case 'chat':
        this.hud.chat(m.name, m.color, m.text);
        return;
      case 'system':
        this.hud.system(m.text);
        return;
      case 'refused':
        // The reason goes in the log like any system line, and in the red box.
        this.hud.system(m.text);
        this.alert.flash(m.text);
        return;
      case 'shot':
        if (m.id !== this.myId) this.pendingShots.push({ shooter: m.id, hitMe: false });
        return;
      case 'door':
        WORLD_STRUCTURES.setDoor(m.id, m.open);
        this.models.setDoor(m.id, m.open);
        return;
      case 'boom':
        blast(this.engine, new Vector3(m.at.x, m.at.y, m.at.z));
        this.sfx.play(KART_SOUNDS.boom, m.at);
        return;
      case 'frost':
        this.setFrost(m.on, true);
        this.setFrost(m.off, false);
        return;
      case 'action': {
        const actor = m.id === this.myId ? this.ownAvatar : this.avatars.get(m.id);
        const call = actor && voiceOf(actor.kind)?.roars[m.action];
        const at = this.headOf(m.id);
        if (call && at) {
          this.sfx.call(call, at);
          this.sfx.call(call, at, { delay: ECHO_DELAY, level: ECHO_LEVEL });
        }
        actor?.act?.(m.action);
        return;
      }
      case 'hit':
        this.onHit(m);
        return;
      case 'kill':
        this.hud.announceKill(m.shooter, m.victim, m.item, m.headshot);
        this.hud.setDead(m.victim);
        if (m.victim === this.myId) this.die(`${KILLED_BY[m.item] ?? 'shot'} by ${this.hud.playerName(m.shooter)}`);
        this.say(m.shooter, 'kill', GLOAT_DELAY);
        return;
      case 'fell':
        this.hud.announceFall(m.victim);
        this.hud.setDead(m.victim);
        if (m.victim === this.myId) this.die('you fell');
        return;
      case 'out':
        this.hud.announceOutOfBounds(m.victim);
        this.hud.setDead(m.victim);
        if (m.victim === this.myId) this.die('you went out of bounds');
        return;
      case 'crashed':
        this.hud.announceCrash(m.victim);
        this.hud.setDead(m.victim);
        if (m.victim === this.myId) this.die('you crashed');
        return;
      case 'pong':
        this.hud.setPing(now - m.at);
        return;
      case 'error':
        this.hud.system(m.message);
        return;
    }
  }

  // Frost comes and goes for the sim (so prediction slides where the server does) and the eye alike.
  private setFrost(cells: FrostCell[], on: boolean): void {
    for (const cell of cells) {
      WORLD_STRUCTURES.frost.set(cell, on);
      this.frost.set(cell, on);
    }
  }

  // Where a player's head is right now: the local player's by prediction, anyone else's as drawn.
  private headOf(id: string): Vec3 | null {
    if (id === this.myId) return this.prediction?.state.pos ?? null;
    const p = this.interp.sample(performance.now(), this.myId).players.find((rp) => rp.id === id);
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  // The local player died; `how` heads the death screen.
  private die(how: string): void {
    this.dead = true;
    this.setScoped(false);
    this.syncBlocked();
    this.death.show(how);
    // The look's death plays over the death screen, a moment on so the last hit is heard first, and
    // over that hit's cry rather than cutting it, as the look's other lines cut its last. For as long
    // as it lasts it's the player's own music: the theme playing is gone by the time it starts, and
    // none comes back under it (`music`).
    const said = this.line(this.myId, 'death');
    if (!said || !this.sfx.play(said.sound, null, { delay: DEATH_SOUND_DELAY })) return;
    this.sfx.endLoops('music', DEATH_SOUND_DELAY);
    this.mourningUntil = performance.now() + (DEATH_SOUND_DELAY + this.sfx.seconds(said.sound)) * 1000;
  }

  // A shot landed, or with no shooter, a fall hurt. The victim's client flashes red, plays the
  // hurt sound and drops hearts, the shooter's says who they hit, and everyone else sees the
  // victim blink.
  private onHit(m: {
    shooter: string | null;
    victim: string;
    damage: number;
    headshot: boolean;
    hearts: number;
  }): void {
    if (m.victim === this.myId) {
      for (const s of this.pendingShots) if (s.shooter === m.shooter) s.hitMe = true;
      // The hurt sound at every hit, the one that kills like any other, and over it the look's cry
      // where it has one, held off while its last cry sounds so a spray's run of hits is a cry at a time.
      this.sfx.play('hurt');
      this.cry(m.victim, 'hurt');
      this.damageFlash.flash();
      this.hearts.set(m.hearts);
    } else {
      this.avatars.get(m.victim)?.flash();
      this.cry(m.victim, 'hurt');
    }
    if (m.shooter === this.myId) {
      this.hud.hitMarker();
      this.hitNotice.show(this.hud.playerName(m.victim), m.damage, m.headshot);
    }
  }

  // What the touch button for a look's own moves does where the player is: BAT for a look with a
  // strike, anywhere; else CROUCH on the ground, lit while crouched, and POUND in the air, off a
  // ladder and out of a pound; null for a look with none there.
  private ownMove(self: PlayerState): MobileActionState['move'] {
    if (strikeOf(self.avatar)) return { label: 'BAT', on: false };
    if (self.pound || self.climb) return null;
    if (isGrounded(self)) return crouchOf(self.avatar) ? { label: 'CROUCH', on: self.crouch } : null;
    return poundOf(self.avatar) ? { label: 'POUND', on: false } : null;
  }

  // A player's ground pound (sim/avatars.ts `Pound`) as it's seen to change stage, `at` being
  // their eye point and `height` how far under where it began: its turn in the air is heard as it
  // starts, and where it lands a ring runs out over the floor as far as it hurts. The landing's thud
  // is the footsteps'.
  private pounding(id: string, avatar: AvatarId, stage: RemotePlayer['pound'], at: Vec3, height: number): void {
    const was = this.pounds.get(id) ?? null;
    if (stage === was) return;
    this.pounds.set(id, stage);
    const mine = id === this.myId;
    const twirl = twirlOf(avatar);
    if (stage === 'twirl' && twirl) this.sfx.play(twirl, mine ? null : at, { level: mine ? OWN_MOVE : 1 });
    const pound = poundOf(avatar);
    const reach = pound && poundPower(pound, height).reach;
    if (stage === 'land' && reach) poundRing(this.engine, new Vector3(at.x, at.y - EYE_HEIGHT, at.z), reach);
  }

  // A player's strike (sim/avatars.ts `Strike`), `strike` being how far into one they are and `at`
  // their eye point: its swing is heard as it starts.
  private striking(id: string, avatar: AvatarId, strike: number | null, at: Vec3): void {
    const was = this.strikes.get(id);
    if (strike === null) this.strikes.delete(id);
    else this.strikes.set(id, strike);
    if (strike === null || (was !== undefined && strike >= was)) return;
    const swing = swingOf(avatar);
    const mine = id === this.myId;
    if (swing) this.sfx.play(swing.sound, mine ? null : at, { level: mine ? OWN_MOVE : 1, rate: swing.rate });
  }

  // One of a player's lines in their own voice (voices.ts), `delay` seconds from now, from where
  // their head is, or the local player's own, from nowhere. False if their look has no such line.
  // A death is the dying player's own, played by `die`, and a cry (at a hit, at a boost) is `cry`'s.
  private say(id: string, line: 'enter' | 'kill', delay = 0): boolean {
    // An intro runs until its player takes another look, whose own takes its place if it has one.
    if (line === 'enter') this.sfx.hush(id);
    const said = this.line(id, line);
    if (!said) return false;
    // An intro is fetched as it's first said, so it's played the moment it's here.
    if (line === 'enter') {
      this.sfx.soon(said.sound, said.at, undefined, id);
      return true;
    }
    // Each line cuts its speaker's last.
    if (this.sfx.play(said.sound, said.at, { delay, by: id })) return true;
    // A kill line not here yet (lazy in SOUNDS, sent for in wantVoice) is played as it arrives.
    this.sfx.soon(said.sound, said.at, undefined, id);
    return true;
  }

  // The take a player would say a line with and where from (null: the local player's own, from
  // nowhere), or null if their look has no such line or they can't be placed.
  private line(id: string, line: Line): { sound: SoundId; at: Vec3 | null } | null {
    const mine = id === this.myId;
    const avatar = mine ? this.prediction?.state.avatar : this.avatars.get(id)?.kind;
    const sound = avatar && take(VOICES[avatar][line]);
    const at = mine ? null : this.headOf(id);
    return sound && (mine || at) ? { sound, at } : null;
  }

  // Sends for a look's jumps, hurts and kills (lazy in SOUNDS) as it's first seen worn, so they're
  // here by the time it hops, is hit or gloats, and with `mine` its death and its theme too, which
  // its own player hears whatever happens. A hurt that hasn't arrived by its hit is left out, and a
  // jump is the swoosh; a theme starts from the top as it arrives.
  private wantVoice(avatar: AvatarId, mine: boolean): void {
    const voice = VOICES[avatar];
    const lines = [
      voice.jump,
      voice.leap,
      voice.hurt,
      voice.kill,
      mine ? voice.death : undefined,
      mine && voice.theme ? [voice.theme.sound] : undefined,
    ];
    for (const id of lines.flatMap((l) => l ?? [])) this.sfx.want(id);
  }

  // What a command pointed at or `sent` is about to need, sent for ahead of the server's answer: a
  // look's body, and its voice too once it's sent, so the switch finds them here; a kart's files, in
  // the paint the player would drop it in, so it's drawn from the moment it drops.
  private wantCommand(text: string, sent: boolean): void {
    const command = parseCommand(text);
    if (command?.name === 'kart' && this.prediction)
      wantKart(this.engine.scene, command.kart, this.prediction.state.avatar);
    if (command?.name !== 'avatar') return;
    void wantLook(this.engine, command.avatar).catch(() => {});
    if (sent) this.wantVoice(command.avatar, true);
  }

  // A player's cry: at a hit, or as the kart they drive begins a boost. False if their look has
  // none for it, or their last cry is still sounding: none starts before the one before it has run
  // out, nor within CRY_GAP_MS of it, so boosts begun one on another are one cry. A boost's is a
  // take of another line, at the cry's own volume.
  private cry(id: string, line: 'hurt' | 'boost'): boolean {
    const now = performance.now();
    if (now < (this.criedOut.get(id) ?? 0)) return false;
    const said = this.line(id, line);
    const level = said && line === 'boost' ? levelAt(said.sound, BOOST_CRY) : 1;
    if (!said || !this.sfx.play(said.sound, said.at, { by: id, level })) return false;
    this.criedOut.set(id, now + Math.max(CRY_GAP_MS, this.sfx.seconds(said.sound) * 1000));
    return true;
  }

  // This tick's tap shots, each played where its shooter stands. One that passed close to the
  // local player without hitting them also whizzes by a moment later, sweeping past from the
  // nearest point of its path (so the farther it passed, the quieter).
  private hearShots(players: PlayerState[]): void {
    for (const s of this.pendingShots) {
      const p = players.find((q) => q.id === s.shooter);
      const sounds = p?.item && ITEM_SOUNDS[p.item.id];
      if (!p || !sounds) continue;
      this.avatars.get(p.id)?.fire();
      if (sounds.shot) this.sfx.play(sounds.shot, p.pos);
      const whiz = s.hitMe ? undefined : sounds.nearMiss;
      const miss = whiz && this.closestPass(p);
      if (whiz && miss && miss.distance <= whiz.within) {
        const sound = whiz.sounds[Math.floor(Math.random() * whiz.sounds.length)];
        this.sfx.play(sound, miss.at, { delay: NEAR_MISS_DELAY, along: miss.along });
      }
    }
    this.pendingShots = [];
  }

  // Where a shot from `p` (from their eyes along their look, stopped by walls and its range) came
  // closest to the local player's eyes, how far from them, and which way it was going; null if it
  // never came level with them.
  private closestPass(p: PlayerState): { at: Vec3; distance: number; along: Vec3 } | null {
    const me = this.prediction?.state;
    if (!me || this.dead || !p.item) return null;
    const dir = lookDirection(p.yaw, p.pitch);
    const from = eyeOf(p);
    const ear = eyeOf(me);
    const range = ITEMS[p.item.id].range;
    const reach = Math.min(range, WORLD_STRUCTURES.raycast(from, dir, range));
    const along = (ear.x - from.x) * dir.x + (ear.y - from.y) * dir.y + (ear.z - from.z) * dir.z;
    if (along <= 0 || along > reach) return null;
    const at = { x: from.x + dir.x * along, y: from.y + dir.y * along, z: from.z + dir.z * along };
    return { at, distance: Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z), along: dir };
  }

  private addAvatar(p: PlayerState): void {
    if (this.avatars.has(p.id)) return;
    const avatar = createAvatar(this.engine, p);
    avatar.hide();
    this.avatars.set(p.id, avatar);
    this.wantVoice(p.avatar, false);
  }

  private frame(dt: number): void {
    if (!this.prediction) return;
    this.syncBlocked();
    this.input.update();
    this.holdLook(dt);
    const sampled = this.interp.sample(performance.now(), this.myId);
    // Off the eyes the camera's centre ray and theirs differ, so the look sent (the shot, the head's
    // turn) is the eyes' at what the crosshair is on, from where the camera was last frame.
    this.aim = this.view.aim(
      eyeOf(this.prediction.state),
      this.camera.position,
      this.input.yaw,
      this.input.pitch,
      this.myId,
      targets(sampled.players),
      WORLD_STRUCTURES,
    );

    // After a long frame the ticks it covered are all sent, up to as many as the server waits for
    // (each stepped in its own place there); time past that is let go, and the server has stepped on.
    this.accumulator += Math.min(dt, TICK_DT * INPUT_WAIT_TICKS);
    while (this.accumulator >= TICK_DT) {
      this.accumulator -= TICK_DT;
      const frame = this.input.sampleFrame(
        this.prediction.nextSeq(),
        this.overlay.reading,
        this.itemActions(),
        this.interp.viewTick,
        !!this.prediction.state.riding,
      );
      frame.yaw = this.aim.yaw;
      frame.pitch = this.aim.pitch;
      frame.use = this.use;
      this.use = null;
      this.prediction.apply(frame);
      this.conn.send({ t: 'input', f: frame });
    }

    const decay = Math.pow(0.5, dt / CORRECTION_HALF_LIFE);
    this.correction.scaleInPlace(decay);
    this.stepEase *= Math.pow(0.5, dt / STEP_EASE_HALF_LIFE);
    const self = this.prediction.state;
    // A driver is where their kart is drawn, between its ticks, and their look turns with it.
    const driven = self.riding ? this.prediction.kartBetween(this.accumulator) : null;
    this.driving.follow(this.input, driven, dt);
    const p = driven ? seatedAt(driven) : self.pos;
    const eye = new Vector3(p.x + this.correction.x, p.y + this.correction.y, p.z + this.correction.z);
    // The camera sits at the avatar's own eyes with its own width of view, easing there when the
    // look changes, and never up through a lintel or ceiling the body fits under.
    const worn = statureOf(self.avatar);
    this.stature = this.stature === null ? worn : this.stature + (worn - this.stature) * Math.min(1, dt / EYE_EASE);
    // A new class is seen its own way (a dragon from behind and above, by default).
    const cls = classOf(self.avatar).id;
    if (cls !== this.classId) {
      if (cls === 'asian-dragon') this.view.set('third');
      this.mobile.setClass(cls);
      this.classId = cls;
    }
    this.hud.setKeys(legendOf(self));
    this.mobile.setDriving(!!self.riding);
    if (self.avatar !== this.look) {
      if (this.look) this.say(this.myId, 'enter');
      this.look = self.avatar;
      this.wantVoice(self.avatar, true);
    }
    // The look the player comes in as says its intro too, once the start press (main.ts showStart,
    // which takes #start away) has let sound play, with longer to arrive than a switch's: it is
    // fetched among everything else the world's first seconds send for.
    if (!this.introduced && !document.getElementById('start')) {
      this.introduced = true;
      const intro = take(VOICES[self.avatar].enter);
      if (intro) this.sfx.soon(intro, null, START_INTRO_LATE_MS, this.myId);
    }
    // A new look or a new item in hand takes the scope with it, as death does.
    const wearing = `${self.avatar} ${self.item?.id ?? ''}`;
    if (wearing !== this.wearing) {
      this.wearing = wearing;
      this.setScoped(false);
    }
    // Metres the eyes are above the body's eye point: sat in a kart, its feet on the seat, they're
    // down at the share of its height that stands out of it.
    const lift = self.riding ? this.seatedEyes() - EYE_HEIGHT : (this.stature - 1) * EYE_HEIGHT;
    this.camera.minZ = Math.min(NEAR, this.stature * EYE_HEIGHT * NEAR_SHARE);
    // On its feet, the camera rides the ground (ride.ts) rather than the sim's feet; a change
    // between the two is eased like a step.
    if (this.lastPos) {
      const dx = p.x - this.lastPos.x;
      const dz = p.z - this.lastPos.z;
      const moved = Math.hypot(dx, dz);
      if (moved > 1e-4 && moved < SNAP_DISTANCE) this.walkDir = { x: dx / moved, z: dz / moved };
    }
    this.lastPos = { x: p.x, z: p.z };
    const feet = p.y - EYE_HEIGHT;
    const rides = cls === 'walker' && !this.dead && !self.climb && !self.riding && isGrounded(self);
    const riding = rides ? rideGround(WORLD_STRUCTURES, p.x, p.z, this.walkDir, feet) - feet : null;
    if ((this.riding === null) !== (riding === null)) this.stepEase += (this.riding ?? 0) - (riding ?? 0);
    this.riding = riding;
    const above = lift + (riding ?? 0) + this.stepEase; // metres the camera's eyes are over the body's eye point
    if (!this.scoped) this.camera.fov = this.wornFov();
    // The bob follows the feet's own walk, so it fades out against a wall and stops in the air,
    // down the scope and in death; its dip is deepest as each step lands.
    const walking =
      !this.dead && !this.scoped && isGrounded(self) ? Math.sqrt(Math.min(1, self.walk / walkSpeedOf(self.avatar))) : 0;
    this.bobbing += (walking - this.bobbing) * Math.min(1, dt / BOB_EASE);
    const dip =
      ((BOB * this.stature * this.bobbing) / 2) * (1 + Math.cos(2 * Math.PI * this.footsteps.phase(this.myId)));
    const room = above > 0 ? Math.max(eye.y, WORLD_STRUCTURES.ceilingAt(eye.x, eye.z, eye.y) - CEILING_GAP) : Infinity;
    const eyes = new Vector3(eye.x, Math.min(eye.y + above, room), eye.z);
    this.view.place(
      this.camera,
      eyes,
      dip,
      this.input.yaw + this.swing,
      this.input.pitch,
      this.boom(),
      this.scoped,
      WORLD_STRUCTURES,
      dt,
    );
    this.kick *= Math.pow(0.5, dt / KICK_HALF_LIFE);
    if (this.kick < 1e-4) this.kick = 0;
    this.camera.rotation.set(this.input.pitch - this.kick, this.input.yaw + this.swing, 0);

    this.environment.setVisibility(this.scoped ? SCOPED_FOG_SCALE : 1);
    this.environment.update(dt, eye);
    this.frost.update(dt, this.camera.position);
    this.interiors.update(this.camera, this.scoped ? this.scopeCone() : null);
    this.wallFrames.update(this.camera);
    const held = this.held;
    if (!held) this.setScoped(false);
    this.viewmodel.show(held && !this.scoped && !this.dead && this.view.atEyes ? held.id : null, self.avatar);
    this.viewmodel.setFiring(self.firing);
    this.viewmodel.swing(this.view.atEyes && !this.dead ? self.strike : null, strikeOf(self.avatar), dt);
    this.viewmodel.update(dt);
    const showHint = held && !this.dead;
    // A driver on a mouse device, their hands empty, is told how to get out (unless Lakitu has
    // their kart: there's no getting out of his hands), and how their kart is going; on touch the
    // OUT button says the one, and there's no room for the other.
    const driving = !!self.riding && !this.dead && !IS_TOUCH;
    const free = driving && !this.prediction.kart?.rescue;
    this.hud.setItemHint(
      free ? EXIT_HINT : showHint ? itemHint(held.id, !IS_TOUCH, this.scoped, classOf(self.avatar)) : '',
      held && !ITEMS[held.id].own ? itemStats(held.id) : '',
      free ? 'kart' : showHint ? held.id : '',
      held ? ITEMS[held.id].element : null,
    );
    // A look's own moves get their hint as the look is taken, once the start press (main.ts
    // showStart, which takes #start away) has let the player in to read it.
    // None while driving: a kart's keys are its own.
    const moves = this.dead || self.riding || document.getElementById('start') ? [] : movesHelp(self.avatar, IS_TOUCH);
    this.hud.setMoveHint(self.avatar.toUpperCase(), moves);
    const fuelMax = held && ITEMS[held.id].fuelSeconds;
    this.fuel.set(
      held && fuelMax && held.fuel !== null && !this.dead ? held.fuel / fuelMax : null,
      held ? ITEMS[held.id].element : null,
    );
    this.gearHud.set(this.dead ? null : self.gear);
    this.condition.set(this.dead ? 0 : self.chilled);
    this.kartGauge.set(driving ? this.prediction.kartPace() : null);
    // Driving a kart that's down past the world's edge, there's nothing to do but wait for Lakitu
    // (sim/vehicles/rescue.ts). On foot there, the Room bleeds hearts.
    const lost = !this.dead && !!self.riding && !!this.prediction.kart && stranded(this.prediction.kart);
    const out = !this.dead && !self.riding && cls === 'walker' && onOutsideGround(self.pos.y - EYE_HEIGHT);
    // A pickup touched at full health is left where it is (sim/pickups.ts).
    const full =
      !this.dead &&
      atFullHealth(self) &&
      sampled.pickups.some((pickup) => touchesPickup(pickup.kind, pickup, self.pos, EYE_HEIGHT));
    this.alert.hold(
      lost
        ? "you're off the map!\nhold on, Lakitu's coming"
        : out
          ? "you're out of bounds!\nget back on the map"
          : full
            ? "you're already at full health"
            : null,
    );
    this.commandHint.update(this.isBlocked());
    this.minimap.update({
      me: { x: p.x, y: p.y, z: p.z, yaw: this.input.yaw },
      players: sampled.players,
      cubes: sampled.cubes,
    });
    this.menu.sync({
      name: self.name,
      avatar: self.avatar,
      color: self.color,
      item: held?.id ?? null,
      gear: self.gear?.id ?? null,
      chilled: self.chilled > 0,
      shattered: self.dragon?.shattered ?? [],
      kart: self.riding ? (this.prediction.kart?.kart ?? null) : null,
    });

    const stepLoops = this.footsteps.update(
      [
        {
          id: this.myId,
          pos: self.pos,
          walk: self.walk,
          avatar: self.avatar,
          grounded: !this.dead && isGrounded(self),
          leap: self.leap,
          hop: self.hop,
          backflip: self.backflip,
          crouch: self.crouch,
          climbing: self.climb !== null,
          pound: self.pound !== null,
          floating: self.floating,
          falling: -self.vy,
          self: true,
        },
        ...sampled.players.map((rp) => ({
          id: rp.id,
          pos: { x: rp.x, y: rp.y, z: rp.z },
          walk: rp.walk,
          avatar: rp.avatar,
          grounded: rp.grounded && !rp.dead,
          leap: rp.leap,
          hop: rp.hop,
          backflip: rp.backflip,
          crouch: rp.crouch,
          climbing: rp.climb !== null,
          pound: rp.pound !== null,
          floating: rp.floating,
          self: false,
        })),
      ],
      dt,
    );
    this.pounding(
      this.myId,
      self.avatar,
      self.pound?.stage ?? null,
      self.pos,
      self.pound ? self.pound.from - self.pos.y : 0,
    );
    this.striking(this.myId, self.avatar, self.strike, self.pos);
    for (const rp of sampled.players) {
      this.pounding(rp.id, rp.avatar, rp.pound, { x: rp.x, y: rp.y, z: rp.z }, rp.poundHeight);
      this.striking(rp.id, rp.avatar, rp.strike, { x: rp.x, y: rp.y, z: rp.z });
    }
    // The kart the player drives is drawn where they predict it, eased as they are. Karts are drawn
    // before bodies, so a driver sits in their kart where it's drawn this frame.
    const c = this.correction;
    const karts = sampled.karts.map((k) =>
      driven && k.id === self.riding
        ? { ...k, ...driven, pos: { x: driven.pos.x + c.x, y: driven.pos.y + c.y, z: driven.pos.z + c.z } }
        : k,
    );
    this.driving.draw(karts, dt);
    this.rescuers.update(karts, this.camera.position, dt);
    // In Lakitu's hands the view closes to a circle on its driver's head and opens from it again.
    // The seconds into the tick to come run it on between a rescue's ticks, as they do the kart.
    const seat = self.riding ? this.driving.seatOf(self.riding) : null;
    const shut = driven?.rescue && !this.dead ? shutAt(driven.rescue.t + this.accumulator) : 0;
    const head = shut > 0 && seat ? new Vector3(seat.at.x, seat.at.y + this.seatedEyes(), seat.at.z) : null;
    this.iris.set(shut, head, this.engine.scene, this.camera);
    // What's heard of a kart is sent for as the first is seen, to be here by its first knock, and a
    // look's cry at a boost as it's first seen driving one.
    if (karts.length > 0 && !this.hearsKarts) {
      this.hearsKarts = true;
      for (const id of Object.values(KART_SOUNDS)) this.sfx.want(id);
    }
    for (const k of karts) {
      const driver = k.driver === this.myId ? self.avatar : k.driver && this.avatars.get(k.driver)?.kind;
      if (!driver || this.drivers.has(driver)) continue;
      this.drivers.add(driver);
      for (const id of VOICES[driver].boost ?? []) this.sfx.want(id);
    }
    const readers = new Map<string, number>();
    const seen = new Set<string>();
    for (const rp of sampled.players) {
      seen.add(rp.id);
      let avatar = this.avatars.get(rp.id);
      // A new look, or a new colour on the figure that wears it, is a new avatar.
      const was = avatar?.kind;
      if (!avatar || was !== rp.avatar || (avatar.color !== undefined && avatar.color !== rp.color)) {
        avatar = createAvatar(this.engine, rp, avatar ?? null);
        this.avatars.set(rp.id, avatar);
        this.wantVoice(rp.avatar, false);
        if (was && was !== rp.avatar) this.say(rp.id, 'enter');
      }
      avatar.update(rp, this.footsteps.phase(rp.id), rp.riding ? this.driving.seatOf(rp.riding) : null);
      if (rp.reading) readers.set(rp.reading, (readers.get(rp.reading) ?? 0) + 1);
    }
    for (const [id, avatar] of this.avatars) if (!seen.has(id)) avatar.hide();
    this.updateOwnAvatar({ x: eye.x, y: p.y + this.correction.y, z: eye.z }, held);
    this.pins.update(sampled.players, this.engine.scene, this.camera, this.canvasEl);
    this.nameTags.update(sampled.players, this.engine.scene, this.camera, this.canvasEl);
    this.bubble.update(this.engine.scene, this.camera, this.canvasEl);
    this.frameBubble.update(this.engine.scene, this.camera, this.canvasEl);
    this.areaTitle.update(p);

    this.loader.update(p.x, p.z);
    this.models.update();
    this.updateHover();
    // Red crosshair when a shot from here would land: same maths the server will run.
    const me = this.prediction.state;
    const hit =
      !!held &&
      !this.dead &&
      this.canFire() &&
      resolveFire(
        ITEMS[held.id],
        { id: this.myId, pos: me.pos, yaw: this.aim.yaw, pitch: this.aim.pitch, avatar: me.avatar, dragon: me.dragon },
        targets(sampled.players),
        WORLD_STRUCTURES,
      ).length > 0;
    this.mobileActions.update({
      hot: !!this.hovered,
      item: held?.id ?? null,
      scoped: this.scoped,
      canFire: this.canFire(),
      climbing: !!self.climb,
      driving: !!self.riding,
      move: this.dead || self.riding ? null : this.ownMove(self),
    });
    if (hit !== this.canHit) {
      this.canHit = hit;
      this.hud.setCrosshairTarget(this.canHit);
    }
    this.sfx.listen(this.camera.position, this.input.yaw);
    const living: Living[] = [
      ...(this.dead ? [] : [{ id: this.myId, avatar: self.avatar, at: self.pos, risen: self.dragon?.risen ?? null }]),
      ...sampled.players.flatMap((rp) =>
        rp.dead
          ? []
          : [{ id: rp.id, avatar: rp.avatar, at: { x: rp.x, y: rp.y, z: rp.z }, risen: rp.dragon?.risen ?? null }],
      ),
    ];
    this.cryOut(living);
    const music = this.music(living);
    this.sfx.setLoops([
      ...loopsOf({ ...self, item: self.item?.id ?? null, gear: self.gear?.id ?? null, dead: this.dead }).map((id) => ({
        key: this.myId,
        id,
        at: null,
      })),
      ...sampled.players.flatMap((rp) => loopsOf(rp).map((id) => ({ key: rp.id, id, at: rp }))),
      ...karts.flatMap((k) => this.kartLoops(k)),
      ...stepLoops,
      ...(music ? [music] : []),
    ]);
    this.pickups.update(sampled.pickups);
    for (const cs of sampled.cubes) {
      const cube = this.cubes.get(cs.id);
      if (!cube) continue;
      cube.setReaders(readers.get(cs.id) ?? 0);
      cube.update(cs);
    }
  }

  // What's heard of kart `k` this frame: its loops, flat for the one the player drives (keyed apart,
  // so getting in or out crosses over between the two) and from where it is for any other, those
  // within earshot only, so a room full of karts costs the few that are near.
  private kartLoops(k: Kart): { key: string; id: SoundId; at: Vec3 | null; level: number; rate: number }[] {
    const mine = k.driver === this.myId;
    const away = Vector3.Distance(this.camera.position, new Vector3(k.pos.x, k.pos.y, k.pos.z));
    return kartLoops(k)
      .filter((loop) => mine || heard(loop.id, away) > 0)
      .map((loop) => ({ ...loop, key: mine ? `${k.id}:driven` : k.id, at: mine ? null : k.pos }));
  }

  // Every dragon with a voice rises out of the ground with its cry, kept trying until the recording
  // has arrived, and heard again from the same player's next rise.
  private cryOut(living: Living[]): void {
    for (const body of living) {
      const voice = voiceOf(body.avatar);
      if (!voice || body.risen === null) continue;
      if (body.risen) this.cried.delete(body.id);
      else if (!this.cried.has(body.id) && this.sfx.call(voice.cry, body.at)) this.cried.add(body.id);
    }
  }

  // The one theme the player hears. None while their look's death sound plays: that's all the music
  // there is until it ends. Their own look's, if it has one (voices.ts `Theme`), wherever
  // they are: nothing plays over a character's theme. Without one, the nearest of the themes round
  // them: a living player's that everyone hears (a dragon's, from its head), or a building's
  // (PLACE_THEMES) from its walls across its grounds, the only one heard from inside them; kept
  // until another is THEME_HYSTERESIS nearer, one crossing into the next over the sounds' swell and
  // fade. A worn theme runs for as long as anyone the player could hear it from wears it, heard or
  // not, and a building's for the rest of the visit, so one taken up again is heard from where it
  // has got to.
  private music(living: Living[]): Music | null {
    const now = performance.now();
    const worn = living.flatMap((body) => {
      const theme = VOICES[body.avatar].theme;
      return theme && (body.id === this.myId || theme.heardBy === 'everyone') ? [{ ...body, theme }] : [];
    });
    const sounds = new Set(worn.map((w) => w.theme.sound));
    for (const sound of this.wornClocks.keys()) if (!sounds.has(sound)) this.wornClocks.delete(sound);
    const elapsed = new Map([...sounds].map((sound) => [sound, this.running(this.wornClocks, sound, now)]));

    if (now < this.mourningUntil) {
      this.themeOf = null;
      return null;
    }
    const mine = worn.find((w) => w.id === this.myId);
    if (mine) {
      this.themeOf = mine.id;
      const { sound, heardBy } = mine.theme;
      return {
        key: 'own',
        id: sound,
        at: null,
        elapsed: elapsed.get(sound)!,
        // A theme everyone hears comes from the wearer's body, so they hear their own as from the
        // boom's length off, and the camera closing in on the head (at a wall) doesn't swell it.
        level: heardBy === 'everyone' ? heard(sound, boomLength(mine.avatar)) : 1,
      };
    }

    const ear = this.camera.position;
    const feet = living.find((body) => body.id === this.myId)?.at;
    const contenders: Contender[] = [
      ...worn.map((w) => ({
        key: 'worn',
        id: w.theme.sound,
        at: w.at,
        elapsed: elapsed.get(w.theme.sound)!,
        level: 1,
        metres: Vector3.Distance(ear, new Vector3(w.at.x, w.at.y, w.at.z)),
        inside: false,
        holder: w.id,
      })),
      ...PLACE_THEMES.flatMap((p) => {
        const metres = p.walls(ear);
        const level = heard(p.theme, metres);
        if (level <= 0) return [];
        return [
          {
            key: 'place',
            id: p.theme,
            at: null,
            elapsed: this.running(this.placeClocks, p.theme, now),
            level,
            metres,
            inside: feet !== undefined && p.walls(feet) === 0,
            holder: `place:${p.theme}`,
          },
        ];
      }),
    ];
    const nearest = contenders.sort((a, b) => a.metres - b.metres)[0];
    const kept = contenders.find((c) => c.holder === this.themeOf);
    const playing =
      contenders.find((c) => c.inside) ??
      (kept && nearest && kept.metres < nearest.metres + THEME_HYSTERESIS ? kept : nearest);
    this.themeOf = playing?.holder ?? null;
    return playing ?? null;
  }

  // Seconds a theme has been running by `clocks`, which it joins on the first frame its recording
  // is here, so it begins from the top however long it took to arrive; 0 until then.
  private running(clocks: Map<SoundId, number>, sound: SoundId, now: number): number {
    if (!clocks.has(sound) && this.sfx.ready(sound)) clocks.set(sound, now);
    const began = clocks.get(sound);
    return began === undefined ? 0 : (now - began) / 1000;
  }

  // The player's own body: where prediction has it (its eye point `at`, corrected but not trailing a
  // step like the camera), turned to the look sent. Drawn in third person, and from the eyes only
  // where the body goes on behind them without the head (a dragon's).
  private updateOwnAvatar(at: Vec3, held: ItemState | null): void {
    const self = this.prediction!.state;
    let avatar = this.ownAvatar;
    if (!avatar || avatar.kind !== self.avatar || (avatar.color !== undefined && avatar.color !== self.color)) {
      avatar = this.ownAvatar = createAvatar(this.engine, self, avatar);
      avatar.scaleWeapons(OWN_WEAPON_SCALE);
    }
    const own: Avatar = avatar;
    const shown = this.view.showsBody;
    if (!shown && !own.setHeadless) {
      own.hide();
      return;
    }
    own.setHeadless?.(!shown);
    own.update(
      {
        id: self.id,
        name: self.name,
        color: self.color,
        x: at.x,
        y: at.y,
        z: at.z,
        yaw: this.aim.yaw,
        pitch: this.aim.pitch,
        reading: self.reading,
        item: held?.id ?? null,
        firing: self.firing,
        gear: self.gear?.id ?? null,
        thrusting: self.thrusting,
        walk: self.walk,
        leap: self.leap,
        hop: self.hop,
        pound: self.pound?.stage ?? null,
        poundHeight: self.pound ? self.pound.from - self.pos.y : 0,
        crouch: self.crouch,
        backflip: self.backflip,
        strike: self.strike,
        floating: self.floating,
        climb: self.climb,
        chilled: self.chilled > 0,
        dead: this.dead,
        avatar: self.avatar,
        dragon: self.dragon,
        riding: self.riding,
        bot: false,
        grounded: isGrounded(self),
      },
      this.footsteps.phase(this.myId),
      self.riding ? this.driving.seatOf(self.riding) : null,
    );
  }

  // Whether the look (o, d) lands on the foghorn within reach with nothing in the way. HORN stands
  // the clock on the world's ground like any Structures, so a look landing on that ground first is
  // no look at the clock.
  private hornAt(o: Vec3, d: Vec3): boolean {
    if (Math.hypot(o.x - HORN_AT.x, o.y - HORN_AT.y, o.z - HORN_AT.z) > HORN_NEAR) return false;
    const hit = HORN.touch(o, d, HORN_REACH);
    return hit?.piece === 0 && WORLD_STRUCTURES.raycast(o, d, hit.t) >= hit.t - HORN_SLACK;
  }

  private updateHover(): void {
    // A door in reach of the look is used by a click; say so while the crosshair is on one.
    const me = this.prediction?.state;
    const look = lookVector(this.aim.yaw, this.aim.pitch);
    const door = me && !this.dead ? WORLD_STRUCTURES.doorAt(me.pos, look, DOOR_REACH) : null;
    const tap = IS_TOUCH ? 'tap' : 'click';
    this.hitNotice.prompt(door ? `${tap} to ${WORLD_STRUCTURES.isOpen(door) ? 'shut' : 'open'} the door` : null);
    this.hoveredUse = door;
    const horn = !!me && !this.dead && !door && this.hornAt(me.pos, lookVector(this.aim.yaw, this.aim.pitch));
    if (horn && !this.hoveredHorn) this.sfx.want('boat-horn');
    this.hoveredHorn = horn;
    let nextCube: CubeMesh | null = null;
    let nextSky: SkyObject | null = null;
    let nextFrame: HungFrame | null = null;
    if (!this.isBlocked()) {
      const ray = new Ray(this.camera.position, this.camera.getForwardRay().direction, HOVER_RANGE);
      // What a name says is there to point at, less what's drawn over it and not meant to be (an old
      // screen's pass over a frame, a frame's border): a predicate of its own skips the pickable check.
      const hit = this.engine.scene.pickWithRay(ray, (mesh) => mesh.isPickable && /^(cube|sky|frame)-/.test(mesh.name));
      // Structures aren't pickable; anything behind one is hidden by it.
      const blocked =
        !!hit?.pickedMesh && WORLD_STRUCTURES.raycast(ray.origin, ray.direction, hit.distance) < hit.distance;
      if (hit?.pickedMesh && !blocked) {
        if (hit.distance <= CUBE_SELECT_RANGE) nextCube = this.cubeByMesh.get(hit.pickedMesh.name) ?? null;
        nextSky = this.skyByMesh.get(hit.pickedMesh.name) ?? null;
        if (hit.distance <= FRAME_RANGE) nextFrame = this.wallFrames.at(hit.pickedMesh.name);
      }
    }
    if (nextCube !== this.hovered) {
      this.hovered?.setHovered(false);
      nextCube?.setHovered(true);
      this.hovered = nextCube;
    }
    if (nextSky !== this.hoveredSky) {
      this.hoveredSky?.setHovered(false);
      nextSky?.setHovered(true);
      this.hoveredSky = nextSky;
      if (nextSky) this.bubble.hover(nextSky.content.line, nextSky.anchor());
      else this.bubble.release();
    }
    if (nextFrame) this.frameBubble.hover(nextFrame.frame.show.line, nextFrame.above);
    else if (this.hoveredFrame) this.frameBubble.release();
    this.hoveredFrame = nextFrame;
    this.hud.setCrosshairHot(!!nextCube || !!nextSky || !!nextFrame || horn);
  }

  // Exposed for the end-to-end test.
  setLook(yaw: number, pitch = 0): void {
    this.input.yaw = yaw;
    this.input.pitch = pitch;
  }

  debug(): {
    id: string;
    pos: { x: number; y: number; z: number };
    remotes: { id: string; name: string; x: number; y: number; z: number }[];
    sky: { id: string; x: number; z: number }[];
    frost: number; // cells frosted over
  } {
    const remotes = this.interp
      .sample(performance.now(), this.myId)
      .players.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, z: p.z }));
    const sky = [...this.skyByMesh.values()].map((s) => ({
      id: s.content.id,
      x: Math.round(s.mesh.position.x),
      z: Math.round(s.mesh.position.z),
    }));
    return {
      id: this.myId,
      pos: { ...(this.prediction?.state.pos ?? { x: 0, y: 0, z: 0 }) },
      remotes,
      sky,
      frost: WORLD_STRUCTURES.frost.size,
    };
  }
}

// A key as the hint bar draws one: its name in square brackets (ui/Hud.ts).
const keyed = (code: string): string => `[${keyLabel(code)}]`;

const EXIT_HINT = actionHelp({ exit: KART_ACTIONS.exit }, ', ', keyed);

// The hint bar's text. A look's own weapon (a dragon's breath) is its name alone: a click fires it
// as anywhere, and the look's keys are in the legend. A scope-only weapon leads with the step
// that's missing; a class with actions of its own has them after the item's.
function itemHint(id: ItemId, withKeys: boolean, scoped: boolean, cls: ClassSpec): string {
  const parts = [ITEMS[id].name.toUpperCase()];
  if (ITEMS[id].own) return parts[0];
  if (ITEMS[id].fireNeedsScope && !scoped)
    parts.push(withKeys ? '[F] to scope, then click to shoot' : '[SCOPE] to shoot');
  else if (withKeys) parts.push(actionHelp(ITEMS[id].actions, ' · ', keyed));
  const own = withKeys ? actionHelp(cls.actions, ', ', keyed) : '';
  if (own) parts.push(own);
  return parts.join(' · ');
}

// Metres the camera hangs behind whoever wears `avatar` in third person.
function boomLength(avatar: RemotePlayer['avatar']): number {
  const boom = boomOf(avatar);
  return Math.hypot(boom.back, boom.right, boom.up);
}

// A kart's wrenches, as a life of them in a row (Hearts), however many its row in KARTS gives it.
const WRENCHES: LifeSpec = { hearts: KARTS.standard.wrenches, row: 5, sprite: 'wrench' };

// How the death screen says a kill was done, where it isn't a shot.
const KILLED_BY: Partial<Record<KillItem, string>> = { kart: 'run over', explosion: 'blown up' };

function targets(players: RemotePlayer[]) {
  return players.map((p) => ({
    id: p.id,
    pos: { x: p.x, y: p.y, z: p.z },
    dead: p.dead,
    avatar: p.avatar,
    dragon: p.dragon,
    riding: p.riding,
  }));
}

// An angle brought within [-π, π].
function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}
