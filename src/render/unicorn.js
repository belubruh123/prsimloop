// The player model: primitives assembled in the unicorn's local frame, which
// faces -Z (the same direction as flight forward).
import { push } from '../engine/gl.js';
import { WHITE } from '../engine/atlas.js';
import { P } from '../game/player.js';
import { MESH } from './meshes.js';
import { sin, lerp, clamp, floor, qid, qaxis, qmul, qvec } from '../engine/math.js';

// Authored at a comfortable scale then shrunk, so the unicorn sits small enough
// in frame to keep the ground - and the trail you are drawing on it - readable.
export const US = 0.6;

// `pq` is scratch owned by part(); `lq` holds a part's local rotation. They must
// stay separate - part() overwrites its own scratch with the combined rotation.
const tq = qid(), bodyQ = qid(), pq = qid(), lq = qid();
const tv = new Float32Array(3);

/** Rainbow ramp, 0..1 -> [r,g,b]. Used for the mane and tail. */
const RAMP = [[1, .42, .55], [1, .68, .42], [1, .92, .5], [.55, .92, .6],
[.45, .8, 1], [.62, .55, .98], [.9, .55, .95], [1, .42, .55]];
export const hue = (f) => {
  const a = clamp(f, 0, 1) * 6;
  const i = floor(a), k = a - i;
  const c0 = RAMP[i], c1 = RAMP[i + 1];
  return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
};

/** Push one body part positioned in the unicorn's local frame. */
const part = (m, q, ox, oy, oz, sx, sy, sz, lq, r, g, b) => {
  qvec(tv, q, ox * US, oy * US, oz * US);
  push(m, P._x + tv[0], P._y + tv[1], P._z + tv[2], sx * US, sy * US, sz * US,
    lq ? qmul(pq, q, lq) : q, r, g, b, 1, ...WHITE);
};

export const drawUnicorn = () => {
  // body frame = flight orientation with the visual roll applied
  const q = qmul(bodyQ, P._q, qaxis(tq, 0, 0, 1, P._roll));
  const t = P._t;
  const C = [1, 0.99, 1];   // coat

  // torso + rump
  part(MESH._sph, q, 0, 0, 0.2, 2.4, 2.0, 3.5, 0, C[0], C[1], C[2]);
  part(MESH._sph, q, 0, 0.15, 1.5, 2.1, 1.9, 1.9, 0, C[0], C[1], C[2]);
  // neck, leaning up and forward
  part(MESH._cyl, q, 0, 1.15, -1.35, 1.15, 2.1, 1.15, qaxis(lq, 1, 0, 0, -0.5), C[0], C[1], C[2]);
  // head + muzzle
  part(MESH._sph, q, 0, 2.15, -2.45, 1.3, 1.25, 1.95, 0, C[0], C[1], C[2]);
  part(MESH._sph, q, 0, 1.8, -3.35, 0.85, 0.78, 1.0, 0, 1, 0.93, 0.95);
  // horn, tilted forward
  part(MESH._cone, q, 0, 3.15, -2.75, 0.46, 1.9, 0.46, qaxis(lq, 1, 0, 0, -0.32), 1, 0.88, 0.45);
  for (const s of [-1, 1]) {
    part(MESH._cone, q, s * 0.6, 2.9, -1.85, 0.4, 0.72, 0.4, 0, C[0], C[1], C[2]);       // ears
    part(MESH._sph, q, s * 0.95, 2.3, -3.0, 0.26, 0.32, 0.26, 0, 0.16, 0.11, 0.2);       // eyes
    part(MESH._sph, q, s * 0.32, 1.72, -4.05, 0.16, 0.16, 0.16, 0, 0.85, 0.6, 0.68);     // nostrils
  }

  // rainbow mane, crest of the neck down to the withers
  for (let i = 0; i < 8; i++) {
    const f = i / 7, c = hue(f * 0.85);
    part(MESH._sph, q, sin(t * 4 - i * 0.7) * 0.24, lerp(2.95, 1.15, f), lerp(-2.15, 0.35, f),
      0.8, 0.66, 0.78, 0, c[0], c[1], c[2]);
  }
  // rainbow tail streaming behind
  for (let i = 0; i < 7; i++) {
    const f = i / 6, c = hue(f * 0.85);
    part(MESH._sph, q, sin(t * 5 - i * 0.9) * 0.55 * f,
      0.95 - f * 0.35 + sin(t * 3 - i) * 0.12 * f, 2.5 + f * 2.2,
      0.95 - f * 0.35, 0.78 - f * 0.2, 0.9, 0, c[0], c[1], c[2]);
  }
  // legs, galloping in mid-air
  let li = 0;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const ph = t * 7 + li++ * 1.7;
      qaxis(lq, 1, 0, 0, sin(ph) * 0.55 - 0.1);
      const hoofY = qvec(tv, lq, 0, -1.0, 0)[1], hoofZ = tv[2];
      part(MESH._cyl, q, sx * 1.15, -1.55, sz * 1.35, 0.5, 2.0, 0.5, lq, C[0], C[1], C[2]);
      part(MESH._sph, q, sx * 1.15, -1.55 + hoofY, sz * 1.35 + hoofZ, 0.58, 0.5, 0.66, 0, 1, 0.87, 0.5);
    }
};
