/**
 * Hitscan weapon — the core shooting mechanic.
 * Combines FireRateController, RecoilSystem, and SpreadSystem.
 * Performs raycasting from camera center (crosshair position).
 *
 * Design follows report 01 §3 (weapon FSM) and report 02 §3.1 (hitscan).
 */
import * as THREE from 'three';
import { WeaponConfig } from './WeaponData';
import { FireRateController } from './FireRateController';
import { RecoilSystem } from './RecoilSystem';
import { SpreadSystem } from './SpreadSystem';
import { events, GameEvents } from '../core/EventBus';

export interface HitResult {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  object: THREE.Object3D;
  isHeadshot: boolean;
  damage: number;
}

export enum WeaponState {
  Idle = 'idle',
  Shooting = 'shooting',
  Reloading = 'reloading',
  Empty = 'empty',
}

export class HitscanWeapon {
  readonly config: WeaponConfig;

  private fireRateController: FireRateController;
  private recoilSystem: RecoilSystem;
  private spreadSystem: SpreadSystem;
  private raycaster: THREE.Raycaster;

  state: WeaponState = WeaponState.Idle;

  // Ammo
  currentMag: number;
  currentReserve: number;

  // Reload
  private reloadStartTime: number = 0;

  // Recoil recovery timer
  private timeSinceLastShot: number = 0;

  constructor(config: WeaponConfig) {
    this.config = config;
    this.currentMag = config.magSize;
    this.currentReserve = config.maxAmmo;

    this.fireRateController = new FireRateController(config.fireRate, config.fireMode);
    this.recoilSystem = new RecoilSystem(config.recoil);
    this.spreadSystem = new SpreadSystem(config.spread);
    this.raycaster = new THREE.Raycaster();
    // Near: skip self, Far: max range
    this.raycaster.far = config.range.max;
  }

  /**
   * Attempt to fire the weapon.
   * @returns HitResult if a target was hit, null otherwise.
   */
  tryShoot(
    now: number,
    triggerDown: boolean,
    triggerPressed: boolean,
    camera: THREE.Camera,
    targets: THREE.Object3D[]
  ): HitResult | null {
    // Handle reloading state
    if (this.state === WeaponState.Reloading) {
      if (now - this.reloadStartTime >= this.config.reloadTime * 1000) {
        this.completeReload();
      }
      return null;
    }

    // Check if we can fire
    if (!this.fireRateController.canFire(now, triggerDown, triggerPressed)) {
      return null;
    }

    // Check ammo
    if (this.currentMag <= 0) {
      events.emit(GameEvents.WEAPON_EMPTY);
      return null;
    }

    // Consume ammo
    this.currentMag--;
    this.state = WeaponState.Shooting;
    this.timeSinceLastShot = 0;

    // Get recoil offset
    const recoilOffset = this.recoilSystem.getShotOffset();

    // Calculate shoot direction with spread
    const shootDir = new THREE.Vector3(0, 0, -1);
    shootDir.applyQuaternion(camera.quaternion);
    this.spreadSystem.applySpread(shootDir);
    this.spreadSystem.onShot();

    // Apply recoil to direction
    shootDir.x += recoilOffset.yaw;
    shootDir.y += recoilOffset.pitch;
    shootDir.normalize();

    // Raycast from camera
    this.raycaster.set(camera.position, shootDir);
    const intersects = this.raycaster.intersectObjects(targets, true);

    events.emit(GameEvents.WEAPON_SHOT, {
      origin: camera.position.clone(),
      direction: shootDir.clone(),
      mag: this.currentMag,
      reserve: this.currentReserve,
    });
    events.emit(GameEvents.AMMO_CHANGED, this.currentMag, this.currentReserve);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const isHeadshot = this.checkHeadshot(hit);
      const damage = this.calculateDamage(hit.distance, isHeadshot);

      return {
        point: hit.point.clone(),
        normal: hit.face?.normal.clone() ?? new THREE.Vector3(0, 0, 1),
        distance: hit.distance,
        object: hit.object,
        isHeadshot,
        damage,
      };
    }

    return null;
  }

  /** Start reload. */
  reload(now: number): boolean {
    if (this.state === WeaponState.Reloading) return false;
    if (this.currentMag >= this.config.magSize) return false;
    if (this.currentReserve <= 0) return false;

    this.state = WeaponState.Reloading;
    this.reloadStartTime = now;
    events.emit(GameEvents.WEAPON_RELOAD_START);
    return true;
  }

  private completeReload(): void {
    const needed = this.config.magSize - this.currentMag;
    const available = Math.min(needed, this.currentReserve);
    this.currentMag += available;
    this.currentReserve -= available;
    this.state = WeaponState.Idle;

    events.emit(GameEvents.WEAPON_RELOAD_COMPLETE);
    events.emit(GameEvents.AMMO_CHANGED, this.currentMag, this.currentReserve);
  }

  /**
   * Update per-frame: recoil recovery and spread recovery.
   */
  update(dt: number): void {
    this.timeSinceLastShot += dt;

    // Return to idle after brief shooting state
    if (this.state === WeaponState.Shooting && this.timeSinceLastShot > 0.1) {
      this.state = WeaponState.Idle;
    }

    this.recoilSystem.update(dt);
    this.spreadSystem.update(dt);
  }

  /** Get current recoil for camera shake. */
  getRecoilOffset(): { yaw: number; pitch: number } {
    return this.recoilSystem.getTotalOffset();
  }

  /** Get current spread angle for crosshair dynamic sizing. */
  getCurrentSpread(): number {
    return this.spreadSystem.currentSpread;
  }

  /** Switch to a different weapon config. */
  switchConfig(config: WeaponConfig): void {
    (this.config as WeaponConfig) = config;
    this.fireRateController.setRPM(config.fireRate);
    this.fireRateController.setFireMode(config.fireMode);
    this.recoilSystem.updateConfig(config.recoil);
    this.spreadSystem.updateConfig(config.spread);
    this.raycaster.far = config.range.max;
    this.currentMag = Math.min(this.currentMag, config.magSize);
    this.currentReserve = Math.min(this.currentReserve, config.maxAmmo);
  }

  // ── Private helpers ──

  private checkHeadshot(hit: THREE.Intersection): boolean {
    // Check if the hit object or its ancestors have a 'headshot' marker
    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      if (obj.userData.isHeadshotZone === true) return true;
      obj = obj.parent;
    }
    return false;
  }

  private calculateDamage(distance: number, isHeadshot: boolean): number {
    const falloff = this.config.damageFalloff;
    let multiplier = 1.0;

    if (falloff.curve === 'step') {
      for (const step of falloff.steps) {
        if (distance <= step.range) {
          multiplier = step.multiplier;
          break;
        }
      }
      // If beyond all steps, use the last step or minDamagePercent
      if (distance > falloff.steps[falloff.steps.length - 1]?.range) {
        multiplier = falloff.minDamagePercent;
      }
    }

    let damage = this.config.damage * multiplier;

    // Headshot multiplier (2.5x for pistol, configurable per weapon)
    if (isHeadshot) {
      damage *= 2.5;
    }

    return Math.round(damage);
  }
}
