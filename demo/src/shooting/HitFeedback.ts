/**
 * Hit feedback coordinator — manages the 5-layer feedback stack.
 * From research report 02 §4.1:
 *   L1: Crosshair flash
 *   L2: Target animation
 *   L3: HUD numbers
 *   L4: Screen effects (hitmarker, shake, pause)
 *   L5: Environment (bullet trail, muzzle flash) — not yet implemented in demo
 */
import * as THREE from 'three';
import { HitResult } from '../weapons/HitscanWeapon';
import { Target } from '../targets/Target';
import { CameraShake } from '../effects/CameraShake';
import { HitPause } from '../effects/HitPause';
import { Crosshair } from '../ui/Crosshair';
import { DamageNumbers } from '../ui/DamageNumbers';
import { events, GameEvents } from '../core/EventBus';

export class HitFeedback {
  private crosshair: Crosshair;
  private damageNumbers: DamageNumbers;
  private cameraShake: CameraShake;
  private hitPause: HitPause;

  constructor(
    crosshair: Crosshair,
    damageNumbers: DamageNumbers,
    cameraShake: CameraShake,
    hitPause: HitPause
  ) {
    this.crosshair = crosshair;
    this.damageNumbers = damageNumbers;
    this.cameraShake = cameraShake;
    this.hitPause = hitPause;
  }

  /**
   * Process a hit — triggers all feedback layers.
   */
  onHit(hit: HitResult, target: Target | null, camera: THREE.Camera): void {
    const isHeadshot = hit.isHeadshot;

    // L1: Crosshair flash
    this.crosshair.flashHit(isHeadshot);

    // L2: Target animation
    if (target) {
      target.flashHit(isHeadshot);
    }

    // L3: Hit indicator — always "+1"
    this.damageNumbers.spawn(hit.point, 1, isHeadshot, camera);

    // L4: Screen effects
    this.cameraShake.addTrauma(isHeadshot ? 0.25 : 0.1);
    this.hitPause.trigger(isHeadshot ? 0.06 : 0.03);

    events.emit(GameEvents.TARGET_HIT, {
      point: hit.point,
      damage: hit.damage,
      isHeadshot,
      target,
    });
  }

  onMiss(): void {
    events.emit(GameEvents.TARGET_MISS);
  }

  update(dt: number): void {
    this.crosshair.update(dt);
    // Damage numbers update themselves
  }
}
