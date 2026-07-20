/**
 * Target entity — a 3D sphere with headshot zone.
 * Main body is a glossy colored sphere, headshot is a smaller sphere on top.
 */
import * as THREE from 'three';

export interface TargetConfig {
  size: number;
  innerSize: number;
  distance: number;
  lifetime: number;
  score: number;
  headshotMultiplier: number;
  color: string;
  innerColor: string;
}

export enum TargetState {
  Alive = 'alive',
  Hit = 'hit',
  Dead = 'dead',
}

export class Target {
  readonly mesh: THREE.Group;
  readonly config: TargetConfig;

  state: TargetState = TargetState.Alive;
  spawnTime: number = 0;
  private bodySphere: THREE.Mesh;
  private headSphere: THREE.Mesh;
  private bodyMat: THREE.MeshStandardMaterial;
  private headMat: THREE.MeshStandardMaterial;
  private originalBodyColor: THREE.Color;
  private originalHeadColor: THREE.Color;
  private hitFlashTime: number = 0;

  constructor(config: TargetConfig) {
    this.config = config;

    this.mesh = new THREE.Group();

    // ── Body sphere (main target) ──
    const bodyGeom = new THREE.SphereGeometry(config.size, 48, 48);
    this.originalBodyColor = new THREE.Color(config.color);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: this.originalBodyColor,
      roughness: 0.25,
      metalness: 0.15,
    });
    this.bodySphere = new THREE.Mesh(bodyGeom, this.bodyMat);
    this.bodySphere.name = 'target_body';
    this.bodySphere.castShadow = true;
    this.bodySphere.receiveShadow = true;
    this.mesh.add(this.bodySphere);

    // ── Headshot sphere (smaller, on top) ──
    const headGeom = new THREE.SphereGeometry(config.innerSize, 32, 32);
    this.originalHeadColor = new THREE.Color(config.innerColor);
    this.headMat = new THREE.MeshStandardMaterial({
      color: this.originalHeadColor,
      roughness: 0.2,
      metalness: 0.3,
      emissive: new THREE.Color(config.innerColor),
      emissiveIntensity: 0.15,
    });
    this.headSphere = new THREE.Mesh(headGeom, this.headMat);
    this.headSphere.name = 'target_headshot';
    this.headSphere.userData.isHeadshotZone = true;
    this.headSphere.position.y = config.size * 0.85;
    this.headSphere.castShadow = true;
    this.mesh.add(this.headSphere);

    // ── Invisible collider sphere — slightly larger than visual for forgiving hit detection ──
    const colliderGeom = new THREE.SphereGeometry(config.size * 1.6, 24, 24);
    const colliderMat = new THREE.MeshBasicMaterial({ visible: false });
    const collider = new THREE.Mesh(colliderGeom, colliderMat);
    collider.name = 'target_collider';
    this.mesh.add(collider);

    this.mesh.name = 'target';
    this.mesh.userData.targetEntity = this;
  }

  placeAt(x: number, y: number, z: number, _cameraPos: THREE.Vector3): void {
    this.mesh.position.set(x, y, z);
  }

  flashHit(isHeadshot: boolean): void {
    this.hitFlashTime = 0.18;
    const flashColor = new THREE.Color(isHeadshot ? 0xffd700 : 0xffffff);

    this.bodyMat.color.copy(flashColor);
    this.bodyMat.emissive = new THREE.Color(isHeadshot ? 0xffd700 : 0xffffff);
    this.bodyMat.emissiveIntensity = 0.6;

    if (isHeadshot) {
      this.headMat.emissive = new THREE.Color(0xff4444);
      this.headMat.emissiveIntensity = 0.8;
    }
  }

  update(dt: number): void {
    if (this.hitFlashTime > 0) {
      this.hitFlashTime -= dt;
      if (this.hitFlashTime <= 0) {
        this.bodyMat.color.copy(this.originalBodyColor);
        this.bodyMat.emissiveIntensity = 0;
        this.headMat.color.copy(this.originalHeadColor);
        this.headMat.emissive = new THREE.Color(this.config.innerColor);
        this.headMat.emissiveIntensity = 0.15;
      }
    }

    // Gentle float + spin for alive targets
    if (this.state === TargetState.Alive) {
      const elapsed = (performance.now() - this.spawnTime) / 1000;
      const float = Math.sin(elapsed * 2.5) * 0.08;
      this.mesh.position.y += float * dt * 5;
      this.mesh.rotation.y += dt * 0.6;
    }
  }

  despawn(): void {
    this.state = TargetState.Dead;
    this.mesh.scale.setScalar(0.01);
  }

  dispose(): void {
    this.bodySphere.geometry.dispose();
    this.bodyMat.dispose();
    this.headSphere.geometry.dispose();
    this.headMat.dispose();
  }
}
