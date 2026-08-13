// The moving cast: gloom to free, thunderclouds to dodge, and sparks.
// Silhouette carries the meaning here - angular means target, round means hazard.
import { push } from '../engine/gl.js';
import { WHITE } from '../engine/atlas.js';
import { GLM, STORM, PART } from '../game/entities.js';
import { MESH } from './meshes.js';
import { TAU, sin, cos, clamp, qid, qaxis } from '../engine/math.js';

const tq = qid();

export const drawGloom = () => {
  for (const g of GLM) {
    const f = g._fade;
    const s = g._sc * (1 - f * 0.7);
    const k = 1 + f * f * 5;                 // flare white as they convert
    const bob = sin(g._ph * 1.3) * 0.7;
    qaxis(tq, 0, 1, 0, g._ph * 0.8);
    push(MESH._cry, g._x, g._y + bob, g._z, s * 2.9, s * 5.6, s * 2.9, tq,
      0.40 * k, 0.37 * k, 0.54 * k, 1, ...WHITE);
    // Trapped light orbiting *outside* the dark body - inside it would simply be
    // hidden, and the motes are what make a gloom legible from a distance.
    const pulse = 1.5 + 0.6 * sin(g._ph * 2.6);
    for (let i = 0; i < 3; i++) {
      const a = g._ph * 1.5 + (i * TAU) / 3;
      push(MESH._sph, g._x + cos(a) * s * 2.5, g._y + bob + sin(a * 1.7) * 1.6, g._z + sin(a) * s * 2.5,
        s * 0.9, s * 0.9, s * 0.9, tq,
        pulse * 1.15 * k, pulse * 1.3 * k, pulse * 1.6 * k, 1, ...WHITE);
    }
  }
};

export const drawStorms = () => {
  for (const c of STORM) {
    // Drawn a little tighter than the collision radius and kept flat, so being
    // caught costs you the ribbon without blinding you.
    const flick = sin(c._ph * 2.3) > 0.97 ? 1.5 : 1;
    const b = (0.32 + sin(c._ph * 3) * 0.03) * flick;
    qaxis(tq, 0, 1, 0, c._ph * 0.15);
    for (let i = 0; i < 5; i++) {
      const a = (i * TAU) / 5 + c._ph * 0.2;
      const top = i === 4;
      const r = top ? 0 : c._r * 0.46;
      push(MESH._sph, c._x + cos(a) * r, c._y + sin(i * 2.1) * 0.9 + (top ? 1.3 : 0), c._z + sin(a) * r,
        c._r * (top ? 1.0 : 0.84), c._r * 0.44, c._r * (top ? 0.92 : 0.76), tq,
        b, b * 0.94, b * 1.3, 1, ...WHITE);
    }
  }
};

export const drawSparks = () => {
  for (const p of PART) {
    const a = clamp(p[6] / p[7], 0, 1);
    const s = p[11] * a;
    qaxis(tq, 0, 1, 0, p[6] * 9);
    push(MESH._cry, p[0], p[1], p[2], s, s * 2.2, s, tq, p[8] * 1.9, p[9] * 1.9, p[10] * 1.9, 1, ...WHITE);
  }
};
