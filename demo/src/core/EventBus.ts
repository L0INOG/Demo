/**
 * Global event bus for decoupled communication between systems.
 * Pattern from research report 01 — decouples components.
 */

type EventHandler = (...args: any[]) => void;

export class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(...args);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

// Global singleton
export const events = new EventBus();

// Event name constants
export const GameEvents = {
  WEAPON_SHOT: 'weapon:shot',
  WEAPON_RELOAD_START: 'weapon:reload_start',
  WEAPON_RELOAD_COMPLETE: 'weapon:reload_complete',
  WEAPON_EMPTY: 'weapon:empty',
  TARGET_HIT: 'target:hit',
  TARGET_MISS: 'target:miss',
  TARGET_DESTROYED: 'target:destroyed',
  TARGET_SPAWNED: 'target:spawned',
  SCORE_CHANGED: 'score:changed',
  COMBO_CHANGED: 'combo:changed',
  AMMO_CHANGED: 'ammo:changed',
  GAME_READY: 'game:ready',
} as const;
