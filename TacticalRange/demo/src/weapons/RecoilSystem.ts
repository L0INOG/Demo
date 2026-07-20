/**
 * Deterministic recoil pattern system.
 * From research report 02 §3.3 — recoil is a learnable point-sequence pattern.
 *
 * Accumulates per-shot pitch/yaw offsets. Recovery brings the offset back to zero
 * when not firing, with a configurable delay before recovery begins.
 */
import { RecoilConfig, RecoilOffset } from './WeaponData';
import { lerp } from '../utils/MathUtils';

export class RecoilSystem {
  private config: RecoilConfig;
  private currentIndex: number = 0;
  private accumulatedYaw: number = 0;
  private accumulatedPitch: number = 0;
  private timeSinceLastShot: number = 0;
  private shotsFired: number = 0;

  constructor(config: RecoilConfig) {
    this.config = config;
  }

  /** Get the recoil offset for this shot and advance the pattern. */
  getShotOffset(): RecoilOffset {
    const offsets = this.config.offsets;
    if (offsets.length === 0) return { yaw: 0, pitch: 0 };

    const offset = offsets[this.currentIndex];
    this.accumulatedYaw += offset.yaw;
    this.accumulatedPitch += offset.pitch;
    this.currentIndex = (this.currentIndex + 1) % offsets.length;
    this.shotsFired++;
    this.timeSinceLastShot = 0;
    return offset;
  }

  /** Get the total accumulated recoil that should be applied to the camera. */
  getTotalOffset(): { yaw: number; pitch: number } {
    return {
      yaw: this.accumulatedYaw,
      pitch: this.accumulatedPitch,
    };
  }

  /**
   * Update recoil recovery.
   * When the weapon hasn't fired for `recoveryDelay` seconds,
   * the recoil offset decays back toward zero.
   */
  update(dt: number): void {
    this.timeSinceLastShot += dt;

    if (this.timeSinceLastShot > this.config.recoveryDelay) {
      const recoveryAmount = this.config.recoverySpeed * dt;
      this.accumulatedYaw = lerp(this.accumulatedYaw, 0, Math.min(recoveryAmount, 1));
      this.accumulatedPitch = lerp(this.accumulatedPitch, 0, Math.min(recoveryAmount, 1));

      // Reset pattern when fully recovered
      if (Math.abs(this.accumulatedYaw) < 0.0001 && Math.abs(this.accumulatedPitch) < 0.0001) {
        this.accumulatedYaw = 0;
        this.accumulatedPitch = 0;
        this.currentIndex = 0;
        this.shotsFired = 0;
      }
    }
  }

  /** Reset recoil state (e.g., when switching weapons). */
  reset(): void {
    this.accumulatedYaw = 0;
    this.accumulatedPitch = 0;
    this.currentIndex = 0;
    this.shotsFired = 0;
    this.timeSinceLastShot = 0;
  }

  updateConfig(config: RecoilConfig): void {
    this.config = config;
    this.reset();
  }
}
