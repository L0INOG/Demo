/**
 * Game — main orchestrator with menu / playing / ended states.
 */
import * as THREE from 'three';
import { GameLoop } from './GameLoop';
import { InputManager } from './InputManager';
import { events, GameEvents } from './EventBus';
import { FPSCamera } from '../camera/FPSCamera';
import { HitscanWeapon, WeaponState } from '../weapons/HitscanWeapon';
import { WeaponConfig, WeaponsManifest } from '../weapons/WeaponData';
import { TargetSpawner, SpawnConfig } from '../targets/TargetSpawner';
import { Target, TargetConfig, TargetState } from '../targets/Target';
import { HitFeedback } from '../shooting/HitFeedback';
import { Crosshair } from '../ui/Crosshair';
import { DamageNumbers } from '../ui/DamageNumbers';
import { CameraShake } from '../effects/CameraShake';
import { HitPause } from '../effects/HitPause';
import { ScoreManager } from '../scoring/ScoreManager';
import { clamp } from '../utils/MathUtils';
import weaponsData from '../../data/weapons.json';
import targetsData from '../../data/targets.json';

enum GameState { MENU, PLAYING, ENDED }

export class Game {
  // Three.js
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;

  // Core
  private loop!: GameLoop;
  private input!: InputManager;

  // Camera
  private fpsCamera!: FPSCamera;

  // Weapons
  private weapons: Map<string, HitscanWeapon> = new Map();
  private currentWeaponId: string = 'pistol';
  private currentWeapon!: HitscanWeapon;

  // Targets
  private targetSpawner!: TargetSpawner;

  // Feedback
  private crosshair!: Crosshair;
  private damageNumbers!: DamageNumbers;
  private cameraShake!: CameraShake;
  private hitPause!: HitPause;
  private hitFeedback!: HitFeedback;

  // Scoring
  private scoreManager!: ScoreManager;

  // Weapon models
  private pistolModel!: THREE.Group;
  private rifleModel!: THREE.Group;
  private knifeModel!: THREE.Group;
  private activeWeaponModel!: THREE.Group;
  private pistolRestPos = new THREE.Vector3(0.25, -0.22, -0.55);
  private rifleRestPos = new THREE.Vector3(0.28, -0.28, -0.6);
  private kickBack: number = 0;
  private reloadAnimTimer: number = 0;
  private isMelee: boolean = false;
  private meleeCooldown: number = 0;

  // Player
  private playerVelocity = new THREE.Vector3();
  private readonly MOVE_SPEED = 8.0;
  private readonly GRAVITY = 20.0;
  private readonly JUMP_FORCE = 8.0;
  private isGrounded = true;
  private readonly playerHeight = 1.7;
  private readonly PLAYER_RADIUS = 0.4;

  // Collision boxes (AABB in XZ plane)
  private colliders: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];

  // State
  private state: GameState = GameState.MENU;
  private canvas!: HTMLCanvasElement;
  private environmentObjects: THREE.Object3D[] = [];

  // Settings (persisted)
  private settings = {
    crosshairColor: '#00ff88',
    dpi: 800,
    sensitivity: 1.0,
    targetScale: 1.0,
    fullscreen: false,
  };

  constructor() {
    this.loadSettings();
    this.init().catch((err) => {
      console.error('[Game] Init failed:', err);
      const s = document.getElementById('load-status');
      if (s) s.textContent = 'Error: ' + err.message;
    });
  }

  // ═══════════════════════════════════════
  // Init
  // ═══════════════════════════════════════

  private async init(): Promise<void> {
    try {
    this.updateLoadingUI('Renderer...', 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    document.body.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7EC8E3);
    this.scene.fog = new THREE.Fog(0x9DD1E8, 40, 150);

    this.updateLoadingUI('Input...', 20);
    this.input = new InputManager();
    this.input.attach(this.canvas);

    this.updateLoadingUI('Camera...', 30);
    this.fpsCamera = new FPSCamera(this.input, 90);
    this.fpsCamera.applySensitivity(this.settings.dpi, this.settings.sensitivity);
    this.fpsCamera.setPosition(0, this.playerHeight, 5);

    // Weapon models — added to scene, follows camera each frame
    this.pistolModel = this.buildPistolModel();
    this.rifleModel = this.buildRifleModel();
    this.knifeModel = this.buildKnifeModel();
    this.scene.add(this.pistolModel);
    this.scene.add(this.rifleModel);
    this.scene.add(this.knifeModel);
    this.rifleModel.visible = false;
    this.knifeModel.visible = false;
    this.activeWeaponModel = this.pistolModel;

    this.updateLoadingUI('Environment...', 40);
    this.buildEnvironment();
    this.buildColliders();

    this.updateLoadingUI('Weapons...', 55);
    const manifest = weaponsData as WeaponsManifest;
    for (const [key, config] of Object.entries(manifest)) {
      this.weapons.set(key, new HitscanWeapon(config as WeaponConfig));
    }
    this.currentWeapon = this.weapons.get(this.currentWeaponId)!;

    this.updateLoadingUI('UI...', 65);
    this.crosshair = new Crosshair();
    this.crosshair.dotColor = this.settings.crosshairColor;
    this.damageNumbers = new DamageNumbers();
    this.cameraShake = new CameraShake();
    this.hitPause = new HitPause();

    this.hitFeedback = new HitFeedback(this.crosshair, this.damageNumbers, this.cameraShake, this.hitPause);
    this.scoreManager = new ScoreManager();

    // Targets
    const targetConfigs: TargetConfig[] = Object.values(targetsData.presets).map((p: any) => ({ ...p }));
    this.targetSpawner = new TargetSpawner(
      this.scene,
      { spawnAreaWidth: 12, spawnAreaHeight: 6 },
      targetConfigs,
      this.settings.targetScale
    );

    this.updateLoadingUI('Lighting...', 85);
    this.setupLighting();

    this.updateLoadingUI('Ready...', 95);
    this.setupEventListeners();
    this.setupPointerLock();
    this.setupMenuUI();

    this.loop = new GameLoop((dt) => this.update(dt));
    this.loop.start();

    this.updateLoadingUI('Ready!', 100);

    setTimeout(() => {
      document.getElementById('loading')?.classList.add('hidden');
    }, 400);

    this.updateAmmoHUD();
    } catch (err: any) {
      console.error('[Game] Init error:', err);
      const s = document.getElementById('load-status');
      if (s) s.textContent = 'Error: ' + (err?.message || String(err));
      throw err;
    }
  }

  // ═══════════════════════════════════════
  // Main Loop
  // ═══════════════════════════════════════

  private update(rawDt: number): void {
    const timeScale = this.hitPause.update(rawDt);
    const dt = rawDt * timeScale;
    const now = performance.now();

    // Update camera (mouse look) only during gameplay
    if (this.state === GameState.PLAYING) {
      this.fpsCamera.update();
    }

    if (this.state === GameState.PLAYING) {
      // Tab → return to menu
      if (this.input.tabPressed) {
        this.returnToMenu();
        this.input.endFrame();
        this.renderer.render(this.scene, this.fpsCamera.camera);
        return;
      }

      this.updateMovement(dt);
      this.currentWeapon.update(dt);

      // Weapon follow camera
      const cam = this.fpsCamera.camera;
      const restPos = this.isMelee ? new THREE.Vector3(0.22, -0.28, -0.45)
        : (this.currentWeaponId === 'rifle' ? this.rifleRestPos : this.pistolRestPos);
      const weaponWorldPos = restPos.clone()
        .applyQuaternion(cam.quaternion).add(cam.position);
      this.activeWeaponModel.position.copy(weaponWorldPos);

      // Reload animation (guns only)
      if (!this.isMelee && this.reloadAnimTimer > 0) {
        this.reloadAnimTimer -= dt;
        const progress = 1 - (this.reloadAnimTimer / this.currentWeapon.config.reloadTime);
        const slideOffset = progress < 0.7
          ? progress / 0.7 * 0.15
          : (1 - progress) / 0.3 * 0.15;
        this.activeWeaponModel.position.z += slideOffset;
        this.activeWeaponModel.rotation.x += slideOffset * 0.5;
        this.activeWeaponModel.rotation.z = -slideOffset * 0.3;
      } else if (!this.isMelee) {
        this.activeWeaponModel.rotation.z = THREE.MathUtils.lerp(this.activeWeaponModel.rotation.z, 0, 10 * dt);
      }

      // Melee sway animation
      if (this.isMelee) {
        const sway = Math.sin(performance.now() * 0.004) * 0.015;
        this.activeWeaponModel.rotation.z = sway;
        this.activeWeaponModel.position.y += Math.abs(sway);
      }

      this.activeWeaponModel.position.z += this.kickBack;
      this.activeWeaponModel.position.y += Math.abs(this.kickBack) * 0.15;
      this.activeWeaponModel.quaternion.copy(cam.quaternion);
      this.activeWeaponModel.rotateX(this.kickBack * 0.8);
      this.kickBack = THREE.MathUtils.lerp(this.kickBack, 0, 12 * dt);

      // Crosshair
      this.crosshair.setSpread(this.currentWeapon.getCurrentSpread());
      this.crosshair.update(dt);

      // Shooting / Melee
      if (document.pointerLockElement === this.canvas) {
        if (this.isMelee) {
          // Melee attack on click
          this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
          if (this.input.isTriggerPressed && this.meleeCooldown <= 0) {
            this.meleeCooldown = 0.4; // 400ms cooldown
            this.kickBack = -0.06;
            // Check if any target is within melee range
            const target = this.targetSpawner.getCurrentTarget();
            if (target && target.state === TargetState.Alive) {
              const dist = this.fpsCamera.camera.position.distanceTo(target.mesh.position);
              if (dist < 3.5) {
                // Melee hit!
                target.state = TargetState.Hit;
                target.flashHit(false);
                this.cameraShake.addTrauma(0.2);
                this.hitPause.trigger(0.04);
                this.scoreManager.totalHits++;
                this.scoreManager.score += 1;
                events.emit(GameEvents.SCORE_CHANGED, this.scoreManager.score);
                events.emit(GameEvents.TARGET_HIT, { point: target.mesh.position, damage: 100, isHeadshot: false, target });
                setTimeout(() => {
                  if (target.state === TargetState.Hit) target.despawn();
                }, 180);
              }
            }
          }
        } else {
          const hitResult = this.currentWeapon.tryShoot(
            now, this.input.isTriggerDown, this.input.isTriggerPressed,
            this.fpsCamera.camera, this.targetSpawner.getTargetObjects()
          );

          if (hitResult) {
            const target = this.targetSpawner.getTargetFromObject(hitResult.object);

            if (target && target.state === TargetState.Alive) {
              target.state = TargetState.Hit;
              this.hitFeedback.onHit(hitResult, target, this.fpsCamera.camera);
              setTimeout(() => {
                if (target.state === TargetState.Hit) target.despawn();
              }, 180);
            }
          }
        }
      }

      // Reload (manual R key or auto when empty)
      if (this.input.isReloadPressed ||
          (this.currentWeapon.currentMag === 0 && this.currentWeapon.currentReserve > 0 && this.currentWeapon.state !== WeaponState.Reloading)) {
        if (this.currentWeapon.reload(now)) {
          this.reloadAnimTimer = this.currentWeapon.config.reloadTime;
        }
      }

      // Weapon switch
      if (this.input.wasKeyPressed('3')) {
        this.switchToMelee();
      } else if (this.input.switchWeaponPressed) {
        if (this.isMelee) {
          // Exit melee back to pistol
          this.isMelee = false;
          this.currentWeaponId = 'pistol';
          this.activeWeaponModel = this.pistolModel;
          this.knifeModel.visible = false;
          this.pistolModel.visible = true;
          this.updateAmmoHUD();
        } else {
          this.cycleWeapon();
        }
      }

      // Targets
      this.targetSpawner.update(dt, this.fpsCamera.getPosition());

      // Camera shake
      const shakeOffset = this.cameraShake.update(dt);
      this.fpsCamera.camera.position.x += shakeOffset.x;
      this.fpsCamera.camera.position.y += shakeOffset.y;

      // Damage numbers
      this.damageNumbers.update(dt);
      this.damageNumbers.render(this.fpsCamera.camera);

      // Hide weapons & HUD when timer ends
      if (this.scoreManager.timeRemaining <= 0) {
        this.pistolModel.visible = false;
        this.rifleModel.visible = false;
        this.knifeModel.visible = false;
      }
    } else {
      // MENU or ENDED — keep weapons hidden
      this.pistolModel.visible = false;
      this.rifleModel.visible = false;
      this.knifeModel.visible = false;
      this.crosshair.update(dt);
    }

    // Render
    this.renderer.render(this.scene, this.fpsCamera.camera);
    this.input.endFrame();
  }

  // ═══════════════════════════════════════
  // Game State Transitions
  // ═══════════════════════════════════════

  private startGame(): void {
    this.state = GameState.PLAYING;
    this.scoreManager.reset();

    // Reset player
    this.fpsCamera.setPosition(0, this.playerHeight, 5);
    this.fpsCamera.euler.set(0, 0, 0, 'YXZ');
    // Show pistol, hide others
    this.isMelee = false;
    this.currentWeaponId = 'pistol';
    this.pistolModel.visible = true;
    this.rifleModel.visible = false;
    this.knifeModel.visible = false;
    this.activeWeaponModel = this.pistolModel;

    // Reset weapon
    const wpn = this.weapons.get(this.currentWeaponId)!;
    wpn.currentMag = wpn.config.magSize;
    wpn.currentReserve = wpn.config.maxAmmo;
    this.currentWeapon = wpn;

    // Show HUD + key hints
    document.getElementById('menu-overlay')?.classList.add('hidden');
    document.getElementById('end-overlay')?.classList.add('hidden');
    document.getElementById('hud')?.classList.add('active');
    document.getElementById('ammo-bar')?.classList.add('active');
    document.getElementById('key-hints')!.style.display = 'block';
    this.updateAmmoHUD();

    // Apply settings and spawn first target
    this.targetSpawner.enabled = true;
    this.targetSpawner.setScale(this.settings.targetScale);
    this.targetSpawner.spawnFirst(this.fpsCamera.getPosition());
    this.applyFullscreen();

    // Start timer
    this.scoreManager.startTimer(() => this.endGame());

    // Request pointer lock
    this.canvas.requestPointerLock({ unadjustedMovement: true });
  }

  private endGame(): void {
    this.state = GameState.ENDED;
    this.scoreManager.saveCurrentScore();
    this.targetSpawner.enabled = false;

    // Hide game HUD
    document.getElementById('hud')?.classList.remove('active');
    document.getElementById('ammo-bar')?.classList.remove('active');
    document.getElementById('key-hints')!.style.display = 'none';

    // Clear targets
    this.targetSpawner.clear();

    // Release pointer lock
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }

    // Show end screen
    const endOverlay = document.getElementById('end-overlay')!;
    endOverlay.classList.remove('hidden');
    document.getElementById('final-score')!.textContent = String(this.scoreManager.score);
    document.getElementById('final-accuracy')!.textContent = this.scoreManager.accuracy + '%';

    // Update high scores in menu
    this.renderHighScores();
  }

  private returnToMenu(): void {
    this.state = GameState.MENU;
    this.scoreManager.stopTimer();
    this.scoreManager.reset();
    this.targetSpawner.enabled = false;
    this.targetSpawner.clear();
    this.pistolModel.visible = false;
    this.rifleModel.visible = false;
    this.knifeModel.visible = false;

    // Release pointer lock
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }

    // Hide game HUD
    document.getElementById('hud')?.classList.remove('active');
    document.getElementById('ammo-bar')?.classList.remove('active');
    document.getElementById('end-overlay')?.classList.add('hidden');
    document.getElementById('key-hints')!.style.display = 'none';

    // Show menu (hide settings if open)
    document.getElementById('settings-overlay')?.classList.add('hidden');
    document.getElementById('menu-overlay')?.classList.remove('hidden');
    this.renderHighScores();
  }

  // ═══════════════════════════════════════
  // Menu UI
  // ═══════════════════════════════════════

  private setupMenuUI(): void {
    document.getElementById('btn-start')!.addEventListener('click', () => this.startGame());
    document.getElementById('btn-replay')!.addEventListener('click', () => this.startGame());
    document.getElementById('btn-menu')!.addEventListener('click', () => this.returnToMenu());

    // Settings open/close
    document.getElementById('btn-settings-open')!.addEventListener('click', () => {
      document.getElementById('menu-overlay')!.classList.add('hidden');
      document.getElementById('settings-overlay')!.classList.remove('hidden');
    });
    document.getElementById('btn-settings-back')!.addEventListener('click', () => {
      document.getElementById('settings-overlay')!.classList.add('hidden');
      document.getElementById('menu-overlay')!.classList.remove('hidden');
    });

    // Clear high scores
    document.getElementById('btn-clear-scores')!.addEventListener('click', () => {
      if (confirm('Delete all high score records? This cannot be undone.')) {
        this.scoreManager.clearHighScores();
        this.renderHighScores();
      }
    });

    // Crosshair color
    const colorInput = document.getElementById('set-crosshair-color') as HTMLInputElement;
    colorInput.value = this.settings.crosshairColor;
    colorInput.addEventListener('input', () => {
      this.settings.crosshairColor = colorInput.value;
      this.crosshair.dotColor = colorInput.value;
      this.saveSettings();
    });

    // DPI
    const dpiInput = document.getElementById('set-dpi') as HTMLInputElement;
    dpiInput.value = String(this.settings.dpi);
    dpiInput.addEventListener('change', () => {
      const v = parseInt(dpiInput.value) || 800;
      this.settings.dpi = Math.max(100, Math.min(32000, v));
      dpiInput.value = String(this.settings.dpi);
      this.applySettings();
    });

    // Sensitivity
    const sensInput = document.getElementById('set-sens') as HTMLInputElement;
    sensInput.value = String(this.settings.sensitivity);
    sensInput.addEventListener('change', () => {
      const v = parseFloat(sensInput.value) || 1.0;
      this.settings.sensitivity = Math.max(0.1, Math.min(10.0, Math.round(v * 100) / 100));
      sensInput.value = String(this.settings.sensitivity);
      this.applySettings();
    });

    // Target size scale
    const scaleSelect = document.getElementById('set-target-scale') as HTMLSelectElement;
    this.settings.targetScale = parseFloat(scaleSelect.value);
    this.targetSpawner.setScale(this.settings.targetScale);
    scaleSelect.addEventListener('change', () => {
      this.settings.targetScale = parseFloat(scaleSelect.value);
      this.targetSpawner.setScale(this.settings.targetScale);
      this.saveSettings();
    });

    // Fullscreen toggle
    const fsCheck = document.getElementById('set-fullscreen') as HTMLInputElement;
    fsCheck.checked = this.settings.fullscreen;
    fsCheck.addEventListener('change', () => {
      this.settings.fullscreen = fsCheck.checked;
      this.applyFullscreen();
      this.saveSettings();
    });

    // Exit game
    document.getElementById('btn-exit-game')!.addEventListener('click', () => {
      if (this.state === GameState.PLAYING) {
        if (confirm('Exit to desktop? Unsaved score will be lost.')) {
          window.close();
        }
      } else {
        window.close();
      }
    });

    this.renderHighScores();
  }

  private applySettings(): void {
    this.fpsCamera.applySensitivity(this.settings.dpi, this.settings.sensitivity);
    const cm360 = this.fpsCamera.getCmPer360();
    document.getElementById('cm360-display')!.textContent = String(cm360);
    this.saveSettings();
  }

  private renderHighScores(): void {
    const list = document.getElementById('high-scores-list')!;
    const scores = this.scoreManager?.highScores ?? [];
    if (scores.length === 0) {
      list.innerHTML = '<div class="score-entry" style="color:rgba(255,255,255,0.3);">No scores yet</div>';
      return;
    }
    list.innerHTML = scores.map((e, i) =>
      `<div class="score-entry">
        <span class="rank">#${i + 1}</span>
        <span class="pts">${e.score}</span>
        <span class="acc">${e.accuracy}%</span>
        <span class="date">${e.date}</span>
      </div>`
    ).join('');
  }

  // Settings persistence
  private loadSettings(): void {
    try {
      const raw = localStorage.getItem('fps_demo_settings');
      if (raw) {
        const saved = JSON.parse(raw);
        // Merge but skip targetScale — always use select default on fresh load
        this.settings.crosshairColor = saved.crosshairColor || this.settings.crosshairColor;
        this.settings.dpi = saved.dpi || this.settings.dpi;
        this.settings.sensitivity = saved.sensitivity || this.settings.sensitivity;
      }
    } catch {}
  }
  private saveSettings(): void {
    try { localStorage.setItem('fps_demo_settings', JSON.stringify(this.settings)); } catch {}
  }

  private applyFullscreen(): void {
    if (this.settings.fullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  // ═══════════════════════════════════════
  // Collision
  // ═══════════════════════════════════════

  private buildColliders(): void {
    const R = this.PLAYER_RADIUS;
    this.colliders = [
      // Four walls
      { minX: -25+R, maxX: -25+R+0.1, minZ: -25,   maxZ: 25 },    // left
      { minX: 25-R-0.1, maxX: 25-R,  minZ: -25,   maxZ: 25 },    // right
      { minZ: -25+R, maxZ: -25+R+0.1, minX: -25,   maxX: 25 },    // back
      { minZ: 25-R-0.1, maxZ: 25-R,  minX: -25,   maxX: 25 },    // front
      // Counter (8m wide)
      { minX: -4, maxX: 4, minZ: 2.4, maxZ: 3.6 },
      // Dividers at x=±5
      { minX: -5.3, maxX: -4.7, minZ: -1, maxZ: 3.5 },
      { minX:  4.7, maxX:  5.3, minZ: -1, maxZ: 3.5 },
    ];
  }

  private resolveCollision(x: number, z: number): { x: number; z: number } {
    const R = this.PLAYER_RADIUS;
    for (const c of this.colliders) {
      // Check if player circle overlaps AABB (expanded by player radius)
      if (x + R > c.minX && x - R < c.maxX && z + R > c.minZ && z - R < c.maxZ) {
        // Push out along shortest axis
        const overlapLeft   = (x + R) - c.minX;
        const overlapRight  = c.maxX - (x - R);
        const overlapBack   = (z + R) - c.minZ;
        const overlapFront  = c.maxZ - (z - R);
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapBack, overlapFront);
        if (minOverlap === overlapLeft)  x = c.minX - R;
        else if (minOverlap === overlapRight) x = c.maxX + R;
        else if (minOverlap === overlapBack)  z = c.minZ - R;
        else z = c.maxZ + R;
      }
    }
    return { x, z };
  }

  // ═══════════════════════════════════════
  // Movement
  // ═══════════════════════════════════════

  private updateMovement(dt: number): void {
    const speed = this.MOVE_SPEED * (this.input.isKeyDown('shift') ? 1.6 : 1);
    const forward = this.fpsCamera.getForward();
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const moveDir = new THREE.Vector3();
    if (this.input.isKeyDown('w')) moveDir.add(forward);
    if (this.input.isKeyDown('s')) moveDir.sub(forward);
    if (this.input.isKeyDown('a')) moveDir.sub(right);
    if (this.input.isKeyDown('d')) moveDir.add(right);
    if (moveDir.length() > 0) moveDir.normalize();

    const newX = this.fpsCamera.camera.position.x + moveDir.x * speed * dt;
    const newZ = this.fpsCamera.camera.position.z + moveDir.z * speed * dt;

    // Resolve collisions
    const resolved = this.resolveCollision(newX, newZ);
    this.fpsCamera.camera.position.x = resolved.x;
    this.fpsCamera.camera.position.z = resolved.z;

    // Fly up/down (Q/E)
    if (this.input.isKeyDown('q')) this.fpsCamera.camera.position.y += speed * dt;
    if (this.input.isKeyDown('e')) this.fpsCamera.camera.position.y -= speed * dt;

    // Jump (space) + gravity — always active
    if (this.input.isKeyDown(' ') && this.isGrounded) {
      this.playerVelocity.y = this.JUMP_FORCE;
      this.isGrounded = false;
    }
    this.playerVelocity.y -= this.GRAVITY * dt;
    this.fpsCamera.camera.position.y += this.playerVelocity.y * dt;

    // Ground clamp
    if (this.fpsCamera.camera.position.y <= this.playerHeight) {
      this.fpsCamera.camera.position.y = this.playerHeight;
      this.playerVelocity.y = 0;
      this.isGrounded = true;
    }

    // Ceiling clamp
    this.fpsCamera.camera.position.y = clamp(this.fpsCamera.camera.position.y, 0.5, 11.5);
  }

  // ═══════════════════════════════════════
  // Environment
  // ═══════════════════════════════════════

  private buildEnvironment(): void {
    // Ground
    const gnd = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshStandardMaterial({ color: 0xC8DDE8, roughness: 0.55, metalness: 0.05 })
    );
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = 0;
    gnd.receiveShadow = true; gnd.name = 'ground';
    this.scene.add(gnd); this.environmentObjects.push(gnd);

    // Grid
    const grid = new THREE.PolarGridHelper(20, 40, 30, 128, 0x90B8D0, 0x90B8D0);
    grid.position.y = 0.005;
    this.scene.add(grid); this.environmentObjects.push(grid);

    // Walls — 12m tall, double-sided so visible from both sides
    // Back wall (shooting direction) — lighter, more visible
    const shootWallMat = new THREE.MeshStandardMaterial({ color: 0xD8E8F0, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(50, 12), shootWallMat);
    backWall.position.set(0, 6, -25); backWall.receiveShadow = true; backWall.name = 'back_wall';
    this.scene.add(backWall); this.environmentObjects.push(backWall);

    // Other three walls — slightly different blue-gray, full enclosure
    const sideWallMat = new THREE.MeshStandardMaterial({ color: 0xB0CCDA, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide });

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(50, 12), sideWallMat);
    leftWall.position.set(-25, 6, 0); leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true; leftWall.name = 'left_wall';
    this.scene.add(leftWall); this.environmentObjects.push(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(50, 12), sideWallMat);
    rightWall.position.set(25, 6, 0); rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true; rightWall.name = 'right_wall';
    this.scene.add(rightWall); this.environmentObjects.push(rightWall);

    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(50, 12), sideWallMat);
    frontWall.position.set(0, 6, 25); frontWall.receiveShadow = true; frontWall.name = 'front_wall';
    this.scene.add(frontWall); this.environmentObjects.push(frontWall);

    // Counter — wider (8m) so dividers don't block target view
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.8, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x7B96A8, roughness: 0.3, metalness: 0.6 })
    );
    counter.position.set(0, 0.4, 3);
    counter.castShadow = true; counter.receiveShadow = true; counter.name = 'counter';
    this.scene.add(counter); this.environmentObjects.push(counter);

    // Dividers — moved farther apart (x=±5) past the wider counter
    const divMat = new THREE.MeshStandardMaterial({ color: 0x8DA8B8, roughness: 0.4, metalness: 0.35 });
    [-5, 5].forEach(x => {
      const div = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 4), divMat);
      div.position.set(x, 1.5, 1.5);
      div.castShadow = true; div.receiveShadow = true; div.name = 'divider';
      this.scene.add(div); this.environmentObjects.push(div);
    });

    // Ceiling
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshStandardMaterial({ color: 0xD4E8F2, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide })
    );
    ceil.rotation.x = -Math.PI / 2; ceil.position.y = 12; ceil.name = 'ceiling';
    this.scene.add(ceil); this.environmentObjects.push(ceil);

    // Distance markers
    [10, 20, 30, 40, 50].forEach(dist => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, 2),
        new THREE.MeshBasicMaterial({ color: 0x5B9ECF, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
      );
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.006, -dist); m.name = `dist_${dist}`;
      this.scene.add(m); this.environmentObjects.push(m);
    });

    // Rails
    const railMat = new THREE.MeshStandardMaterial({ color: 0x8DA8B8, roughness: 0.25, metalness: 0.8 });
    [-4, -2, 0, 2, 4].forEach(x => {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 10, 8), railMat);
      rail.position.set(x, 5, -24.5); rail.castShadow = true; rail.name = 'rail';
      this.scene.add(rail); this.environmentObjects.push(rail);
    });
  }

  // ═══════════════════════════════════════
  // Lighting
  // ═══════════════════════════════════════

  private setupLighting(): void {
    this.scene.add(new THREE.AmbientLight(0xB0D8F0, 0.8));
    this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0xC8DDE8, 0.6));

    const sun = new THREE.DirectionalLight(0xFFFFFF, 2.5);
    sun.position.set(15, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048; sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -5;
    sun.shadow.bias = -0.0001;
    this.scene.add(sun);

    // Three spotlights covering the full 20m-wide target wall
    [-8, 0, 8].forEach(x => {
      const spot = new THREE.SpotLight(0xFFF8F0, 25, 50, Math.PI / 5, 0.3, 0.8);
      spot.position.set(x, 8, -8);
      spot.target.position.set(x, 5, -25);
      spot.castShadow = true;
      spot.shadow.mapSize.width = 1024; spot.shadow.mapSize.height = 1024;
      this.scene.add(spot); this.scene.add(spot.target);
    });

    [-10, 10].forEach(x => {
      const fl = new THREE.PointLight(0x88BBEE, 20, 30);
      fl.position.set(x, 5, -10);
      this.scene.add(fl);
    });
    const oh = new THREE.PointLight(0xD0E8F5, 15, 15);
    oh.position.set(0, 10, -8);
    this.scene.add(oh);
  }

  // ═══════════════════════════════════════
  // Pistol Model
  // ═══════════════════════════════════════

  private buildPistolModel(): THREE.Group {
    const g = new THREE.Group();
    const md = new THREE.MeshStandardMaterial({ color: 0x2C2C30, roughness: 0.25, metalness: 0.9 });
    const mm = new THREE.MeshStandardMaterial({ color: 0x3A3A40, roughness: 0.3, metalness: 0.85 });
    const ml = new THREE.MeshStandardMaterial({ color: 0x505058, roughness: 0.35, metalness: 0.8 });
    const gm = new THREE.MeshStandardMaterial({ color: 0x1A1818, roughness: 0.6, metalness: 0.05 });
    const am = new THREE.MeshStandardMaterial({ color: 0xD44030, roughness: 0.3, metalness: 0.5 });

    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.55), mm)).position.set(0, 0, -0.05);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.50), ml)).position.set(0, 0.065, -0.05);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.25, 12), md);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.42);
    g.add(barrel);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 8, 16), md)).position.set(0, 0.01, -0.54);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.20), mm)).position.set(0, -0.04, 0.08);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 8, 12, Math.PI), md);
    guard.position.set(0, -0.06, 0.15); guard.rotation.z = Math.PI;
    g.add(guard);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), ml)).position.set(0, -0.04, 0.17);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.09), gm);
    grip.position.set(0, -0.16, 0.08); grip.rotation.x = 0.35;
    g.add(grip);
    [-0.036, 0.036].forEach(x => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.18, 0.07), am);
      p.position.set(x, -0.16, 0.08); p.rotation.x = 0.35;
      g.add(p);
    });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.08), md)).position.set(0, -0.27, 0.06);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), md)).position.set(0, 0.07, -0.28);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.015), md)).position.set(0, 0.07, -0.40);
    g.name = 'pistol_model';
    return g;
  }

  private buildRifleModel(): THREE.Group {
    const g = new THREE.Group();
    const md = new THREE.MeshStandardMaterial({ color: 0x1C1C22, roughness: 0.2, metalness: 0.9 });
    const mm = new THREE.MeshStandardMaterial({ color: 0x2A2A32, roughness: 0.25, metalness: 0.85 });
    const ml = new THREE.MeshStandardMaterial({ color: 0x404048, roughness: 0.3, metalness: 0.8 });
    const gm = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5, metalness: 0.05 });

    // Barrel assembly (long)
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.7, 12), md);
    b.position.set(0, 0.02, -0.75); b.rotation.set(Math.PI/2, 0, 0); g.add(b);
    // Barrel shroud
    const bs = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.55, 12), mm);
    bs.position.set(0, 0.02, -0.6); bs.rotation.set(Math.PI/2, 0, 0); g.add(bs);
    // Receiver (main body)
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), mm)).position.set(0, 0, -0.1);
    // Upper receiver rail
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.45), ml)).position.set(0, 0.065, -0.1);
    // Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.35), gm);
    stock.position.set(0, -0.02, 0.25); stock.rotation.x = -0.15;
    g.add(stock);
    // Stock pad
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.04), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.0 }));
    sp.position.set(0, -0.06, 0.4); sp.rotation.x = -0.15; g.add(sp);
    // Magazine
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), md)).position.set(0, -0.12, 0.05);
    // Forward grip
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), gm)).position.set(0, -0.12, -0.4);
    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), gm);
    grip.position.set(0, -0.15, 0.05); grip.rotation.x = 0.3;
    g.add(grip);
    // Front sight
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.015), md)).position.set(0, 0.07, -0.7);
    // Rear sight
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.02), md)).position.set(0, 0.07, -0.32);

    g.position.set(0.28, -0.28, -0.6);
    g.rotation.set(0, 0.03, 0);
    g.name = 'rifle_model';
    return g;
  }

  private buildKnifeModel(): THREE.Group {
    const g = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xE8E8F0, roughness: 0.1, metalness: 0.95 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.05, metalness: 0.9, emissive: 0x333333, emissiveIntensity: 0.3 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x2A1810, roughness: 0.45, metalness: 0.05 });
    const guardMat = new THREE.MeshStandardMaterial({ color: 0x484850, roughness: 0.25, metalness: 0.85 });
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x606068, roughness: 0.2, metalness: 0.9 });

    // Main blade body — tapered shape using a box
    const bladeBody = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.006), bladeMat);
    bladeBody.position.set(0, 0.05, -0.04);
    g.add(bladeBody);

    // Blade edge highlight — thin bright strip
    const bladeEdge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.002), edgeMat);
    bladeEdge.position.set(0, 0.05, -0.042);
    g.add(bladeEdge);

    // Clip-point tip (cone forming the dagger point)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 12), bladeMat);
    tip.position.set(0, 0.155, -0.04); tip.rotation.z = Math.PI / 2;
    g.add(tip);

    // Serrations (small notches on blade spine)
    for (let i = 0; i < 6; i++) {
      const notch = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.006, 0.003),
        new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.7 })
      );
      notch.position.set(0, 0.02 + i * 0.022, -0.037);
      g.add(notch);
    }

    // Fuller (blood groove) — dark line down the blade center
    const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.12, 0.001), new THREE.MeshStandardMaterial({ color: 0x444450, roughness: 0.4, metalness: 0.6 }));
    fuller.position.set(0, 0.06, -0.038);
    g.add(fuller);

    // Guard — curved
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.025), guardMat);
    guard.position.set(0, -0.04, -0.04);
    g.add(guard);

    // Guard ring loops
    [-0.035, 0.035].forEach(x => {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 12), ringMat);
      loop.position.set(x, -0.04, -0.04);
      g.add(loop);
    });

    // Handle — faceted grip
    const handleCore = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.13, 0.02), handleMat);
    handleCore.position.set(0, -0.13, -0.04);
    g.add(handleCore);

    // Handle wrapping (3 bands)
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.015, 0.022), new THREE.MeshStandardMaterial({ color: 0x1A1008, roughness: 0.6, metalness: 0.0 }));
      band.position.set(0, -0.08 - i * 0.04, -0.04);
      g.add(band);
    }

    // Pommel — faceted end cap
    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.025, 12), guardMat);
    pommel.position.set(0, -0.21, -0.04); pommel.rotation.set(Math.PI / 2, 0, 0);
    g.add(pommel);

    // Pommel ring
    const pommelRing = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 8, 16), ringMat);
    pommelRing.position.set(0, -0.21, -0.04);
    g.add(pommelRing);

    g.position.set(0.22, -0.28, -0.45);
    g.rotation.set(0.3, 0.1, -0.15);
    g.name = 'knife_model';
    return g;
  }

  // ═══════════════════════════════════════
  // Input / Events
  // ═══════════════════════════════════════

  private setupPointerLock(): void {
    this.canvas.addEventListener('click', () => {
      if (this.state === GameState.PLAYING && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock({ unadjustedMovement: true });
      }
    });
  }

  private setupEventListeners(): void {
    events.on(GameEvents.WEAPON_SHOT, () => {
      this.kickBack = -0.04;
      this.updateAmmoHUD();
    });
    events.on(GameEvents.AMMO_CHANGED, (mag: number, reserve: number) => {
      this.updateAmmoHUD();
    });
    events.on(GameEvents.WEAPON_RELOAD_START, () => {
      document.getElementById('ammo-current')!.textContent = '...';
    });
  }

  private cycleWeapon(): void {
    // Hide all models
    this.pistolModel.visible = false;
    this.rifleModel.visible = false;
    this.knifeModel.visible = false;

    const keys = Array.from(this.weapons.keys());
    const idx = keys.indexOf(this.currentWeaponId);
    const next = keys[(idx + 1) % keys.length];
    this.currentWeaponId = next;

    if (next === 'pistol') {
      this.activeWeaponModel = this.pistolModel;
      this.pistolModel.visible = true;
      this.isMelee = false;
    } else if (next === 'rifle') {
      this.activeWeaponModel = this.rifleModel;
      this.rifleModel.visible = true;
      this.isMelee = false;
    }

    const w = this.weapons.get(next)!;
    w.currentMag = w.config.magSize;
    w.currentReserve = w.config.maxAmmo;
    this.currentWeapon = w;
    this.updateAmmoHUD();
  }

  private switchToMelee(): void {
    this.pistolModel.visible = false;
    this.rifleModel.visible = false;
    this.knifeModel.visible = true;
    this.activeWeaponModel = this.knifeModel;
    this.isMelee = true;
    this.currentWeaponId = 'melee';
    document.getElementById('ammo-current')!.textContent = '∞';
    document.getElementById('ammo-reserve')!.textContent = '∞';
  }

  private updateAmmoHUD(): void {
    document.getElementById('ammo-current')!.textContent = String(this.currentWeapon.currentMag);
    document.getElementById('ammo-reserve')!.textContent = String(this.currentWeapon.currentReserve);
  }

  private updateLoadingUI(status: string, pct: number): void {
    const bar = document.getElementById('load-bar');
    const st = document.getElementById('load-status');
    if (bar) bar.style.width = pct + '%';
    if (st) st.textContent = status;
  }
}
