// Every screen and readout is drawn as textured quads in an orthographic pass.
// There is no HTML UI anywhere - the page is a bare <canvas>.
import { G, W, H, push, flush } from './gl.js';
import { charUV, WHITE } from './atlas.js';
import { S } from './game.js';
import { edgeWarn } from './player.js';
import { clamp, min, max, sin, floor, lerp } from './math.js';

export const MODE = { _v: 0 };   // 0 title, 1 playing, 2 paused, 3 over

let Q;                            // the quad mesh, supplied by main
export const setQuad = (m) => (Q = m);

export const K = () => min(W, H) / 720;

// The orthographic pass has Y pointing down the screen, so UI quads have to
// sample the atlas upside down to come out the right way up.
const fv = (uv) => [uv[0], uv[1] + uv[3], uv[2], -uv[3]];

export const rect = (x, y, w, h, r, g, b, a) =>
  push(Q, x + w / 2, y + h / 2, 0, w, h, 1, 0, r, g, b, a, ...WHITE);

/** align: 0 left, 1 centre, 2 right. Returns the drawn width. */
export const text = (s, x, y, size, r, g, b, a, align) => {
  const adv = size * 0.7;
  const w = s.length * adv;
  let px = x - (align === 1 ? w / 2 : align === 2 ? w : 0);
  for (const ch of s) {
    const uv = charUV(ch);
    if (uv) push(Q, px + adv / 2, y + size / 2, 0, size, size, 1, 0, r, g, b, a, ...fv(uv));
    px += adv;
  }
  return w;
};

/** Rainbow-per-letter text, for the title and big callouts. */
export const rainbowText = (s, x, y, size, a, align, phase) => {
  const adv = size * 0.7;
  const w = s.length * adv;
  let px = x - (align === 1 ? w / 2 : align === 2 ? w : 0);
  for (let i = 0; i < s.length; i++) {
    const uv = charUV(s[i]);
    const t = i / max(1, s.length - 1) + phase;
    const r = 0.62 + 0.38 * Math.cos(6.2832 * t);
    const g = 0.62 + 0.38 * Math.cos(6.2832 * (t + 0.33));
    const b = 0.62 + 0.38 * Math.cos(6.2832 * (t + 0.67));
    if (uv) push(Q, px + adv / 2, y + size / 2, 0, size, size, 1, 0, r * 1.4, g * 1.4, b * 1.4, a, ...fv(uv));
    px += adv;
  }
  return w;
};

const commas = (n) => {
  let s = '' + floor(n), o = '';
  for (let i = 0; i < s.length; i++) o += ((s.length - i) % 3 || i === 0 ? '' : ',') + s[i];
  return o;
};

/** Project a world point to pixel coordinates, or null if behind the camera. */
export const project = (vp, x, y, z) => {
  const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (w <= 0.01) return 0;
  const sx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w;
  const sy = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
  return [(sx * 0.5 + 0.5) * W, (0.5 - sy * 0.5) * H];
};

// --- screens ------------------------------------------------------------------
const hud = (T, vp) => {
  const k = K();
  const pad = 26 * k;

  text('SCORE', pad, pad, 15 * k, 0.35, 0.28, 0.4, 0.85, 0);
  text(commas(S._score), pad, pad + 18 * k, 40 * k, 1, 1, 1, 1, 0);

  text('BEST', W - pad, pad, 15 * k, 0.35, 0.28, 0.4, 0.8, 2);
  text(commas(S._best), W - pad, pad + 18 * k, 24 * k, 0.55, 0.5, 0.6, 0.9, 2);

  // time bar - the run's whole tension lives here
  const bw = 340 * k, bh = 13 * k, bx = W / 2 - bw / 2, by = pad + 6 * k;
  const f = clamp(S._time / 90, 0, 1);
  rect(bx - 3 * k, by - 3 * k, bw + 6 * k, bh + 6 * k, 0.25, 0.2, 0.3, 0.3);
  const low = S._time < 15;
  const pulse = low ? 0.6 + 0.4 * sin(T * 9) : 1;
  for (let i = 0; i < 7; i++) {
    const seg = bw / 7;
    const fill = clamp(f * 7 - i, 0, 1);
    if (fill <= 0) continue;
    const t = i / 6;
    rect(bx + i * seg, by, seg * fill, bh,
      (0.62 + 0.38 * Math.cos(6.2832 * t)) * 1.18 * pulse,
      (0.62 + 0.38 * Math.cos(6.2832 * (t + 0.33))) * 1.18 * pulse,
      (0.62 + 0.38 * Math.cos(6.2832 * (t + 0.67))) * 1.18 * pulse, 1);
  }
  text(S._time.toFixed(1), W / 2, by + bh + 8 * k, 20 * k, low ? 1 : 0.45,
    low ? 0.4 : 0.4, low ? 0.45 : 0.5, 1, 1);

  // combo
  if (S._combo > 1) {
    const g = 1 - clamp(S._last / 8, 0, 1);
    const s = 46 * k * (1 + 0.12 * sin(T * 7));
    rainbowText('X' + S._combo, W / 2, H - 96 * k, s, 1, 1, T * 0.25);
    rect(W / 2 - 60 * k, H - 44 * k, 120 * k * g, 5 * k, 1.3, 1.1, 1.4, 0.8);
  }

  // floating score popup at the loop that earned it
  if (S._pop) {
    const p = S._pop;
    const sc = project(vp, p._x, p._y + (1.5 - p._l) * 9, p._z);
    if (sc) {
      const a = clamp(p._l * 1.6, 0, 1);
      rainbowText('+' + commas(p._g), sc[0], sc[1], 34 * k, a, 1, T * 0.3);
      text(p._n + ' FREED', sc[0], sc[1] + 34 * k, 15 * k, 1, 1, 1, a * 0.8, 1);
    }
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

  text('MOVE  MOUSE OR A D', W / 2, H * 0.60, 17 * k, 0.8, 0.78, 0.9, 0.85, 1);
  text('HOLD SPACE  TIGHT BANK', W / 2, H * 0.645, 17 * k, 0.8, 0.78, 0.9, 0.85, 1);
  text('BIGGER LOOPS SCORE FAR MORE', W / 2, H * 0.69, 17 * k, 0.8, 0.78, 0.9, 0.85, 1);

  const p = 0.65 + 0.35 * sin(T * 3.5);
  rainbowText('CLICK TO FLY', W / 2, H * 0.80, 40 * k, p, 1, T * 0.3);
  if (S._best) text('BEST  ' + commas(S._best), W / 2, H * 0.90, 18 * k, 0.75, 0.7, 0.85, 0.9, 1);
};

const over = (T) => {
  const k = K();
  rect(0, 0, W, H, 0.1, 0.05, 0.14, 0.42);
  rainbowText('TIME UP', W / 2, H * 0.24, 70 * k, 1, 1, T * 0.15);
  text('SCORE', W / 2, H * 0.42, 20 * k, 0.8, 0.76, 0.9, 0.9, 1);
  text(commas(S._score), W / 2, H * 0.465, 62 * k, 1, 1, 1, 1, 1);
  if (S._score >= S._best && S._score > 0)
    rainbowText('NEW BEST!', W / 2, H * 0.60, 34 * k, 0.8 + 0.2 * sin(T * 6), 1, T * 0.4);
  else text('BEST  ' + commas(S._best), W / 2, H * 0.61, 22 * k, 0.75, 0.7, 0.85, 0.9, 1);
  const p = 0.6 + 0.4 * sin(T * 3.5);
  text('PRESS R TO FLY AGAIN', W / 2, H * 0.78, 28 * k, 1, 0.95, 1, p, 1);
};

const paused = (T) => {
  const k = K();
  rect(0, 0, W, H, 0.1, 0.05, 0.14, 0.42);
  rainbowText('PAUSED', W / 2, H * 0.40, 62 * k, 1, 1, T * 0.15);
  text('ESC TO RESUME    R TO RESTART', W / 2, H * 0.55, 20 * k, 0.9, 0.86, 1, 0.9, 1);
};

export const drawUI = (T, vp, muted) => {
  const m = MODE._v;
  if (m === 1 || m === 2) hud(T, vp);
  if (m === 0) title(T);
  if (m === 2) paused(T);
  if (m === 3) over(T);
  const k = K();
  if (muted) text('MUTED  M', W - 26 * k, H - 30 * k, 14 * k, 0.7, 0.66, 0.8, 0.8, 2);
  flush(Q);
};
