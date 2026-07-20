/**
 * Controls weapon fire rate with support for semi, burst, and auto fire modes.
 * From research report 02 §3.2.
 */
import { FireMode } from './WeaponData';

export class FireRateController {
  private fireRateRPM: number;
  private shotInterval: number;     // milliseconds between shots
  private lastShotTime: number = 0;
  private burstCount: number = 0;
  private maxBurst: number;
  private fireMode: FireMode;

  /** For semi-auto: track trigger release between shots. */
  private triggerWasReleased: boolean = true;

  constructor(rpm: number, fireMode: FireMode, burstCount: number = 3) {
    this.fireRateRPM = rpm;
    this.shotInterval = 60000 / rpm;
    this.fireMode = fireMode;
    this.maxBurst = fireMode === 'burst' ? burstCount : 0;
  }

  /**
   * Check if the weapon can fire this frame.
   * @param now Current time in milliseconds.
   * @param triggerDown Whether the fire button is currently held.
   */
  canFire(now: number, triggerDown: boolean, triggerPressed: boolean): boolean {
    // Semi-auto: requires trigger press (not hold)
    if (this.fireMode === 'semi') {
      if (!triggerPressed) return false;
      // Reset burst counter for semi (each click = one shot)
      this.burstCount = 0;
    }

    // Burst mode: check burst count
    if (this.fireMode === 'burst' && this.burstCount >= this.maxBurst) {
      return false;
    }

    // Auto: requires trigger held
    if (this.fireMode === 'auto' && !triggerDown) {
      this.burstCount = 0;
      return false;
    }

    // Rate-of-fire timing check
    if (now - this.lastShotTime < this.shotInterval) return false;

    this.lastShotTime = now;
    this.burstCount++;
    return true;
  }

  /** Reset burst counter (called when trigger is released). */
  resetBurst(): void {
    this.burstCount = 0;
  }

  /** Update fire rate (for weapon switching). */
  setRPM(rpm: number): void {
    this.fireRateRPM = rpm;
    this.shotInterval = 60000 / rpm;
  }

  setFireMode(mode: FireMode, burstCount: number = 3): void {
    this.fireMode = mode;
    this.maxBurst = mode === 'burst' ? burstCount : 0;
  }
}
