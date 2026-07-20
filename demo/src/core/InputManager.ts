/**
 * Input manager — tracks keyboard and mouse state each frame.
 * Uses PointerLock with unadjustedMovement for raw mouse input (report 02 §2.3).
 */
export class InputManager {
  // Keyboard state
  private keysDown: Set<string> = new Set();
  private keysPressed: Set<string> = new Set();
  private keysReleased: Set<string> = new Set();

  // Mouse state
  mouseX: number = 0;
  mouseY: number = 0;
  mouseDX: number = 0;
  mouseDY: number = 0;

  // Trigger (mouse button)
  isTriggerDown: boolean = false;
  isTriggerPressed: boolean = false;
  isTriggerReleased: boolean = false;

  // Reload
  isReloadPressed: boolean = false;

  // Weapon switch
  switchWeaponPressed: boolean = false;

  // Menu toggle
  tabPressed: boolean = false;

  private enabled: boolean = true;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
  }

  attach(canvas: HTMLCanvasElement): void {
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    document.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
  }

  detach(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }

  /**
   * Call once per frame AFTER all consumers have read the previous frame's data.
   * Resets per-frame transient state (pressed/released/mouse delta).
   */
  endFrame(): void {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.isTriggerPressed = false;
    this.isTriggerReleased = false;
    this.isReloadPressed = false;
    this.switchWeaponPressed = false;
    this.tabPressed = false;
  }

  isKeyDown(key: string): boolean {
    return this.keysDown.has(key.toLowerCase());
  }

  wasKeyPressed(key: string): boolean {
    return this.keysPressed.has(key.toLowerCase());
  }

  wasKeyReleased(key: string): boolean {
    return this.keysReleased.has(key.toLowerCase());
  }

  // ── Handlers ──

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const key = e.key.toLowerCase();
    if (!this.keysDown.has(key)) {
      this.keysPressed.add(key);
    }
    this.keysDown.add(key);

    if (key === 'r') this.isReloadPressed = true;
    if (key === '1' || key === '2') this.switchWeaponPressed = true;
    if (key === ' ') { e.preventDefault(); } // prevent page scroll
    if (key === 'tab') {
      this.tabPressed = true;
      e.preventDefault(); // prevent browser tab switching
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.keysDown.delete(key);
    this.keysReleased.add(key);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.enabled) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
    this.mouseX += e.movementX;
    this.mouseY += e.movementY;
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.enabled) return;
    if (e.button === 0) {
      if (!this.isTriggerDown) {
        this.isTriggerPressed = true;
      }
      this.isTriggerDown = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.isTriggerDown = false;
      this.isTriggerReleased = true;
    }
  }
}
