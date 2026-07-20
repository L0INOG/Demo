/**
 * Game loop with delta-time clamping.
 * Pattern from research report 01 §5 — delta must be clamped to prevent spiral of death.
 */
export class GameLoop {
  private running: boolean = false;
  private lastTime: number = 0;
  private updateFn: (dt: number) => void;
  private rafId: number = 0;

  /** Maximum delta time (seconds) to prevent huge jumps when tab is backgrounded. */
  private readonly MAX_DELTA = 0.033; // ~30fps minimum

  constructor(updateFn: (dt: number) => void) {
    this.updateFn = updateFn;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick = this.tick.bind(this);
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private tick(): void {
    if (!this.running) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Clamp delta to prevent physics explosion on tab-away
    const dt = Math.min(rawDt, this.MAX_DELTA);

    this.updateFn(dt);
    this.rafId = requestAnimationFrame(this.tick);
  }
}
