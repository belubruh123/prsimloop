// Everything that populates the island: gloom to free, thunderclouds to dodge,
// and the sparks thrown off when a loop pays out.
import { terrainH, ARENA } from '../world/geometry.js';
import { hypot, rr, rnd, TAU, cos, sin, clamp, floor, sqrt, lerp } from '../engine/math.js';

export const GLM = [];    // gloom: colour-drained prisms, the scoring targets
export const STORM = [];  // thunderclouds: shear the ribbon on contact
export const PART = [];   // particles

/** Throw a burst of sparks. Particles are flat arrays - see the layout below. */
export const burst = (x, y, z, n, spd, r, g, b, life) => {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, e = rr(-0.6, 1.3), s = rr(0.35, 1) * spd;
    //      0  1  2   3 vx           4 vy       5 vz                6 life 7 max  8 9 10 rgb  11 size
    PART.push([x, y, z, cos(a) * s * cos(e), sin(e) * s, sin(a) * s * cos(e),
      rr(life * 0.6, life), rr(life * 0.6, life), r, g, b, rr(0.5, 1.4)]);
  }
};

/**
 * Gloom spawn in tight clusters rather than spread evenly: a cluster is what
 * makes one wide loop worth many times a safe little one.
 */
export const spawnGloom = () => {
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

export const spawnStorm = () => {
  const a = rnd() * TAU, r = sqrt(rnd()) * ARENA * 0.8;
  const x = cos(a) * r, z = sin(a) * r;
  STORM.push({
    _x: x, _z: z, _y: terrainH(x, z) + rr(12, 26),
    _r: rr(5.5, 8), _ph: rnd() * TAU, _dir: rnd() * TAU, _spd: rr(1.5, 3.5),
  });
};

export const clearEntities = () => {
  GLM.length = STORM.length = PART.length = 0;
};

/** Advance every entity. Keeps running while the run is over so sparks settle. */
export const updateEntities = (dt) => {
  for (let i = PART.length - 1; i >= 0; i--) {
    const p = PART[i];
    p[6] -= dt;
    if (p[6] <= 0) { PART[i] = PART[PART.length - 1]; PART.pop(); continue; }
    p[0] += p[3] * dt; p[1] += p[4] * dt; p[2] += p[5] * dt;
    p[4] -= 9 * dt;
    p[3] *= 1 - dt * 1.2; p[5] *= 1 - dt * 1.2;
  }

  for (let i = GLM.length - 1; i >= 0; i--) {
    const g = GLM[i];
    g._ph += dt * 1.6;
    if (g._fade) {
      // converted: swell and vanish
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
};
