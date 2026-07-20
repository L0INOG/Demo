/**
 * Target spawner — single target at a time, instant respawn on hit.
 */
import * as THREE from 'three';
import { Target, TargetConfig, TargetState } from './Target';
import { ObjectPool } from '../utils/ObjectPool';
import { events, GameEvents } from '../core/EventBus';

export interface SpawnConfig {
  spawnAreaWidth: number;
  spawnAreaHeight: number;
}

export class TargetSpawner {
  private targetConfigs: TargetConfig[];
  private currentTarget: Target | null = null;
  private pool!: ObjectPool<Target>;
  private scene: THREE.Scene;
  enabled: boolean = true;
  private scale: number = 1.0;

  constructor(
    scene: THREE.Scene,
    spawnConfig: SpawnConfig,
    targetConfigs: TargetConfig[],
    scale: number = 1.0
  ) {
    this.scene = scene;
    this.targetConfigs = targetConfigs;
    this.scale = scale;
    this.initPool();

    // Listen for hits to immediately spawn next target
    events.on(GameEvents.TARGET_HIT, () => {
      setTimeout(() => this.spawnNext(), 150);
    });

    // Listen for timeouts (target expired)
    events.on(GameEvents.TARGET_MISS, () => {
      setTimeout(() => this.spawnNext(), 100);
    });
  }

  private initPool(): void {
    this.pool = new ObjectPool<Target>(
      () => new Target(this.randomConfig()),
      (t) => {
        t.state = TargetState.Alive;
        t.mesh.visible = false;
        t.mesh.scale.setScalar(1.0); // pool reset to base size
        this.scene.add(t.mesh);
      },
      3
    );
  }

  setScale(s: number): void {
    this.scale = s;
  }

  /** Remove old and spawn a fresh target. */
  spawnNext(): void {
    if (!this.enabled) return;
    // Remove current
    if (this.currentTarget) {
      if (this.currentTarget.state !== TargetState.Dead) {
        this.currentTarget.despawn();
      }
      this.scene.remove(this.currentTarget.mesh);
      this.pool.release(this.currentTarget);
      this.currentTarget = null;
    }
    this.spawnTarget();
  }

  /** Force-spawn the very first target. */
  spawnFirst(cameraPos: THREE.Vector3): void {
    if (!this.currentTarget) {
      this.spawnTarget(cameraPos);
    }
  }

  update(dt: number, cameraPos: THREE.Vector3): void {
    // Update current target
    if (this.currentTarget) {
      this.currentTarget.update(dt);

      // Lifetime expiry
      if (this.currentTarget.state === TargetState.Alive &&
          (performance.now() - this.currentTarget.spawnTime) > this.currentTarget.config.lifetime) {
        this.currentTarget.despawn();
        events.emit(GameEvents.TARGET_MISS);
      }

      // Clean up dead target
      if (this.currentTarget.state === TargetState.Dead) {
        this.scene.remove(this.currentTarget.mesh);
        this.pool.release(this.currentTarget);
        this.currentTarget = null;
      }
    }
  }

  getTargetObjects(): THREE.Object3D[] {
    return this.currentTarget ? [this.currentTarget.mesh] : [];
  }

  getTargetFromObject(obj: THREE.Object3D): Target | null {
    let current: THREE.Object3D | null = obj;
    while (current) {
      if (current.userData.targetEntity instanceof Target) {
        return current.userData.targetEntity;
      }
      current = current.parent;
    }
    return null;
  }

  hasActiveTarget(): boolean {
    return this.currentTarget !== null && this.currentTarget.state === TargetState.Alive;
  }

  getCurrentTarget(): Target | null {
    return this.currentTarget;
  }

  clear(): void {
    if (this.currentTarget) {
      this.currentTarget.despawn();
      this.scene.remove(this.currentTarget.mesh);
      this.pool.release(this.currentTarget);
      this.currentTarget = null;
    }
  }

  private spawnTarget(_cameraPos?: THREE.Vector3): void {
    const target = this.pool.get();

    // X: full width across the back wall (-10 to 10, within the 50m walls)
    const x = (Math.random() * 2 - 1) * 10;
    // Y: above floor, below ceiling
    const y = 0.8 + Math.random() * 8.4;
    // Z: random depth along the range, between front and back walls
    const z = -(5 + Math.random() * 19); // z=-5 to z=-24

    const worldPos = new THREE.Vector3(x, y, z);
    target.mesh.position.copy(worldPos);
    target.spawnTime = performance.now();
    target.state = TargetState.Alive;
    target.mesh.visible = true;
    target.mesh.scale.setScalar(this.scale);

    this.scene.add(target.mesh);
    this.currentTarget = target;

    events.emit(GameEvents.TARGET_SPAWNED, target);
  }

  private randomConfig(): TargetConfig {
    return this.targetConfigs[Math.floor(Math.random() * this.targetConfigs.length)];
  }
}
