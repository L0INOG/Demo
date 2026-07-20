/**
 * Generic object pool for reusing objects and reducing GC pressure.
 * Follows the pattern from research report 02 (TargetPool) and report 03 (UIPool).
 */
export class ObjectPool<T> {
  private available: T[] = [];
  private active: T[] = [];
  private factory: () => T;
  private resetFn: (item: T) => void;

  constructor(factory: () => T, resetFn: (item: T) => void, prewarmCount: number = 0) {
    this.factory = factory;
    this.resetFn = resetFn;
    for (let i = 0; i < prewarmCount; i++) {
      const instance = this.factory();
      this.resetFn(instance);
      this.available.push(instance);
    }
  }

  get(): T {
    const instance = this.available.pop() ?? this.factory();
    this.active.push(instance);
    return instance;
  }

  release(instance: T): void {
    this.resetFn(instance);
    const idx = this.active.indexOf(instance);
    if (idx !== -1) this.active.splice(idx, 1);
    this.available.push(instance);
  }

  releaseAll(): void {
    while (this.active.length > 0) {
      this.release(this.active[0]);
    }
  }

  get activeCount(): number { return this.active.length; }
  get availableCount(): number { return this.available.length; }
}
