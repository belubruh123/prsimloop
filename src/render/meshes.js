// The shared mesh registry. Every mesh is built procedurally at boot and drawn
// with instancing, so the whole scene is a handful of draw calls.
import { mesh, flush } from '../engine/gl.js';
import * as G from '../world/geometry.js';

const mk = (b, n) => mesh(b.v, b.i, n);

export const MESH = {
  _sph: mk(G.sphere(6, 9), 900),
  _cone: mk(G.cone(7), 200),
  _cyl: mk(G.cyl(0.5, 0.5, 7), 500),
  _quad: mk(G.quad(), 700),
  // hexagonal bipyramid - gloom bodies and sparks
  _cry: mk(G.revolve([[0, 0.5], [0.34, 0.14], [0.3, -0.2], [0, -0.5]], 6), 400),
};

/** The island itself: one static mesh, drawn as a single non-instanced call. */
export const TERRAIN = mk(G.terrain(56), 1);

/** Draw and empty every queued instance batch. */
export const flushAll = () => { for (const k in MESH) flush(MESH[k]); };
