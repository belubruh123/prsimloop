// Static dressing for the island: trees, flower clumps and drifting clouds.
// Placement is seeded once at boot so the island is the same every run.
import { push } from '../engine/gl.js';
import { WHITE } from '../engine/atlas.js';
import { terrainH, ARENA } from '../world/geometry.js';
import { MESH } from './meshes.js';
import { TAU, sin, cos, rnd, seed, rr, floor, qid, qaxis } from '../engine/math.js';

const tq = qid();

/** Pastel tints shared by tree canopies and flower petals. */
const TINTS = [[0.55, 0.85, 0.62], [0.98, 0.78, 0.88], [0.72, 0.88, 0.98], [0.95, 0.88, 0.62]];

// [x, y, z, scale, kind (0 tree / 1 flowers), rotation, tint index]
const PROPS = [];
// [x, y, z, size, _, rotation]
const CLOUDS = [];

seed(20260813);
for (let i = 0; i < 260; i++) {
  const a = rnd() * TAU, r = Math.sqrt(rnd()) * ARENA * 0.95;
  const x = cos(a) * r, z = sin(a) * r;
  const y = terrainH(x, z);
  if (y < -6) continue;                       // skip the cliffs falling into cloud
  PROPS.push([x, y, z, rr(0.75, 1.5), rnd() < 0.62 ? 0 : 1, rnd() * TAU, floor(rnd() * 4)]);
}
// Clouds inside the arena sit above the flight ceiling (74) so the player can
// never fly into one and lose the whole view; only distant ones hang low.
for (let i = 0; i < 44; i++) {
  const a = rnd() * TAU, r = Math.sqrt(rnd()) * ARENA * 1.3;
  CLOUDS.push([cos(a) * r, r > ARENA ? rr(34, 96) : rr(86, 118), sin(a) * r,
    rr(6, 14), rr(0.2, 0.8), rr(0, TAU)]);
}

export const drawProps = () => {
  for (const [x, y, z, s, kind, rot, ti] of PROPS) {
    qaxis(tq, 0, 1, 0, rot);
    const c = TINTS[ti];
    if (kind === 0) {
      push(MESH._cyl, x, y + s * 1.4, z, s * 0.7, s * 3, s * 0.7, tq, 0.72, 0.56, 0.5, 1, ...WHITE);
      push(MESH._sph, x, y + s * 4.2, z, s * 3.4, s * 3.6, s * 3.4, tq, c[0], c[1], c[2], 1, ...WHITE);
      push(MESH._sph, x, y + s * 5.8, z, s * 2.2, s * 2.3, s * 2.2, tq, c[0], c[1], c[2], 1, ...WHITE);
    } else {
      // flower clump - round and soft, so the angular gloom stay unmistakable
      const c2 = TINTS[(ti + 2) & 3];
      push(MESH._sph, x, y + s * 0.45, z, s * 2.3, s * 1.4, s * 2.2, tq, 0.6, 0.84, 0.66, 1, ...WHITE);
      for (let k = 0; k < 3; k++) {
        const a = rot + k * 2.094;
        push(MESH._sph, x + cos(a) * s * 1.15, y + s * (1.25 + 0.3 * k), z + sin(a) * s * 1.15,
          s * 1.05, s * 0.8, s * 1.05, tq, c2[0] * 1.12, c2[1] * 1.12, c2[2] * 1.12, 1, ...WHITE);
      }
    }
  }
};

export const drawClouds = (T) => {
  for (const [x, y, z, s, , rot] of CLOUDS) {
    qaxis(tq, 0, 1, 0, rot + T * 0.02);
    const dr = sin(T * 0.3 + x) * 1.5;
    // tints above 1 push the clouds bright without needing a separate pass
    push(MESH._sph, x, y + dr, z, s, s * 0.6, s * 0.8, tq, 1.4, 1.36, 1.42, 1, ...WHITE);
    push(MESH._sph, x + s * 0.5, y + dr - s * 0.1, z + s * 0.2, s * 0.7, s * 0.5, s * 0.6, tq, 1.4, 1.33, 1.4, 1, ...WHITE);
    push(MESH._sph, x - s * 0.55, y + dr - s * 0.12, z - s * 0.15, s * 0.66, s * 0.46, s * 0.6, tq, 1.38, 1.32, 1.4, 1, ...WHITE);
  }
};
