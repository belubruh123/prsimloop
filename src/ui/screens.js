// The HUD and the three full-screen states, drawn with the primitives in draw.js.
import { W, H } from '../engine/gl.js';
import { S, MODE, RUN_TIME, COMBO_WINDOW } from '../game/state.js';
import { edgeWarn } from '../game/player.js';
import { K, rect, text, rainbowText, rainbow, commas, project, flushUI } from './draw.js';
import { clamp, sin } from '../engine/math.js';

const hud = (T, vp) => {
  const k = K();
  const pad = 26 * k;

  text('SCORE', pad, pad, 15 * k, 0.35, 0.28, 0.4, 0.85, 0);
  text(commas(S._score), pad, pad + 18 * k, 40 * k, 1, 1, 1, 1, 0);
  text('BEST', W - pad, pad, 15 * k, 0.35, 0.28, 0.4, 0.8, 2);
  text(commas(S._best), W - pad, pad + 18 * k, 24 * k, 0.55, 0.5, 0.6, 0.9, 2);

  // Time bar - the whole tension of a run lives here, so it gets the rainbow.
  const bw = 340 * k, bh = 13 * k, bx = W / 2 - bw / 2, by = pad + 6 * k;
  const f = clamp(S._time / RUN_TIME, 0, 1);
  const low = S._time < 15;
  const pulse = low ? 0.6 + 0.4 * sin(T * 9) : 1;
  rect(bx - 3 * k, by - 3 * k, bw + 6 * k, bh + 6 * k, 0.25, 0.2, 0.3, 0.3);
  for (let i = 0; i < 7; i++) {
    const fill = clamp(f * 7 - i, 0, 1);
    if (fill <= 0) continue;
    const c = rainbow(i / 6);
    rect(bx + (i * bw) / 7, by, (bw / 7) * fill, bh,
      c[0] * 1.18 * pulse, c[1] * 1.18 * pulse, c[2] * 1.18 * pulse, 1);
  }
  text(S._time.toFixed(1), W / 2, by + bh + 8 * k, 20 * k,
    low ? 1 : 0.45, 0.4, low ? 0.45 : 0.5, 1, 1);

  // Combo, with a bar showing how long is left to keep the chain alive.
  if (S._combo > 1) {
    const g = 1 - clamp(S._last / COMBO_WINDOW, 0, 1);
    rainbowText('X' + S._combo, W / 2, H - 96 * k, 46 * k * (1 + 0.12 * sin(T * 7)), 1, 1, T * 0.25);
    rect(W / 2 - 60 * k, H - 44 * k, 120 * k * g, 5 * k, 1.3, 1.1, 1.4, 0.8);
  }

  // Floating score popup anchored to the loop that earned it. You almost always
  // fly straight past what you enclosed, so fall back to a fixed on-screen spot
  // rather than letting the reward vanish behind the camera.
  if (S._pop) {
    const p = S._pop;
    const rise = (1.5 - p._l) * 9;
    let sc = project(vp, p._x, p._y + rise, p._z);
    const m = 90 * k;
    if (!sc || sc[0] < m || sc[0] > W - m || sc[1] < m || sc[1] > H - m)
      sc = [W / 2, H * 0.3 - rise * 2 * k];
    const a = clamp(p._l * 1.6, 0, 1);
    rainbowText('+' + commas(p._g), sc[0], sc[1], 34 * k, a, 1, T * 0.3);
    text(p._n + ' FREED', sc[0], sc[1] + 34 * k, 15 * k, 1, 1, 1, a * 0.8, 1);
  }

  if (S._sever > 0.05) text('RIBBON CUT!', W / 2, H * 0.32, 26 * k, 1, 0.6, 0.65, S._sever, 1);

  // The arena boundary steers you back on its own; this says why.
  const ew = edgeWarn();
  if (ew > 0.12) {
    const a = ew * (0.55 + 0.45 * sin(T * 8));
    text('TURN BACK', W / 2, H * 0.24, 30 * k, 1, 0.55, 0.6, a, 1);
    rect(0, 0, W, 6 * k, 1, 0.5, 0.55, a * 0.7);
    rect(0, H - 6 * k, W, 6 * k, 1, 0.5, 0.55, a * 0.7);
  }
};

const title = (T) => {
  const k = K();
  rect(0, 0, W, H, 0.1, 0.05, 0.14, 0.34);
  rainbowText('PRISM LOOP', W / 2, H * 0.22, 82 * k, 1, 1, T * 0.12);
  text('THE SKY ISLAND HAS LOST ITS COLOUR', W / 2, H * 0.38, 20 * k, 1, 0.96, 1, 0.9, 1);
  text('DRAW A RAINBOW LOOP AROUND THE GREY', W / 2, H * 0.43, 20 * k, 1, 0.96, 1, 0.9, 1);
  text('TO BRING IT BACK', W / 2, H * 0.48, 20 * k, 1, 0.96, 1, 0.9, 1);

  text('MOVE  MOUSE OR A D', W / 2, H * 0.6, 17 * k, 0.8, 0.78, 0.9, 0.85, 1);
  text('HOLD SPACE  TIGHT BANK', W / 2, H * 0.645, 17 * k, 0.8, 0.78, 0.9, 0.85, 1);
  text('BIGGER LOOPS SCORE FAR MORE', W / 2, H * 0.69, 17 * k, 0.8, 0.78, 0.9, 0.85, 1);

  rainbowText('CLICK TO FLY', W / 2, H * 0.8, 40 * k, 0.65 + 0.35 * sin(T * 3.5), 1, T * 0.3);
  if (S._best) text('BEST  ' + commas(S._best), W / 2, H * 0.9, 18 * k, 0.75, 0.7, 0.85, 0.9, 1);
};

const over = (T) => {
  const k = K();
  rect(0, 0, W, H, 0.1, 0.05, 0.14, 0.42);
  rainbowText('TIME UP', W / 2, H * 0.24, 70 * k, 1, 1, T * 0.15);
  text('SCORE', W / 2, H * 0.42, 20 * k, 0.8, 0.76, 0.9, 0.9, 1);
  text(commas(S._score), W / 2, H * 0.465, 62 * k, 1, 1, 1, 1, 1);
  if (S._score >= S._best && S._score > 0)
    rainbowText('NEW BEST!', W / 2, H * 0.6, 34 * k, 0.8 + 0.2 * sin(T * 6), 1, T * 0.4);
  else text('BEST  ' + commas(S._best), W / 2, H * 0.61, 22 * k, 0.75, 0.7, 0.85, 0.9, 1);
  text('PRESS R TO FLY AGAIN', W / 2, H * 0.78, 28 * k, 1, 0.95, 1, 0.6 + 0.4 * sin(T * 3.5), 1);
};

const paused = (T) => {
  const k = K();
  rect(0, 0, W, H, 0.1, 0.05, 0.14, 0.42);
  rainbowText('PAUSED', W / 2, H * 0.4, 62 * k, 1, 1, T * 0.15);
  text('ESC TO RESUME    R TO RESTART', W / 2, H * 0.55, 20 * k, 0.9, 0.86, 1, 0.9, 1);
};

export const drawUI = (T, vp, muted) => {
  const m = MODE._v;
  if (m === 1 || m === 2) hud(T, vp);
  if (m === 0) title(T);
  if (m === 2) paused(T);
  if (m === 3) over(T);
  if (muted) text('MUTED  M', W - 26 * K(), H - 30 * K(), 14 * K(), 0.7, 0.66, 0.8, 0.8, 2);
  flushUI();
};
