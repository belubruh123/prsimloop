// Drawing primitives for the canvas UI. Everything is a textured quad pushed
// into an orthographic pass - there is no HTML UI anywhere in this game.
import { W, H, push, flush } from '../engine/gl.js';
import { charUV, WHITE } from '../engine/atlas.js';
import { min, max, floor } from '../engine/math.js';

let Q;   // the quad mesh, supplied by main at boot
export const setQuad = (m) => (Q = m);
/** Draw everything queued this frame. */
export const flushUI = () => flush(Q);

/** UI scale factor, so layout holds at any resolution or device pixel ratio. */
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

/** Cosine-palette rainbow, matching the ribbon shader's `rbw()`. */
export const rainbow = (t) => [
  0.62 + 0.38 * Math.cos(6.2832 * t),
  0.62 + 0.38 * Math.cos(6.2832 * (t + 0.33)),
  0.62 + 0.38 * Math.cos(6.2832 * (t + 0.67)),
];

/** Rainbow-per-letter text, for the title and the big callouts. */
export const rainbowText = (s, x, y, size, a, align, phase) => {
  const adv = size * 0.7;
  const w = s.length * adv;
  let px = x - (align === 1 ? w / 2 : align === 2 ? w : 0);
  for (let i = 0; i < s.length; i++) {
    const uv = charUV(s[i]);
    const c = rainbow(i / max(1, s.length - 1) + phase);
    if (uv) push(Q, px + adv / 2, y + size / 2, 0, size, size, 1, 0,
      c[0] * 1.4, c[1] * 1.4, c[2] * 1.4, a, ...fv(uv));
    px += adv;
  }
  return w;
};

export const commas = (n) => {
  const s = '' + floor(n);
  let o = '';
  for (let i = 0; i < s.length; i++) o += ((s.length - i) % 3 || i === 0 ? '' : ',') + s[i];
  return o;
};

/** Project a world point to pixel coordinates, or 0 if it is behind the camera. */
export const project = (vp, x, y, z) => {
  const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (w <= 0.01) return 0;
  const sx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w;
  const sy = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
  return [(sx * 0.5 + 0.5) * W, (0.5 - sy * 0.5) * H];
};
