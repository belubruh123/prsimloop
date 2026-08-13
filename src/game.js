// The mechanic: your rainbow trail is checked for self-intersection on the XZ
// (ground) plane. Close a loop and everything inside it bursts back into colour.
import { terrainH, ARENA } from './mesh.js';
import { P } from './player.js';
import {
  hypot, rr, rnd, seed, TAU, PI, cos, sin, min, max, abs, clamp, floor, sqrt, lerp,
} from './math.js';

export const TR = [];    // trail points: [x, y, z, age]
export const GLM = [];   // gloom wisps
export const PART = [];  // particles
export const STORM = []; // thunderclouds that sever the trail

export const S = {
  _score: 0, _combo: 1, _time: 90, _best: 0,
  _flash: 0,       // ribbon whiteout on a successful loop
  _shake: 0,
  _slow: 0,        // time-slow remaining
  _over: 0, _run: 0, _elapsed: 0,
  _last: 0,        // seconds since the last loop (drives combo decay)
  _pop: null,      // {n, mult, gain, x, y, z, life} - feeds the floating score text
  _sever: 0,
};

const LIFE = 4.6;      // seconds a trail point survives
const STEP = 1.15;     // world units between appended points
const MINAREA = 170;   // reject micro-loops
const COMBO_WINDOW = 8;

// --- helpers ------------------------------------------------------------------
const hit = [0, 0];
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

const inPoly = (p, x, z) => {
  let c = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > z) !== (p[j + 1] > z) &&
      x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c ^= 1;
  }
  return c;
};

export const burst = (x, y, z, n, spd, r, g, b, life) => {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, e = rr(-0.6, 1.3), s = rr(0.35, 1) * spd;
    PART.push([x, y, z, cos(a) * s * cos(e), sin(e) * s, sin(a) * s * cos(e),
      rr(life * 0.6, life), rr(life * 0.6, life), r, g, b, rr(0.5, 1.4)]);
  }
};

// --- gloom --------------------------------------------------------------------
const spawnGloom = () => {
  // cluster spawns: loops around a tight group are the big scoring plays
  const a = rnd() * TAU, r = sqrt(rnd()) * ARENA * 0.78;
  const cx = cos(a) * r, cz = sin(a) * r;
  const n = 1 + floor(rnd() * 3.4);
  for (let i = 0; i < n; i++) {
    const b = rnd() * TAU, d = rr(3, 15);
    const x = clamp(cx + cos(b) * d, -ARENA * 0.9, ARENA * 0.9);
    const z = clamp(cz + sin(b) * d, -ARENA * 0.9, ARENA * 0.9);
    GLM.push({
      _x: x, _z: z, _y: terrainH(x, z) + rr(7, 20),
      _ph: rnd() * TAU, _sc: rr(0.85, 1.35), _drift: rnd() * TAU, _fade: 0,
    });
  }
};

const spawnStorm = () => {
  const a = rnd() * TAU, r = sqrt(rnd()) * ARENA * 0.8;
  const x = cos(a) * r, z = sin(a) * r;
  STORM.push({
    _x: x, _z: z, _y: terrainH(x, z) + rr(12, 26),
    _r: rr(5.5, 8), _ph: rnd() * TAU, _dir: rnd() * TAU, _spd: rr(1.5, 3.5),
  });
};

// --- run control --------------------------------------------------------------
export const resetGame = () => {
  TR.length = GLM.length = PART.length = STORM.length = 0;
  S._score = 0; S._combo = 1; S._time = 90; S._over = 0; S._run = 1;
  S._elapsed = 0; S._last = 0; S._flash = 0; S._shake = 0; S._slow = 0; S._pop = null;
  P._x = 0; P._y = 22; P._z = 62; P._yaw = 0; P._pitch = 0; P._roll = 0;
  seed(20260813 + ((Math.random() * 1e6) | 0));
  for (let i = 0; i < 7; i++) spawnGloom();
  for (let i = 0; i < 3; i++) spawnStorm();
  try { S._best = +localStorage.pl26 || 0; } catch (e) { }
};

let onEnd = () => { };
export const setEndCb = (f) => (onEnd = f);

const endRun = () => {
  S._over = 1; S._run = 0;
  onEnd();
  if (S._score > S._best) {
    S._best = S._score;
    try { localStorage.pl26 = S._score; } catch (e) { }
  }
};

// --- the loop closure ---------------------------------------------------------
let onLoop = () => { };
export const setLoopCb = (f) => (onLoop = f);

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

  TR.length = 0;   // the ribbon is spent either way - crossing yourself costs

  if (!got.length) { S._flash = 0.35; onLoop(0, 0, 0, 0, 0); return; }

  // superlinear: n=1 -> 100, 2 -> 300, 3 -> 600, 4 -> 1000 ...
  const n = got.length;
  const base = ((n * (n + 1)) / 2) * 100;
  const gain = base * S._combo;
  S._score += gain;
  S._time = min(120, S._time + 1.5 * n);
  S._combo = min(9, S._combo + (S._last < COMBO_WINDOW ? 1 : 0));
  S._last = 0;
  S._flash = 1;
  S._shake = min(1, 0.35 + n * 0.16);
  S._slow = 0.16;

  let cx = 0, cy = 0, cz = 0;
  const at = [];
  for (const g of got) {
    g._fade = 1e-4;
    cx += g._x; cy += g._y; cz += g._z;
    at.push(g._x, g._z);
    burst(g._x, g._y, g._z, 14, 11, 1, 1, 1, 0.9);
  }
  S._pop = { _n: n, _m: S._combo, _g: gain, _x: cx / n, _y: cy / n, _z: cz / n, _l: 1.5 };
  onLoop(n, S._combo, cx / n, cy / n, cz / n, at);
};

// --- per-frame ----------------------------------------------------------------
export const updateGame = (dt) => {
  S._flash = max(0, S._flash - dt * 3.2);
  S._shake = max(0, S._shake - dt * 2.6);
  S._slow = max(0, S._slow - dt);
  S._sever = max(0, S._sever - dt * 2.5);
  if (S._pop && (S._pop._l -= dt) <= 0) S._pop = null;

  // particles
  for (let i = PART.length - 1; i >= 0; i--) {
    const p = PART[i];
    p[6] -= dt;
    if (p[6] <= 0) { PART[i] = PART[PART.length - 1]; PART.pop(); continue; }
    p[0] += p[3] * dt; p[1] += p[4] * dt; p[2] += p[5] * dt;
    p[4] -= 9 * dt;
    p[3] *= 1 - dt * 1.2; p[5] *= 1 - dt * 1.2;
  }

  // gloom fade-out once converted
  for (let i = GLM.length - 1; i >= 0; i--) {
    const g = GLM[i];
    g._ph += dt * 1.6;
    if (g._fade) {
      g._fade += dt * 3.2;
      if (g._fade > 1) { GLM[i] = GLM[GLM.length - 1]; GLM.pop(); }
      continue;
    }
    g._drift += dt * 0.25;
    g._x += cos(g._drift) * 1.7 * dt;
    g._z += sin(g._drift * 0.7) * 1.7 * dt;
    g._y = lerp(g._y, terrainH(g._x, g._z) + 12, dt * 0.5);
  }

  for (const c of STORM) {
    c._ph += dt;
    c._x += cos(c._dir) * c._spd * dt;
    c._z += sin(c._dir) * c._spd * dt;
    // wander wide when turned back, otherwise they all pile into the middle
    if (hypot(c._x, c._z) > ARENA * 0.85) c._dir = Math.atan2(-c._z, -c._x) + rr(-1.3, 1.3);
    else c._dir += rr(-0.5, 0.5) * dt;
    c._y = lerp(c._y, terrainH(c._x, c._z) + 16, dt * 0.4);
  }

  if (!S._run) return;

  S._elapsed += dt;
  S._last += dt;
  S._time -= dt;
  if (S._last > COMBO_WINDOW) S._combo = 1;
  if (S._time <= 0) { S._time = 0; endRun(); return; }

  // difficulty ramp
  const wantG = min(26, 7 + S._elapsed * 0.22);
  if (GLM.length < wantG) spawnGloom();
  const wantS = min(6, 2 + S._elapsed * 0.03);
  if (STORM.length < wantS) spawnStorm();

  // --- trail ---
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
    const a = TR[n - 1];
    // test the live head segment so closure lands the instant you cross
    for (let i = 0; i < n - 3; i++) {
      if (segHit(a[0], a[2], P._x, P._z, TR[i][0], TR[i][2], TR[i + 1][0], TR[i + 1][2])) {
        closeLoop(i, hit[0], hit[1]);
        break;
      }
    }
  }

  const l = TR[TR.length - 1];
  if (!l || hypot(P._x - l[0], P._y - l[1], P._z - l[2]) > STEP) TR.push([P._x, P._y, P._z, 0]);
};
