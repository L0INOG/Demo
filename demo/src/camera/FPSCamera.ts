/**
 * First-person camera with PointerLock sensitivity control.
 * Based on research report 02 §2 — _MOUSE_SENSITIVITY * pointerSpeed model.
 *
 * Uses Euler order 'YXZ' so yaw (Y) is always world-up, preventing roll.
 * Pitch is clamped to ±89° to prevent camera flip.
 */
import * as THREE from 'three';
import { InputManager } from '../core/InputManager';
import { clamp } from '../utils/MathUtils';

/** Three.js internal constant — pixels to radians base conversion. */
const MOUSE_SENSITIVITY = 0.002;

export class FPSCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly euler: THREE.Euler;

  /** User-adjustable sensitivity multiplier. Range: 0.1–5.0. */
  pointerSpeed: number = 1.0;

  /** User's mouse DPI setting. */
  userDPI: number = 800;

  /** User's sensitivity setting. */
  userSensitivity: number = 1.0;

  /** Invert Y axis. */
  invertY: boolean = false;

  /** Pitch limits in radians. */
  minPolarAngle: number = -Math.PI / 2 + 0.01; // -89°
  maxPolarAngle: number = Math.PI / 2 - 0.01;  // +89°

  private input: InputManager;

  constructor(input: InputManager, fov: number = 75, near: number = 0.1, far: number = 500) {
    this.input = input;
    this.camera = new THREE.PerspectiveCamera(
      fov,
      window.innerWidth / window.innerHeight,
      near,
      far
    );
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);

    // Handle resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  /**
   * Apply mouse input to camera rotation.
   * Called each frame, uses accumulated mouse delta from InputManager.
   */
  update(): void {
    const invert = this.invertY ? -1 : 1;

    // Apply mouse delta — the core sensitivity formula from report 02 §2.1
    this.euler.y -= this.input.mouseDX * MOUSE_SENSITIVITY * this.pointerSpeed;
    this.euler.x -= this.input.mouseDY * MOUSE_SENSITIVITY * this.pointerSpeed * invert;

    // Clamp pitch
    this.euler.x = clamp(this.euler.x, this.minPolarAngle, this.maxPolarAngle);

    this.camera.quaternion.setFromEuler(this.euler);
  }

  /** Get the world-space forward direction (where the player is looking). */
  getForward(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);
    return dir;
  }

  /** Get the camera's world position. */
  getPosition(): THREE.Vector3 {
    return this.camera.position.clone();
  }

  setPosition(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
  }

  /**
   * Apply DPI + sensitivity settings to compute pointerSpeed.
   * Formula: pointerSpeed = (DPI / 800) * sensitivity
   * At 800 DPI / 1.0 sens, pointerSpeed = 1.0 (~25cm/360)
   */
  applySensitivity(dpi: number, sens: number): void {
    this.userDPI = dpi;
    this.userSensitivity = sens;
    this.pointerSpeed = (dpi / 800) * sens;
  }

  /** Estimated cm/360 for the current settings. */
  getCmPer360(): number {
    if (this.pointerSpeed <= 0) return Infinity;
    return Math.round(25000 / (this.userDPI * this.pointerSpeed));
  }
}
