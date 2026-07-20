/**
 * Minimal dot crosshair — small, crisp, color-configurable.
 */
export class Crosshair {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private hitFlashRemaining: number = 0;
  private isHeadshotFlash: boolean = false;
  private currentScale: number = 1.0;
  private spreadMultiplier: number = 0;

  // Configurable
  dotColor: string = '#ffffff';
  private readonly hitColor: string = '#ff3333';
  private readonly headshotColor: string = '#ffd700';
  private readonly hitDuration: number = 150;

  constructor() {
    this.canvas = document.getElementById('crosshair-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const size = 48;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setSpread(spreadDegrees: number): void {
    this.spreadMultiplier = spreadDegrees;
  }

  flashHit(isHeadshot: boolean): void {
    this.hitFlashRemaining = this.hitDuration;
    this.isHeadshotFlash = isHeadshot;
  }

  update(dt: number): void {
    if (this.hitFlashRemaining > 0) {
      this.hitFlashRemaining -= dt * 1000;
    }
    this.draw();
  }

  private draw(): void {
    const ctx = this.ctx;
    const size = 48;
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    let color = this.dotColor;
    let radius = 1.6;

    if (this.hitFlashRemaining > 0) {
      color = this.isHeadshotFlash ? this.headshotColor : this.hitColor;
      radius = 3.0;
    }

    // Faint outer glow (always visible)
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill();

    // Main dot
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}
