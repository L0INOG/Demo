/**
 * Hit pause — micro-freeze on hit for "weight" feel.
 * From research report 02 §4.3.
 */
export class HitPause {
  private timeScale: number = 1.0;
  private remaining: number = 0;

  /** Trigger a brief pause. */
  trigger(duration: number = 0.04): void {
    this.timeScale = 0.05;
    this.remaining = duration;
  }

  /** Update and return the effective time scale. */
  update(dt: number): number {
    if (this.remaining > 0) {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        this.timeScale = 1.0;
        this.remaining = 0;
      }
    }
    return this.timeScale;
  }
}
