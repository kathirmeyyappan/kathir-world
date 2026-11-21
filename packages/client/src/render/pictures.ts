// Pictures read as pixels, for whatever paints one before it's drawn: a kart's body in a livery's
// colours, an emblem set on a kart's patch or inked in a primary.
import { RawTexture, Texture, type Scene } from '@babylonjs/core';

export interface Pixels {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

// The picture at `url`, read through a canvas.
export async function pixelsOf(url: string): Promise<ImageData> {
  const image = await createImageBitmap(await (await fetch(url)).blob());
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

// Pixels as a texture, sampled to the nearest like the game's pixel art.
export function pixelTexture(scene: Scene, { data, width, height }: Pixels): Texture {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return RawTexture.CreateRGBATexture(bytes, width, height, scene, true, false, Texture.NEAREST_NEAREST_MIPLINEAR);
}
