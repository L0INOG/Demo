/**
 * Tactical Range Demo — Entry Point
 */
import { Game } from './core/Game';

// Prove JS loaded: these will visibly change the page even if Game crashes
const statusEl = document.getElementById('load-status');
const barEl = document.getElementById('load-bar');

// Change body background to green tint to prove JS executed at all
document.body.style.background = '#003300';

if (statusEl) statusEl.textContent = 'JS loaded, creating Game...';
if (barEl) barEl.style.width = '5%';

setTimeout(() => {
  try {
    new Game();
  } catch (err: any) {
    console.error('Fatal:', err);
    if (statusEl) statusEl.textContent = 'FATAL: ' + (err?.message || String(err));
    if (barEl) { barEl.style.background = '#ff3333'; barEl.style.width = '100%'; }
  }
}, 50);
