// The mechanic. The rainbow trail is tested for self-intersection on the XZ
// (ground) plane, so what closes a loop is the trail's shadow, not its height -
// which is why altitude stays free for dodging.
import { P } from './player.js';
import { S, award, fireLoop } from './state.js';
import { GLM, STORM, burst } from './entities.js';
import { hypot, abs, floor } from '../engine/math.js';

export const TR = [];   // trail points: [x, y, z, age]

export const LIFE = 4.6;      // seconds a trail point survives
const STEP = 1.15;            // world units between appended points
const MINAREA = 170;          // reject micro-loops

export const clearTrail = () => (TR.length = 0);

// --- geometry -----------------------------------------------------------------
const hit = [0, 0];

/** Segment a-b against segment c-d in XZ. Writes the crossing into `hit`. */
const segHit = (ax, az, bx, bz, cx, cz, dx, dz) => {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (abs(den) < 1e-9) return 0;
  const qx = cx - ax, qz = cz - az;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return 0;
  hit[0] = ax + rx * t;
  hit[1] = az + rz * t;
  return 1;
};

/** Ray-crossing point-in-polygon. `p` is a flat [x,z, x,z, ...] ring. */
const inPoly = (p, x, z) => {
  let c = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > z) !== (p[j + 1] > z) &&
      x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c ^= 1;
  }
  return c;
};

/**
 * The trail crossed itself at `hx,hz` on segment `i`. Everything the resulting
 * ring encloses is freed. The ribbon is spent either way, so carelessly cutting
 * across your own trail costs you the arc you were building.
 */
const closeLoop = (i, hx, hz) => {
  const poly = [hx, hz];
  for (let k = i + 1; k < TR.length; k++) poly.push(TR[k][0], TR[k][2]);
  if (poly.length < 8) return;

  let area = 0;
  for (let a = 0, b = poly.length - 2; a < poly.length; b = a, a += 2)
    area += (poly[b] - poly[a]) * (poly[b + 1] + poly[a + 1]);
  if (abs(area / 2) < MINAREA) return;

  const got = [];
  for (const g of GLM) if (!g._fade && inPoly(poly, g._x, g._z)) got.push(g);

  TR.length = 0;

  if (!got.length) { S._flash = 0.35; fireLoop(0, 0, 0, 0, 0); return; }

  const n = got.length;
  const gain = award(n);

  let cx = 0, cy = 0, cz = 0;
  const at = [];
  for (const g of got) {
    g._fade = 1e-4;
    cx += g._x; cy += g._y; cz += g._z;
    at.push(g._x, g._z);
    burst(g._x, g._y, g._z, 14, 11, 1, 1, 1, 0.9);
  }
  S._pop = { _n: n, _m: S._combo, _g: gain, _x: cx / n, _y: cy / n, _z: cz / n, _l: 1.5 };
  fireLoop(n, S._combo, cx / n, cy / n, cz / n, at);
};

// --- per-frame ----------------------------------------------------------------
export const updateTrail = (dt) => {
  for (const p of TR) p[3] += dt;
  while (TR.length && TR[0][3] > LIFE) TR.shift();

  // Thunderclouds shear the ribbon back to its newest third - enough to kill the
  // loop you were drawing without erasing all your momentum.
  for (const c of STORM) {
    if (hypot(P._x - c._x, (P._y - c._y) * 0.75, P._z - c._z) < c._r) {
      if (TR.length > 6) {
        if (!S._sever) burst(P._x, P._y, P._z, 10, 7, 0.45, 0.42, 0.5, 0.7);
        S._sever = 1;
        TR.splice(0, floor(TR.length * 0.66));
      }
      break;
    }
  }

  const n = TR.length;
  if (n >= 4) {
    // Test from the last placed point to where the player is *right now*, so
    // closure lands on the frame you cross rather than the next placed point.
    const a = TR[n - 1];
    for (let i = 0; i < n - 3; i++) {
      if (segHit(a[0], a[2], P._x, P._z, TR[i][0], TR[i][2], TR[i + 1][0], TR[i + 1][2])) {
        closeLoop(i, hit[0], hit[1]);
        break;
      }
    }
  }

  // Points are placed by distance, not by time, so the ribbon stays evenly
  // tessellated whatever the frame rate or speed.
  const l = TR[TR.length - 1];
  if (!l || hypot(P._x - l[0], P._y - l[1], P._z - l[2]) > STEP) TR.push([P._x, P._y, P._z, 0]);
};
