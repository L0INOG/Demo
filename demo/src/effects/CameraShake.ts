/**
 * Camera shake using trauma decay model.
 * From research report 02 §4.3 — trauma squared for nonlinear shake feel.
 */
import * as THREE from 'three';

export class CameraShake {
  trauma: number = 0;

  /** Add trauma (0–1). Higher values = more shake. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /**
   * Get the camera offset for this frame.
   * Uses trauma² for nonlinear falloff that feels more natural.
   */
  update(dt: number): THREE.Vector3 {
    const shake = this.trauma * this.trauma;
    const offset = new THREE.Vector3(
      (Math.random() * 2 - 1) * shake * 0.04,
      (Math.random() * 2 - 1) * shake * 0.04,
      0
    );
    // Decay trauma
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    return offset;
  }
}
