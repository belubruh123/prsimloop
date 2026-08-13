// Procedural geometry. Everything is flat-shaded for the chunky low-poly look;
// `tri()` computes the face normal so no builder has to think about normals.
import { TAU, sin, cos, fbm, smooth, clamp, hypot, sqrt, PI, max } from './math.js';

export const ARENA = 96;

// --- builder ------------------------------------------------------------------
export const B = () => ({ v: [], i: [], n: 0 });

/** Emit a flat-shaded triangle from three [x,y,z,u,v] corners. */
export const tri = (b, a, c, d) => {
  const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  for (const p of [a, c, d]) b.v.push(p[0], p[1], p[2], nx, ny, nz, p[3], p[4]);
  b.i.push(b.n, b.n + 1, b.n + 2);
  b.n += 3;
};

export const quadFace = (b, a, c, d, e) => { tri(b, a, c, d); tri(b, a, d, e); };

// --- primitives ---------------------------------------------------------------
/**
 * Surface of revolution around Y. `prof` is a list of [radius, y] pairs.
 * Caps are added automatically wherever an end has non-zero radius.
 */
export const revolve = (prof, segs) => {
  const b = B();
  const pt = (r, y, a, u, v) => [cos(a) * r, y, sin(a) * r, u, v];
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    const v0 = i / (prof.length - 1), v1 = (i + 1) / (prof.length - 1);
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU, a1 = ((s + 1) / segs) * TAU;
      const u0 = s / segs, u1 = (s + 1) / segs;
      const A = pt(r0, y0, a0, u0, v0), C = pt(r0, y0, a1, u1, v0);
      const D = pt(r1, y1, a1, u1, v1), E = pt(r1, y1, a0, u0, v1);
      if (r0 < 1e-4) tri(b, A, D, E);
      else if (r1 < 1e-4) tri(b, A, C, D);
      else quadFace(b, A, C, D, E);
    }
  }
  for (const [idx, dir] of [[0, -1], [prof.length - 1, 1]]) {
    const [r, y] = prof[idx];
    if (r < 1e-4) continue;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU, a1 = ((s + 1) / segs) * TAU;
      const A = [0, y, 0, 0.5, 0.5];
      const C = pt(r, y, a0, cos(a0) * 0.5 + 0.5, sin(a0) * 0.5 + 0.5);
      const D = pt(r, y, a1, cos(a1) * 0.5 + 0.5, sin(a1) * 0.5 + 0.5);
      dir > 0 ? tri(b, A, C, D) : tri(b, A, D, C);
    }
  }
  return b;
};

export const sphere = (rings = 7, segs = 10) => {
  const prof = [];
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * PI;
    prof.push([sin(a) * 0.5, -cos(a) * 0.5]);
  }
  return revolve(prof, segs);
};

export const cone = (segs = 8) => revolve([[0, 0.5], [0.5, -0.5]], segs);
export const cyl = (r0 = 0.5, r1 = 0.5, segs = 8) => revolve([[r0, 0.5], [r1, -0.5]], segs);

/** Unit quad in the XY plane, for billboards and UI. */
export const quad = () => {
  const b = B();
  quadFace(b, [-0.5, -0.5, 0, 0, 1], [0.5, -0.5, 0, 1, 1], [0.5, 0.5, 0, 1, 0], [-0.5, 0.5, 0, 0, 0]);
  return b;
};

// --- terrain ------------------------------------------------------------------
/**
 * Floating sky island: rolling interior, a raised rim, then a cliff that falls
 * away into the cloud sea so the arena reads as an island rather than a plane.
 */
export const terrainH = (x, z) => {
  const r = hypot(x, z) / ARENA;
  const edge = smooth(clamp((1.06 - r) / 0.26, 0, 1));
  const hills = (fbm(x * 0.014 + 9, z * 0.014 + 4, 4) - 0.45) * 17;
  const rim = smooth(clamp((r - 0.5) / 0.42, 0, 1)) * 7;
  const bump = (fbm(x * 0.06, z * 0.06, 2) - 0.5) * 2.2;
  return (hills + rim + bump) * edge - (1 - edge) * 55;
};

export const terrain = (n = 56) => {
  const b = B();
  const S = ARENA * 1.22;
  const p = (i, j) => {
    const x = (i / n - 0.5) * 2 * S, z = (j / n - 0.5) * 2 * S;
    // uv is world position remapped to 0..1 - doubles as the paint-map lookup
    return [x, terrainH(x, z), z, i / n, j / n];
  };
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) quadFace(b, p(i, j), p(i, j + 1), p(i + 1, j + 1), p(i + 1, j));
  return b;
};
