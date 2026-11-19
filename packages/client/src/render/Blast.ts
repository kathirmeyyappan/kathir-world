// A kart blowing up: a flash of light, a ball of fire bursting out and rising, smoke rolling up
// after it (grey, to show against a dark world) and bits flung out to fall, gone in a couple of seconds. One burst a call; each particle
// system disposes itself, texture and all.
import { Color4, ParticleSystem, Vector3 } from '@babylonjs/core';
import type { Engine } from './Engine';
import { plusSprites, softDisc } from './Poof';

const FLASH = { seconds: 0.3, across: 10 }; // the light: how long it lasts and the metres it spreads to
const FIRE = { count: 48, radius: 0.6, size: [0.5, 1.2], life: [0.5, 1], speed: [5, 13], rise: 2 };
const SMOKE = { count: 22, radius: 0.8, from: 1.1, to: 3.4, life: [1.4, 2.4], speed: [1.5, 4], rise: 1.4 };
const BITS = { count: 20, radius: 0.5, size: [0.16, 0.3], life: [0.8, 1.4], speed: [7, 14], fall: 16 };

// A burst of `count` particles from `at`, all at once, its system gone once they are.
function burst(engine: Engine, name: string, at: Vector3, count: number, seconds: number): ParticleSystem {
  const ps = new ParticleSystem(name, count, engine.scene);
  ps.emitter = at.clone();
  ps.updateSpeed = 1 / 60; // so lifetimes are seconds and powers metres per second
  ps.applyFog = false;
  ps.manualEmitCount = count;
  ps.targetStopDuration = seconds;
  ps.disposeOnStop = true;
  return ps;
}

export function blast(engine: Engine, at: Vector3): void {
  const flash = burst(engine, 'blast-flash', at, 2, FLASH.seconds + 0.1);
  flash.particleTexture = softDisc(engine);
  flash.blendMode = ParticleSystem.BLENDMODE_ADD;
  flash.minEmitPower = flash.maxEmitPower = 0;
  flash.minLifeTime = flash.maxLifeTime = FLASH.seconds;
  flash.addSizeGradient(0, FLASH.across * 0.3);
  flash.addSizeGradient(1, FLASH.across);
  flash.addColorGradient(0, new Color4(1, 0.97, 0.85, 1));
  flash.addColorGradient(0.4, new Color4(1, 0.7, 0.25, 0.6));
  flash.addColorGradient(1, new Color4(1, 0.35, 0.05, 0));
  flash.start();

  // The fire: the "+"s of a poof, lit, bursting hard and braking as they rise, cooling from yellow
  // through orange to a dull red as they go out.
  const fire = burst(engine, 'blast-fire', at, FIRE.count, FIRE.life[1] + 0.1);
  plusSprites(engine, fire, 1);
  fire.blendMode = ParticleSystem.BLENDMODE_ADD;
  fire.createHemisphericEmitter(FIRE.radius);
  [fire.minSize, fire.maxSize] = FIRE.size;
  [fire.minLifeTime, fire.maxLifeTime] = FIRE.life;
  [fire.minEmitPower, fire.maxEmitPower] = FIRE.speed;
  fire.addVelocityGradient(0, 1);
  fire.addVelocityGradient(1, 0.12);
  fire.addColorGradient(0, new Color4(1, 0.95, 0.6, 1));
  fire.addColorGradient(0.55, new Color4(1, 0.55, 0.1, 1));
  fire.addColorGradient(1, new Color4(0.7, 0.1, 0.02, 0));
  fire.minAngularSpeed = -4;
  fire.maxAngularSpeed = 4;
  fire.gravity = new Vector3(0, FIRE.rise, 0);
  fire.start();

  const smoke = burst(engine, 'blast-smoke', at, SMOKE.count, SMOKE.life[1] + 0.1);
  smoke.particleTexture = softDisc(engine);
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  smoke.createHemisphericEmitter(SMOKE.radius);
  smoke.addSizeGradient(0, SMOKE.from);
  smoke.addSizeGradient(1, SMOKE.to);
  [smoke.minLifeTime, smoke.maxLifeTime] = SMOKE.life;
  [smoke.minEmitPower, smoke.maxEmitPower] = SMOKE.speed;
  smoke.addVelocityGradient(0, 1);
  smoke.addVelocityGradient(1, 0.1);
  smoke.addColorGradient(0, new Color4(0.6, 0.45, 0.3, 0));
  smoke.addColorGradient(0.2, new Color4(0.5, 0.48, 0.46, 0.7));
  smoke.addColorGradient(1, new Color4(0.3, 0.3, 0.32, 0));
  smoke.gravity = new Vector3(0, SMOKE.rise, 0);
  smoke.start();

  // Bits of it, grey, flung out and falling: they blink out where they land.
  const bits = burst(engine, 'blast-bits', at, BITS.count, BITS.life[1] + 0.1);
  plusSprites(engine, bits);
  bits.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  bits.createHemisphericEmitter(BITS.radius);
  [bits.minSize, bits.maxSize] = BITS.size;
  [bits.minLifeTime, bits.maxLifeTime] = BITS.life;
  [bits.minEmitPower, bits.maxEmitPower] = BITS.speed;
  bits.color1 = bits.color2 = bits.colorDead = new Color4(1, 1, 1, 1);
  bits.minAngularSpeed = -8;
  bits.maxAngularSpeed = 8;
  bits.gravity = new Vector3(0, -BITS.fall, 0);
  bits.start();
}
