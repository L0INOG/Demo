/**
 * Random spread cone controller.
 * From research report 02 §3.4 — random cone-angle offset, accumulated per shot.
 *
 * Each shot adds spread; spread recovers over time toward base value.
 */
import { SpreadConfig } from './WeaponData';
import * as THREE from 'three';

export class SpreadSystem {
  private config: SpreadConfig;
  currentSpread: number;

  constructor(config: SpreadConfig) {
    this.config = config;
    this.currentSpread = config.base;
  }

  /**
   * Apply random spread deviation to a direction vector.
   * @param direction The base direction (will be mutated).
   * @returns The mutated direction for chaining.
   */
  applySpread(direction: THREE.Vector3): THREE.Vector3 {
    const angle = (Math.random() * 2 - 1) * this.currentSpread * (Math.PI / 180);
    // Random perpendicular axis
    const axis = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      0
    ).normalize();

    direction.applyAxisAngle(axis, angle);
    return direction;
  }

  /** Call after each shot to accumulate spread. */
  onShot(): void {
    this.currentSpread = Math.min(
      this.config.max,
      this.currentSpread + this.config.perShot
    );
  }

  /** Recover spread over time. */
  update(dt: number): void {
    this.currentSpread = Math.max(
      this.config.base,
      this.currentSpread - this.config.recoveryPerSec * dt
    );
  }

  /** Reset spread to base value. */
  reset(): void {
    this.currentSpread = this.config.base;
  }

  updateConfig(config: SpreadConfig): void {
    this.config = config;
    this.reset();
  }
}
