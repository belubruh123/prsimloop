// Flight model + input. Steering is a virtual stick rather than FPS-style look,
// because closing loops means holding a sustained turn - the single most
// important feel decision in the game.
import {
  PI, TAU, sin, cos, clamp, damp, lerp, min, max, abs, qaxis, qmul, qid, qvec, hypot,
} from '../engine/math.js';
import { terrainH, ARENA } from '../world/geometry.js';
import { C } from '../engine/gl.js';

export const P = {
  _x: 0, _y: 20, _z: 62,
  _yaw: 0, _pitch: 0, _roll: 0,
  _spd: 30,
  _bank: 0,        // 0..1 how hard we're banking
  _q: qid(),
  _fwd: new Float32Array(3),
  _t: 0,
};

const K = {};
export const key = (c) => !!K[c];

let stickX = 0, stickY = 0;   // virtual stick, -1..1
let mx = 0, my = 0;           // mouse deltas accumulated this frame
export let locked = 0;
export let boosting = 0;

const SENS = 0.0042;

export const initInput = (onFirstClick) => {
  addEventListener('keydown', (e) => {
    K[e.code] = 1;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => (K[e.code] = 0));
  addEventListener('blur', () => { for (const k in K) K[k] = 0; });
  addEventListener('mousemove', (e) => {
    if (!locked) return;
    mx += e.movementX;
    my += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => (locked = document.pointerLockElement === C ? 1 : 0));
  C.addEventListener('click', () => {
    onFirstClick();
    if (!locked) C.requestPointerLock();
  });
};

export const unlock = () => document.exitPointerLock && document.exitPointerLock();

/** Read input into the virtual stick. Self-centres slowly so turns can be held. */
const readStick = (dt) => {
  if (locked) {
    stickX = clamp(stickX + mx * SENS, -1, 1);
    stickY = clamp(stickY + my * SENS, -1, 1);
    // gentle self-centring: enough to recover, slow enough to hold a circle
    stickX = damp(stickX, 0, 1.1, dt);
    stickY = damp(stickY, 0, 2.2, dt);
  }
  mx = my = 0;
  let kx = (key('KeyD') || key('ArrowRight') ? 1 : 0) - (key('KeyA') || key('ArrowLeft') ? 1 : 0);
  let ky = (key('KeyS') || key('ArrowDown') ? 1 : 0) - (key('KeyW') || key('ArrowUp') ? 1 : 0);
  if (kx) stickX = damp(stickX, kx, 9, dt);
  if (ky) stickY = damp(stickY, ky, 9, dt);
  if (!kx && !locked) stickX = damp(stickX, 0, 6, dt);
  if (!ky && !locked) stickY = damp(stickY, 0, 6, dt);
};

const tq = qid(), tq2 = qid();

export const updatePlayer = (dt) => {
  readStick(dt);
  P._t += dt;

  const wantBank = key('Space') || key('ShiftLeft') || key('ShiftRight') ? 1 : 0;
  P._bank = damp(P._bank, wantBank, 7, dt);
  boosting = P._bank;

  // Hard bank buys a much tighter turn radius - the core skill resource.
  const turn = lerp(1.7, 4.0, P._bank);
  P._yaw -= stickX * turn * dt;
  P._pitch = clamp(P._pitch - stickY * 1.5 * dt, -1.05, 1.05);
  // auto-level pitch so players never get stuck nose-down
  P._pitch = damp(P._pitch, 0, 0.9, dt);

  P._spd = damp(P._spd, lerp(30, 40, P._bank), 3, dt);

  // visual roll leans into the turn, plus a little extra while banking
  const wantRoll = clamp(-stickX * (0.85 + P._bank * 0.55), -1.35, 1.35);
  P._roll = damp(P._roll, wantRoll, 6, dt);

  // orientation: yaw * pitch (roll is visual only, applied when drawing)
  qmul(P._q, qaxis(tq, 0, 1, 0, P._yaw), qaxis(tq2, 1, 0, 0, P._pitch));
  qvec(P._fwd, P._q, 0, 0, -1);

  P._x += P._fwd[0] * P._spd * dt;
  P._y += P._fwd[1] * P._spd * dt;
  P._z += P._fwd[2] * P._spd * dt;

  // --- soft bounds: nudge, never wall ---
  // Staying well clear of the ground keeps the airborne ribbon visually separate
  // from its ground shadow, which is what makes the loop readable.
  const gh = terrainH(P._x, P._z) + 15;
  if (P._y < gh) {
    P._y = lerp(P._y, gh, min(1, dt * 6));
    P._pitch = damp(P._pitch, 0.45, 5, dt);
  }
  if (P._y > 74) P._pitch = damp(P._pitch, -0.45, 4, dt);

  const r = hypot(P._x, P._z);
  if (r > ARENA * 0.94) {
    // steer back toward the middle proportionally to how far out we are
    const inward = Math.atan2(-P._x, -P._z);
    const over = min(1, (r - ARENA * 0.94) / 22);
    let d = ((inward - P._yaw) % TAU + TAU + PI) % TAU - PI;
    P._yaw += d * min(1, dt * 2.2 * over);
  }
  return r;
};

export const edgeWarn = () => clamp((hypot(P._x, P._z) - ARENA * 0.8) / (ARENA * 0.22), 0, 1);
