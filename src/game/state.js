// Run state and the scoring rules. Everything that decides "how well is this
// run going" lives here; nothing in this file draws or knows about WebGL.
import { min, max } from '../engine/math.js';

/** Screen the game is on: 0 title, 1 playing, 2 paused, 3 run over. */
export const MODE = { _v: 0 };

export const S = {
  _score: 0, _combo: 1, _time: 90, _best: 0,
  _flash: 0,       // ribbon whiteout on a successful loop
  _shake: 0,
  _slow: 0,        // seconds of slow-motion remaining
  _over: 0, _run: 0, _elapsed: 0,
  _last: 0,        // seconds since the last loop (drives combo decay)
  _pop: null,      // floating "+score" readout, or null
  _sever: 0,
};

export const RUN_TIME = 90;
export const TIME_CAP = 120;
export const COMBO_WINDOW = 8;   // seconds within which loops keep the chain

// --- observers ----------------------------------------------------------------
// main.js owns audio and the paint framebuffer, so the rules layer announces
// events rather than reaching into them.
let onLoop = () => { };
let onEnd = () => { };
export const setLoopCb = (f) => (onLoop = f);
export const setEndCb = (f) => (onEnd = f);
export const fireLoop = (n, combo, cx, cy, cz, at) => onLoop(n, combo, cx, cy, cz, at);

// --- persistence --------------------------------------------------------------
export const loadBest = () => {
  try { S._best = +localStorage.pl26 || 0; } catch (e) { }
};

export const resetState = () => {
  S._score = 0; S._combo = 1; S._time = RUN_TIME; S._over = 0; S._run = 1;
  S._elapsed = 0; S._last = 0; S._flash = 0; S._shake = 0; S._slow = 0;
  S._pop = null; S._sever = 0;
  loadBest();
};

export const endRun = () => {
  S._over = 1;
  S._run = 0;
  onEnd();
  if (S._score > S._best) {
    S._best = S._score;
    try { localStorage.pl26 = S._score; } catch (e) { }
  }
};

/**
 * Apply the reward for a loop that enclosed `n` gloom, and return the points
 * gained. Score is superlinear in `n` (1 -> 100, 2 -> 300, 3 -> 600, 4 -> 1000),
 * which is what makes one greedy wide arc worth more than several safe ones.
 */
export const award = (n) => {
  const gain = ((n * (n + 1)) / 2) * 100 * S._combo;
  S._score += gain;
  S._time = min(TIME_CAP, S._time + 1.5 * n);
  S._combo = min(9, S._combo + (S._last < COMBO_WINDOW ? 1 : 0));
  S._last = 0;
  S._flash = 1;
  S._shake = min(1, 0.35 + n * 0.16);
  S._slow = 0.16;
  return gain;
};

/** Decay the short-lived feedback timers. Runs even while the run is over. */
export const decay = (dt) => {
  S._flash = max(0, S._flash - dt * 3.2);
  S._shake = max(0, S._shake - dt * 2.6);
  S._slow = max(0, S._slow - dt);
  S._sever = max(0, S._sever - dt * 2.5);
  if (S._pop && (S._pop._l -= dt) <= 0) S._pop = null;
};
