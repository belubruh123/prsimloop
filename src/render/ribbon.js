// Turns the trail point list into two strips: the airborne rainbow, and its
// shadow painted on the terrain. The ground strip is the one that actually
// communicates the loop you are drawing, which is why it is drawn wider.
import { ribbon } from '../engine/gl.js';
import { TR } from '../game/trail.js';
import { P } from '../game/player.js';
import { terrainH } from '../world/geometry.js';
import { min, max, hypot, sstep } from '../engine/math.js';
import { US } from './unicorn.js';

// Trail length is bounded by LIFE / STEP; this leaves generous headroom.
const RIBN = 240;

export const AIR = ribbon(RIBN);
export const GROUND = ribbon(RIBN);

/**
 * Rewrite `m`'s vertices from the current trail.
 * `ground` projects the strip onto the terrain instead of following altitude.
 */
const build = (m, ground, width) => {
  const n = min(TR.length, RIBN - 1);
  if (n < 2) { m._segs = 0; return; }
  const total = n + 1;                       // trail points plus the live head
  const d = m._dyn;
  const gx = (i) => (i < n ? TR[i][0] : P._x);
  const gz = (i) => (i < n ? TR[i][2] : P._z);

  for (let i = 0; i < total; i++) {
    const x = gx(i), z = gz(i);
    const y = i < n ? TR[i][1] : P._y;
    // direction from the neighbours, so the strip stays smooth through corners
    let dx = gx(min(total - 1, i + 1)) - gx(max(0, i - 1));
    let dz = gz(min(total - 1, i + 1)) - gz(max(0, i - 1));
    const l = hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const t = i / (total - 1);
    // taper to a point at the horn so the ribbon looks emitted, not cut off
    const w = width * (0.35 + 0.65 * sstep(0, 0.06, 1 - t));
    const ex = -dz * w, ez = dx * w;
    const py = ground ? terrainH(x, z) + 0.85 : y - 0.55 * US;
    let o = i * 16;
    for (const s of [-1, 1]) {
      d[o] = x + ex * s; d[o + 1] = py; d[o + 2] = z + ez * s;
      d[o + 3] = 0; d[o + 4] = 1; d[o + 5] = 0;
      d[o + 6] = t; d[o + 7] = s < 0 ? 0 : 1;   // u along the strip, v across it
      o += 8;
    }
  }
  m._segs = total;
};

export const buildRibbons = () => {
  build(AIR, 0, 1.2);
  build(GROUND, 1, 2.1);
};
