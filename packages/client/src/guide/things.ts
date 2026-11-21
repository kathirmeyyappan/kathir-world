// What the guide's item views show: each item on its own, floating and turning as a pickup does in
// the world (sim/pickups.ts), each résumé cube floating as the cubes do (sim/cubes.ts), and each
// kart standing empty, built from the shapes the game draws them with.
import { TransformNode, Vector3 } from '@babylonjs/core';
import {
  CUBE_BASE_Y,
  CUBE_FLOAT_AMPLITUDE,
  ITEMS,
  KARTS,
  PICKUPS,
  PICKUP_BOB,
  PICKUP_BOB_HZ,
  PICKUP_SPIN,
  type Appearance,
  type CubeContent,
  type GearId,
  type ItemId,
  type KartId,
  type PickupKind,
} from '@world/shared';
import type { Thing } from '../render/BodyView';
import { CubeMesh } from '../render/CubeMesh';
import { buildGear } from '../render/Gear';
import { buildHeart, PICKUP_SCALE } from '../render/Pickups';
import { buildTank, buildWeapon, weaponPalette } from '../render/Weapons';
import { KartMesh, parkedKart } from '../render/vehicles/KartMesh';

const HOVER = 1.2; // metres up an item floats over the floor, about where it's held
const ITEM_BOB = 0.03; // of an item's size, how far it floats up and down
const ITEM_BOB_HZ = PICKUP_BOB_HZ / 2; // how often it does, slower than a pickup in the world
// A cube's float and turn: the middle of the ranges the sim draws each cube's from.
const CUBE_FLOAT_HZ = 1.5;
const CUBE_TURN = 0.35;

// Floats `node` up and down by `bob` metres `hz` times a second and turns it, as a pickup does, `t`
// seconds in.
function float(node: TransformNode, height: number, t: number, bob = PICKUP_BOB, hz = PICKUP_BOB_HZ): void {
  node.position.y = height + Math.sin(t * hz * 2 * Math.PI) * bob;
  node.rotation.y = t * PICKUP_SPIN;
}

// Moves `piece` within its parent so the middle of what's built under it sits at the parent's
// origin, the axis it turns about, and gives its size corner to corner.
function centre(piece: TransformNode): number {
  const { min, max } = piece.getHierarchyBoundingVectors();
  piece.position.subtractInPlace(Vector3.Center(min, max));
  return Vector3.Distance(min, max);
}

export function itemThing(id: ItemId): Thing {
  return {
    key: `item-${id}`,
    build(engine, parent) {
      const scene = engine.scene;
      const pal = weaponPalette(scene, `guide-${id}`);
      const node = new TransformNode(`guide-${id}`, scene);
      node.parent = parent;
      const item = new TransformNode(`guide-${id}-item`, scene);
      item.parent = node;
      buildWeapon(scene, `guide-${id}`, id, item, pal);
      // A hold weapon's tank floats beside it, as it hangs on the back of whoever holds it.
      const element = ITEMS[id].element;
      if (element) buildTank(scene, `guide-${id}`, item, pal, element).position.set(-0.35, 0, 0.1);
      const bob = centre(item) * ITEM_BOB;
      return (t) => float(node, HOVER, t, bob, ITEM_BOB_HZ);
    },
  };
}

export function gearThing(id: GearId): Thing {
  return {
    key: `gear-${id}`,
    build(engine, parent) {
      const node = new TransformNode(`guide-${id}`, engine.scene);
      node.parent = parent;
      const piece = new TransformNode(`guide-${id}-piece`, engine.scene);
      piece.parent = node;
      buildGear(engine.scene, `guide-${id}`, id, piece);
      const bob = centre(piece) * ITEM_BOB;
      return (t) => float(node, HOVER, t, bob, ITEM_BOB_HZ);
    },
  };
}

export function pickupThing(kind: PickupKind): Thing {
  const height = PICKUPS[kind].height;
  return {
    key: `pickup-${kind}`,
    build(engine, parent) {
      const heart = buildHeart(engine);
      heart.setEnabled(true); // the shape the world draws copies of, drawn itself here
      heart.parent = parent;
      heart.scaling.setAll(PICKUP_SCALE[kind]);
      return (t) => float(heart, height, t);
    },
  };
}

export function cubeThing(content: CubeContent): Thing {
  return {
    key: `cube-${content.id}`,
    build(engine, parent) {
      const cube = new CubeMesh(engine, content);
      cube.mesh.parent = parent;
      parent.onDisposeObservable.add(() => cube.dispose());
      return (t) =>
        cube.update({
          id: content.id,
          x: 0,
          y: CUBE_BASE_Y + Math.sin(t * CUBE_FLOAT_HZ) * CUBE_FLOAT_AMPLITUDE,
          z: 0,
          rx: Math.sin(t * 0.5) * 0.1,
          ry: t * CUBE_TURN,
        });
    },
  };
}

// Who the guide's karts stand as dropped by: Mario. His colour shows nowhere.
const DROPPER: Appearance = { avatar: 'mario', color: '#ffffff' };

// A kart in Mario's livery, standing on the floor where it drops.
export function kartThing(id: KartId): Thing {
  const { width, length, height } = KARTS[id].body;
  return {
    key: `kart-${id}`,
    shared: true,
    bounds: { min: new Vector3(-width / 2, 0, -length / 2), max: new Vector3(width / 2, height, length / 2) },
    build(engine, parent) {
      const mesh = new KartMesh(engine, `guide-${id}`, id, DROPPER);
      mesh.root.parent = parent;
      parent.onDisposeObservable.add(() => mesh.dispose());
      const kart = parkedKart(`guide-${id}`, id, DROPPER);
      let last = 0;
      return (t) => {
        mesh.update(kart, t - last);
        last = t;
      };
    },
  };
}
