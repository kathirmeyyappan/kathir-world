// Frames on the tower's walls (sim/wallFrames.ts): each a picture or a live widget, drawn sharp by
// the browser through a hole in the scene (CrispPanels), on a wood border set a little further
// back, and for one played like an old screen its bands and static a little further forward
// (OldScreen), all following the wall round segment by segment, a picture fetched while the room it
// hangs in is wanted, drawn only while that room could be seen and let go with it (Interiors.ts). The picture's mesh is pickable as `frame-<n>`, for the
// hover line; the rest isn't.
import { Color3, Mesh, StandardMaterial, Vector3, VertexData, type Camera } from '@babylonjs/core';
import { layoutWallFrame, OFF_WALL, type FramePanel, type WallFrame } from '@world/shared';
import { WIDGETS } from '../widgets';
import { CrispPanels } from './CrispPanels';
import type { Engine } from './Engine';
import type { Interiors } from './Interiors';
import { OldScreen } from './OldScreen';

const BORDER = 0.48; // metres of wood showing round every picture
const BORDER_BACK = 0.015; // metres the border sits behind the picture, so the two never share a plane
const SCREEN_FRONT = 0.015; // metres an old screen's look sits in front of its picture, for the same reason
const WOOD = new Color3(0.42, 0.27, 0.15);
const LINE_GAP = 0.3; // metres between the top of a frame's border and the bottom of its line

export interface HungFrame {
  frame: WallFrame;
  above: Vector3; // where its line sits: just over the middle of its top edge, on the wall
  scroll?: (dy: number) => void; // a widget longer than its frame, moved by the wheel
}

export class WallFrames {
  private readonly byMesh = new Map<string, HungFrame>();
  private readonly crisp: CrispPanels;
  private readonly oldScreen: OldScreen;

  constructor(engine: Engine, frames: readonly WallFrame[], interiors: Interiors) {
    const scene = engine.scene;
    this.crisp = new CrispPanels(engine);
    this.oldScreen = new OldScreen(scene);
    const wood = new StandardMaterial('frame-wood', scene);
    wood.disableLighting = true;
    wood.emissiveColor = WOOD;
    frames.forEach((frame, n) => {
      const picture = layoutWallFrame(frame);
      const mesh = panelsMesh(engine, `frame-${n}`, picture.panels);
      let screen: Mesh | undefined;
      if (frame.crt) {
        screen = panelsMesh(engine, `frame-${n}-screen`, layoutWallFrame(frame, OFF_WALL + SCREEN_FRONT).panels);
        screen.material = this.oldScreen.material;
        screen.isPickable = false;
        screen.applyFog = false; // the picture under it is a page element, which fog never reaches
      }
      const { show } = frame;
      let scroll: HungFrame['scroll'];
      // A picture is fetched while its room is wanted; a widget fetches only while it's shown.
      let load: (() => Promise<void>) | undefined;
      let unload: (() => void) | undefined;
      if (show.kind === 'image') {
        load = () =>
          new Promise((done, fail) => {
            const img = new Image();
            img.onload = () => done();
            img.onerror = fail;
            img.src = show.src;
            this.crisp.add(mesh, picture.panels, img, { screen });
          });
        unload = () => this.crisp.remove(mesh);
      } else {
        const widget = WIDGETS[show.widget](show.aspect);
        widget.onPaint = this.crisp.add(mesh, picture.panels, widget.canvas, { onShown: widget.setShown, screen });
        scroll = widget.scroll;
      }
      mesh.isPickable = true;
      const border = panelsMesh(
        engine,
        `frame-${n}-border`,
        layoutWallFrame(frame, OFF_WALL - BORDER_BACK, BORDER).panels,
      );
      border.material = wood;
      border.isPickable = false;
      mesh.setEnabled(false);
      border.setEnabled(false);
      interiors.add(frame.room.interior, {
        load,
        unload,
        show: (on) => {
          mesh.setEnabled(on);
          border.setEnabled(on);
        },
      });
      const { x, z } = picture.centre;
      this.byMesh.set(mesh.name, { frame, above: new Vector3(x, picture.top + BORDER + LINE_GAP, z), scroll });
    });
  }

  // Line the pictures up with where `camera` sees their frames, and move the old screens on.
  update(camera: Camera): void {
    this.crisp.update(camera);
    this.oldScreen.tick();
  }

  // The frame a picked mesh is, if it's one of these.
  at(meshName: string): HungFrame | null {
    return this.byMesh.get(meshName) ?? null;
  }
}

// One mesh from a frame's flat panels, the picture mapped across them by their `u`.
function panelsMesh(engine: Engine, name: string, panels: FramePanel[]): Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const { corners, u } of panels) {
    const base = positions.length / 3;
    for (const c of corners) positions.push(c.x, c.y, c.z);
    uvs.push(u[0], 0, u[1], 0, u[1], 1, u[0], 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const mesh = new Mesh(name, engine.scene);
  Object.assign(new VertexData(), { positions, uvs, indices }).applyToMesh(mesh);
  return mesh;
}
