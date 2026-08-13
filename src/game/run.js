// Run orchestration: start a run, then each frame tick the clock, ramp the
// difficulty, and drive the entity and trail updates in the right order.
import { S, resetState, endRun, decay, COMBO_WINDOW } from './state.js';
import { GLM, STORM, clearEntities, updateEntities, spawnGloom, spawnStorm } from './entities.js';
import { TR, clearTrail, updateTrail } from './trail.js';
import { P } from './player.js';
import { seed, min } from '../engine/math.js';

export const resetGame = () => {
  clearTrail();
  clearEntities();
  resetState();
  P._x = 0; P._y = 22; P._z = 62; P._yaw = 0; P._pitch = 0; P._roll = 0;
  // The island layout is fixed (seeded at module load); only the run varies.
  seed(20260813 + ((Math.random() * 1e6) | 0));
  for (let i = 0; i < 7; i++) spawnGloom();
  for (let i = 0; i < 3; i++) spawnStorm();
};

export const updateGame = (dt) => {
  decay(dt);
  updateEntities(dt);
  if (!S._run) return;

  S._elapsed += dt;
  S._last += dt;
  S._time -= dt;
  if (S._last > COMBO_WINDOW) S._combo = 1;
  if (S._time <= 0) { S._time = 0; endRun(); return; }

  // Difficulty ramp: more to catch, and more in the way, the longer you survive.
  if (GLM.length < min(26, 7 + S._elapsed * 0.22)) spawnGloom();
  if (STORM.length < min(6, 2 + S._elapsed * 0.03)) spawnStorm();

  updateTrail(dt);
};
