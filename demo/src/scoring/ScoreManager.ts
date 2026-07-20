/**
 * Simple scoring: 1 point per target hit. High scores saved to localStorage.
 */
import { events, GameEvents } from '../core/EventBus';

const STORAGE_KEY = 'fps_demo_highscores';
const MAX_SCORES = 5;

export interface HighScoreEntry {
  score: number;
  date: string;
  accuracy: number;
}

export class ScoreManager {
  score: number = 0;
  totalShots: number = 0;
  totalHits: number = 0;
  totalHeadshots: number = 0;

  // Timer
  timeRemaining: number = 60;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private onTimerEnd: (() => void) | null = null;

  // High scores (loaded from localStorage)
  highScores: HighScoreEntry[] = [];

  constructor() {
    this.loadHighScores();
    this.setupListeners();
  }

  private setupListeners(): void {
    events.on(GameEvents.WEAPON_SHOT, () => {
      if (this.timeRemaining <= 0) return;
      this.totalShots++;
      this.updateHUD();
    });

    events.on(GameEvents.TARGET_HIT, (data: any) => {
      if (this.timeRemaining <= 0) return;
      this.totalHits++;
      if (data.isHeadshot) this.totalHeadshots++;
      // Fixed 1 point per target
      this.score += 1;
      events.emit(GameEvents.SCORE_CHANGED, this.score);
      this.updateHUD();
    });

    events.on(GameEvents.TARGET_MISS, () => {
      this.totalShots++;
      this.updateHUD();
    });
  }

  get accuracy(): number {
    if (this.totalShots === 0) return 100;
    return Math.round((this.totalHits / this.totalShots) * 100);
  }

  // ── Timer ──

  startTimer(onEnd: () => void): void {
    this.onTimerEnd = onEnd;
    this.timeRemaining = 60;
    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      this.updateTimerDisplay();
      if (this.timeRemaining <= 0) {
        this.stopTimer();
        this.onTimerEnd?.();
      }
    }, 1000);
    this.updateTimerDisplay();
  }

  stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // ── High Scores ──

  saveCurrentScore(): void {
    const entry: HighScoreEntry = {
      score: this.score,
      date: new Date().toLocaleString(),
      accuracy: this.accuracy,
    };
    this.highScores.push(entry);
    this.highScores.sort((a, b) => b.score - a.score);
    this.highScores = this.highScores.slice(0, MAX_SCORES);
    this.persistHighScores();
  }

  private loadHighScores(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.highScores = JSON.parse(raw);
    } catch {
      this.highScores = [];
    }
  }

  private persistHighScores(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.highScores));
    } catch { /* storage full or unavailable */ }
  }

  clearHighScores(): void {
    this.highScores = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // ── Display ──

  private updateTimerDisplay(): void {
    const el = document.getElementById('timer-display');
    if (el) {
      el.textContent = this.timeRemaining > 0 ? `${this.timeRemaining}s` : '0s';
      if (this.timeRemaining <= 10) el.style.color = '#ff4444';
      else el.style.color = '#fff';
    }
  }

  private updateHUD(): void {
    const scoreEl = document.getElementById('score-display');
    const accEl = document.getElementById('accuracy-display');
    if (scoreEl) scoreEl.textContent = `Score: ${this.score}`;
    if (accEl) accEl.textContent = `${this.accuracy}%`;
  }

  reset(): void {
    this.stopTimer();
    this.score = 0;
    this.totalShots = 0;
    this.totalHits = 0;
    this.totalHeadshots = 0;
    this.timeRemaining = 60;
    this.updateHUD();
    this.updateTimerDisplay();
  }
}
