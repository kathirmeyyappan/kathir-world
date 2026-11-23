// The line a track ends at (sim/tracks.ts `Track.finish`): squares of black and white across the
// road, lying a hair over it with the road's own slope.
import { Mesh, RawTexture, StandardMaterial, Texture, VertexData, type Scene } from '@babylonjs/core';
import { ROAD_WIDTH, spotAt, type Track, type TrackSpot } from '@world/shared';

const SQUARE = 1; // metres across a square
const ROWS = 2; // rows of squares along the road
const LIFT = 0.03; // metres over the road it lies: a mesh laid in a surface flickers against it

export class FinishLine {
  private mesh: Mesh | null = null;
  private material: StandardMaterial | null = null; // made at the first line

  constructor(private readonly scene: Scene) {}

  // The line across `track`'s finish; null: none.
  set(track: Track | null): void {
    this.mesh?.dispose();
    this.mesh = null;
    if (!track) return;
    const near = spotAt(track, track.finish);
    const far = spotAt(track, track.finish + ROWS * SQUARE);
    const across = ROAD_WIDTH / 2;
    // A spot's left and right ends of the line, looking along the track.
    const ends = (s: TrackSpot) =>
      [-across, across].flatMap((side) => [s.x + Math.cos(s.yaw) * side, s.y + LIFT, s.z - Math.sin(s.yaw) * side]);
    const data = new VertexData();
    data.positions = [...ends(near), ...ends(far)];
    data.indices = [0, 2, 1, 1, 2, 3];
    // The picture is two squares each way, so it repeats every two.
    const repeats = ROAD_WIDTH / SQUARE / 2;
    data.uvs = [0, 0, repeats, 0, 0, ROWS / 2, repeats, ROWS / 2];
    data.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    this.mesh = new Mesh('finish-line', this.scene);
    data.applyToMesh(this.mesh);
    this.mesh.isPickable = false;
    this.mesh.material = this.material ??= this.checkers();
  }

  private checkers(): StandardMaterial {
    const [white, black] = [
      [245, 245, 245, 255],
      [14, 14, 16, 255],
    ];
    const picture = RawTexture.CreateRGBATexture(
      new Uint8Array([...white, ...black, ...black, ...white]),
      2,
      2,
      this.scene,
      false,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    );
    picture.wrapU = picture.wrapV = Texture.WRAP_ADDRESSMODE;
    const material = new StandardMaterial('finish-line', this.scene);
    material.emissiveTexture = picture;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.zOffset = -2; // toward the eye, so a far-off road's coarse depth can't swallow it
    return material;
  }
}
