/**
 * Floating damage numbers rendered on a separate canvas.
 * Uses object pool pattern from research report 03 §6.2.
 *
 * Rendered on a full-screen canvas overlaid on the 3D scene.
 */
import * as THREE from 'three';
import { ObjectPool } from '../utils/ObjectPool';

interface DamageNumber {
  worldPos: THREE.Vector3;
  text: string;
  color: string;
  fontSize: number;
  life: number;        // remaining lifetime in seconds
  maxLife: number;
  velocity: number;    // upward drift speed
}

const DAMAGE_NUMBER_LIFE = 1.0; // seconds

export class DamageNumbers {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pool: ObjectPool<DamageNumber>;
  private active: DamageNumber[] = [];

  constructor() {
    this.canvas = document.getElementById('damage-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.pool = new ObjectPool<DamageNumber>(
      () => ({
        worldPos: new THREE.Vector3(),
        text: '',
        color: '#fff',
        fontSize: 24,
        life: 0,
        maxLife: DAMAGE_NUMBER_LIFE,
        velocity: 30,
      }),
      (dn) => {
        dn.worldPos.set(0, 0, 0);
        dn.text = '';
        dn.life = 0;
      },
      8
    );
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /** Spawn a damage number at a world position. */
  spawn(worldPos: THREE.Vector3, damage: number, isHeadshot: boolean, camera: THREE.Camera): void {
    const dn = this.pool.get();
    dn.worldPos.copy(worldPos);
    dn.text = '+1';
    dn.color = isHeadshot ? '#ffd700' : '#ffffff';
    dn.fontSize = isHeadshot ? 30 : 22;
    dn.life = DAMAGE_NUMBER_LIFE;
    dn.maxLife = DAMAGE_NUMBER_LIFE;
    dn.velocity = isHeadshot ? 50 : 35;
    this.active.push(dn);
  }

  /** Render all active damage numbers. */
  render(camera: THREE.Camera): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const halfW = this.canvas.width / 2;
    const halfH = this.canvas.height / 2;

    // Sort by distance (far first) for depth ordering feel
    const sorted = [...this.active].sort((a, b) => {
      const dA = camera.position.distanceTo(a.worldPos);
      const dB = camera.position.distanceTo(b.worldPos);
      return dB - dA;
    });

    for (const dn of sorted) {
      // Project world position to screen
      const screenPos = dn.worldPos.clone().project(camera);
      const sx = (screenPos.x * halfW) + halfW;
      const sy = -(screenPos.y * halfH) + halfH;

      // Skip if behind camera
      if (screenPos.z > 1) continue;

      // Offset upward based on remaining life
      const progress = 1 - (dn.life / dn.maxLife);
      const offsetY = -progress * 40; // drift upward 40px

      // Fade out
      const alpha = Math.min(1, dn.life / 0.2); // fade in last 200ms

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${dn.fontSize}px "Consolas", "Courier New", monospace`;
      ctx.fillStyle = dn.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Outline
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(dn.text, sx, sy + offsetY);
      ctx.fillText(dn.text, sx, sy + offsetY);

      ctx.restore();
    }
  }

  /** Update lifetimes and remove dead numbers. */
  update(dt: number): void {
    for (const dn of this.active) {
      dn.life -= dt;
    }
    // Remove dead
    const dead: DamageNumber[] = [];
    this.active = this.active.filter(dn => {
      if (dn.life <= 0) {
        dead.push(dn);
        return false;
      }
      return true;
    });
    for (const dn of dead) {
      this.pool.release(dn);
    }
  }
}
