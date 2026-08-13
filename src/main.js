import { C, G, W, H, resize, program, mesh, push, flush, ribbon, drawRibbon } from './gl.js';
import { VS_MAIN, FS_MAIN, VS_SKY, FS_SKY, VS_TERR, FS_TERR, VS_RIB, FS_RIB } from './shaders.js';
import { TR, GLM, PART, STORM, S, updateGame, resetGame, setLoopCb, setEndCb } from './game.js';
import * as MB from './mesh.js';
import { terrainH, ARENA } from './mesh.js';
import { makeAtlas, finishAtlas, makeTile, WHITE } from './atlas.js';
import { initPaint, clearPaint, stamp, paintTex, EXT, peekPaint } from './paint.js';
import {
  PI, TAU, sin, cos, clamp, lerp, damp, angDamp, min, max, abs, rnd, seed, rr, floor, hypot,
  qid, qaxis, qmul, qvec, mPerspective, mView, mMul, mOrtho,
} from './math.js';
import { P, initInput, updatePlayer, boosting, unlock, locked } from './player.js';
import { MODE, drawUI, setQuad } from './ui.js';
import {
  initAudio, toggleMute, muted, setIntensity, audioState, sfxLoop, sfxWhiff, sfxSever, sfxUI, sfxStart, sfxOver,
} from './audio.js';

// --- boot ---------------------------------------------------------------------
resize();
addEventListener('resize', resize);

const pMain = program(VS_MAIN, FS_MAIN);
const pSky = program(VS_SKY, FS_SKY);
const pTerr = program(VS_TERR, FS_TERR);
const pRib = program(VS_RIB, FS_RIB);

const RIBN = 240;
const ribAir = ribbon(RIBN);
const ribGnd = ribbon(RIBN);

const mk = (b, n) => mesh(b.v, b.i, n);
const MESH = {
  _sph: mk(MB.sphere(6, 9), 900),
  _cone: mk(MB.cone(7), 200),
  _cyl: mk(MB.cyl(0.5, 0.5, 7), 500),
  _quad: mk(MB.quad(), 700),
  // hexagonal bipyramid - the prism crystals scattered over the island
  _cry: mk(MB.revolve([[0, 0.5], [0.34, 0.14], [0.3, -0.2], [0, -0.5]], 6), 400),
};
const flushAll = () => { for (const k in MESH) flush(MESH[k]); };
const mTerr = mk(MB.terrain(56), 1);

const atlasCtx = makeAtlas();
const texAtlas = finishAtlas(atlasCtx);
const texTile = makeTile();
initPaint();

const vpM = new Float32Array(16);
const uiM = new Float32Array(16);
const projM = new Float32Array(16);
const viewM = new Float32Array(16);
const camQ = qid(), tq = qid(), tq2 = qid();
const vR = new Float32Array(3), vU = new Float32Array(3), vF = new Float32Array(3);
const tv = new Float32Array(3);

let camYaw = 0, camPitch = -0.24, camRoll = 0, camFov = 1.05;
let camX = 0, camY = 26, camZ = 78;

// --- world props --------------------------------------------------------------
// [x,y,z,scale,kind,rot,tintIdx]
const props = [];
seed(20260813);
for (let i = 0; i < 260; i++) {
  const a = rnd() * TAU, r = Math.sqrt(rnd()) * ARENA * 0.95;
  const x = cos(a) * r, z = sin(a) * r;
  const y = terrainH(x, z);
  if (y < -6) continue;
  props.push([x, y, z, rr(0.75, 1.5), rnd() < 0.62 ? 0 : 1, rnd() * TAU, floor(rnd() * 4)]);
}
// Decorative clouds sit above the flight ceiling (74) so the player can never
// fly inside one and lose the whole view.
const clouds = [];
for (let i = 0; i < 44; i++) {
  const a = rnd() * TAU, r = Math.sqrt(rnd()) * ARENA * 1.3;
  const far = r > ARENA;
  clouds.push([cos(a) * r, far ? rr(34, 96) : rr(86, 118), sin(a) * r, rr(6, 14), rr(0.2, 0.8), rr(0, TAU)]);
}

const TREE = [[0.55, 0.85, 0.62], [0.98, 0.78, 0.88], [0.72, 0.88, 0.98], [0.95, 0.88, 0.62]];

// --- draw helpers -------------------------------------------------------------
const setPar = (p, emis, cut, fogK) => {
  G.uniform4f(p._u('u_par'), emis, cut, fogK, T);
  G.uniform3f(p._u('u_cam'), camX, camY, camZ);
  G.uniformMatrix4fv(p._u('u_vp'), false, vpM);
};

// The model is authored at a comfortable scale then shrunk, so it sits small
// enough in frame to keep the ground (and your trail) readable.
const US = 0.6;
const pq = new Float32Array(4);

/** Push a body part positioned in the unicorn's local frame. */
const part = (m, q, ox, oy, oz, sx, sy, sz, lq, r, g, b, uv) => {
  qvec(tv, q, ox * US, oy * US, oz * US);
  const wq = lq ? qmul(pq, q, lq) : q;
  push(m, P._x + tv[0], P._y + tv[1], P._z + tv[2], sx * US, sy * US, sz * US, wq,
    r, g, b, 1, uv[0], uv[1], uv[2], uv[3]);
};

const bodyQ = qid();

const drawUnicorn = () => {
  // body frame = flight orientation with the visual roll applied
  qmul(bodyQ, P._q, qaxis(tq, 0, 0, 1, P._roll));
  const q = bodyQ;
  const t = P._t;
  const gallop = t * 7;

  // The model faces -Z, which is also the flight forward direction.
  const CT = [1, 0.99, 1];   // coat
  // torso + rump
  part(MESH._sph, q, 0, 0, 0.2, 2.4, 2.0, 3.5, 0, CT[0], CT[1], CT[2], WHITE);
  part(MESH._sph, q, 0, 0.15, 1.5, 2.1, 1.9, 1.9, 0, CT[0], CT[1], CT[2], WHITE);
  // neck, leaning up and forward
  qaxis(tq2, 1, 0, 0, -0.5);
  part(MESH._cyl, q, 0, 1.15, -1.35, 1.15, 2.1, 1.15, tq2, CT[0], CT[1], CT[2], WHITE);
  // head + muzzle
  part(MESH._sph, q, 0, 2.15, -2.45, 1.3, 1.25, 1.95, 0, CT[0], CT[1], CT[2], WHITE);
  part(MESH._sph, q, 0, 1.8, -3.35, 0.85, 0.78, 1.0, 0, 1, 0.93, 0.95, WHITE);
  // horn, tilted forward
  qaxis(tq2, 1, 0, 0, -0.32);
  part(MESH._cone, q, 0, 3.15, -2.75, 0.46, 1.9, 0.46, tq2, 1, 0.88, 0.45, WHITE);
  // ears
  for (const s of [-1, 1]) part(MESH._cone, q, s * 0.6, 2.9, -1.85, 0.4, 0.72, 0.4, 0, CT[0], CT[1], CT[2], WHITE);
  // eyes
  for (const s of [-1, 1]) part(MESH._sph, q, s * 0.95, 2.3, -3.0, 0.26, 0.32, 0.26, 0, 0.16, 0.11, 0.2, WHITE);
  // nostrils
  for (const s of [-1, 1]) part(MESH._sph, q, s * 0.32, 1.72, -4.05, 0.16, 0.16, 0.16, 0, 0.85, 0.6, 0.68, WHITE);

  // rainbow mane, crest of the neck down to the withers
  for (let i = 0; i < 8; i++) {
    const f = i / 7;
    const w = sin(t * 4 - i * 0.7) * 0.24;
    const c = hue(f * 0.85);
    part(MESH._sph, q, w, lerp(2.95, 1.15, f), lerp(-2.15, 0.35, f), 0.8, 0.66, 0.78, 0, c[0], c[1], c[2], WHITE);
  }
  // rainbow tail streaming behind
  for (let i = 0; i < 7; i++) {
    const f = i / 6;
    const w = sin(t * 5 - i * 0.9) * 0.55 * f;
    const c = hue(f * 0.85);
    part(MESH._sph, q, w, 0.95 - f * 0.35 + sin(t * 3 - i) * 0.12 * f, 2.5 + f * 2.2,
      0.95 - f * 0.35, 0.78 - f * 0.2, 0.9, 0, c[0], c[1], c[2], WHITE);
  }
  // legs, galloping in mid-air
  let li = 0;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const ph = gallop + li++ * 1.7;
      qaxis(tq2, 1, 0, 0, sin(ph) * 0.55 - 0.1);
      part(MESH._cyl, q, sx * 1.15, -1.55, sz * 1.35, 0.5, 2.0, 0.5, tq2, CT[0], CT[1], CT[2], WHITE);
      qvec(tv, tq2, 0, -1.0, 0);
      part(MESH._sph, q, sx * 1.15, -1.55 + tv[1], sz * 1.35 + tv[2], 0.58, 0.5, 0.66, 0, 1, 0.87, 0.5, WHITE);
    }
};

/** Rainbow ramp, 0..1 -> [r,g,b]. */
const hue = (f) => {
  const a = clamp(f, 0, 1) * 6;
  const i = floor(a), k = a - i;
  const R = [[1, .42, .55], [1, .68, .42], [1, .92, .5], [.55, .92, .6], [.45, .8, 1], [.62, .55, .98], [.9, .55, .95], [1, .42, .55]];
  const c0 = R[i], c1 = R[i + 1];
  return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
};

/**
 * Rebuild a ribbon strip from the trail. `ground` projects it onto the terrain -
 * that ground ribbon is what actually reads as the loop you are drawing.
 */
const buildRibbon = (m, ground, width) => {
  const n = min(TR.length, RIBN - 1);
  if (n < 2) { m._segs = 0; return; }
  const total = n + 1;                       // trail points plus the live head
  const d = m._dyn;
  const gx = (i) => (i < n ? TR[i][0] : P._x);
  const gz = (i) => (i < n ? TR[i][2] : P._z);

  for (let i = 0; i < total; i++) {
    const x = gx(i), z = gz(i);
    const y = i < n ? TR[i][1] : P._y;
    let dx = gx(min(total - 1, i + 1)) - gx(max(0, i - 1));
    let dz = gz(min(total - 1, i + 1)) - gz(max(0, i - 1));
    const l = hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const t = i / (total - 1);
    // taper to a point at the horn so the ribbon looks emitted, not cut off
    const w = width * (0.35 + 0.65 * smoothstep01(1 - t, 0, 0.06));
    const ex = -dz * w, ez = dx * w;
    const py = ground ? terrainH(x, z) + 0.85 : y - 0.55 * US;
    let o = i * 16;
    for (const s of [-1, 1]) {
      d[o] = x + ex * s; d[o + 1] = py; d[o + 2] = z + ez * s;
      d[o + 3] = 0; d[o + 4] = 1; d[o + 5] = 0;
      d[o + 6] = t; d[o + 7] = s < 0 ? 0 : 1;
      o += 8;
    }
  }
  m._segs = total;
};
const smoothstep01 = (v, a, b) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// --- frame --------------------------------------------------------------------
let T = 0, last = 0, sevPrev = 0;

const frame = (now) => {
  requestAnimationFrame(frame);
  const rdt = min(0.05, (now - last) / 1000) || 0.016;
  last = now;
  T += rdt;
  // brief slow-motion on a successful loop - the single cheapest feel win
  const dt = S._slow > 0 ? rdt * 0.35 : rdt;
  const live = MODE._v === 1;

  if (live) {
    updatePlayer(dt);
    updateGame(dt);
    if (S._sever > 0.9 && !sevPrev) sfxSever();
    sevPrev = S._sever > 0.9;
  } else if (MODE._v === 3) updateGame(dt);   // let particles settle on the end screen
  if (!MODE._v) {
    // attract mode: drift the unicorn on a slow orbit over the island
    const a = T * 0.13;
    P._x = cos(a) * 74;
    P._z = sin(a) * 74;
    P._y = terrainH(P._x, P._z) + 30;
    P._yaw = PI - a;
    P._pitch = P._roll = 0;
    P._t += dt;
    qmul(P._q, qaxis(tq, 0, 1, 0, P._yaw), qaxis(tq2, 1, 0, 0, 0));
  }
  setIntensity(clamp((S._combo - 1) / 5, 0, 1) * (live ? 1 : 0.25));
  if (live && S._over) { MODE._v = 3; unlock(); }

  // --- camera ---
  camYaw = angDamp(camYaw, P._yaw, 7, dt);
  camPitch = damp(camPitch, P._pitch * 0.42 - 0.36, 6, dt);
  camRoll = damp(camRoll, P._roll * 0.17, 5, dt);
  camFov = damp(camFov, lerp(1.03, 1.2, boosting), 4, dt);

  qmul(camQ, qaxis(tq, 0, 1, 0, camYaw), qaxis(tq2, 1, 0, 0, camPitch));
  qmul(camQ, camQ, qaxis(tq, 0, 0, 1, camRoll));
  qvec(vR, camQ, 1, 0, 0);
  qvec(vU, camQ, 0, 1, 0);
  qvec(vF, camQ, 0, 0, -1);

  const dist = lerp(14, 17, boosting);
  const tx = P._x - vF[0] * dist + vU[0] * 3.2;
  const ty = P._y - vF[1] * dist + vU[1] * 3.2 + 2.6;
  const tz = P._z - vF[2] * dist + vU[2] * 3.2;
  const cs = MODE._v ? 14 : 3;
  camX = damp(camX, tx, cs, rdt);
  camY = damp(camY, ty, cs, rdt);
  camZ = damp(camZ, tz, cs, rdt);

  if (S._shake > 0) {
    const k = S._shake * S._shake * 1.5;
    camX += sin(T * 61) * k;
    camY += sin(T * 74.3) * k;
    camZ += sin(T * 53.7) * k;
  }

  const aspect = W / H;
  mPerspective(projM, camFov, aspect, 0.6, 600);
  mView(viewM, camQ, camX, camY, camZ);
  mMul(vpM, projM, viewM);

  // --- render ---
  G.viewport(0, 0, W, H);
  G.clear(G.DEPTH_BUFFER_BIT);
  G.enable(G.DEPTH_TEST);
  G.enable(G.CULL_FACE);

  // sky
  G.depthMask(false);
  G.disable(G.DEPTH_TEST);
  G.useProgram(pSky);
  const th = Math.tan(camFov / 2);
  G.uniform3f(pSky._u('u_r'), vR[0], vR[1], vR[2]);
  G.uniform3f(pSky._u('u_u'), vU[0], vU[1], vU[2]);
  G.uniform3f(pSky._u('u_f'), vF[0], vF[1], vF[2]);
  G.uniform2f(pSky._u('u_asp'), th * aspect, th);
  G.uniform1f(pSky._u('u_t'), T);
  G.bindVertexArray(null);
  G.drawArrays(G.TRIANGLES, 0, 3);
  G.enable(G.DEPTH_TEST);
  G.depthMask(true);

  // terrain
  G.useProgram(pTerr);
  setPar(pTerr, 0, 0, 0.0000075);
  G.activeTexture(G.TEXTURE1);
  G.bindTexture(G.TEXTURE_2D, texTile);
  G.activeTexture(G.TEXTURE2);
  G.bindTexture(G.TEXTURE_2D, paintTex);
  G.uniform1i(pTerr._u('u_tile'), 1);
  G.uniform1i(pTerr._u('u_paint'), 2);
  G.bindVertexArray(mTerr._vao);
  G.drawElements(G.TRIANGLES, mTerr._n, G.UNSIGNED_SHORT, 0);

  // objects
  G.useProgram(pMain);
  setPar(pMain, 0, 0.35, 0.0000075);
  G.activeTexture(G.TEXTURE0);
  G.bindTexture(G.TEXTURE_2D, texAtlas);
  G.uniform1i(pMain._u('u_tex'), 0);
  G.uniform1i(pMain._u('u_paint'), 2);
  // scenery obeys the paint map; everything else keeps its own colour
  G.uniform2f(pMain._u('u_des'), 1, 0.5 / EXT);

  for (const [x, y, z, s, kind, rot, ti] of props) {
    qaxis(tq, 0, 1, 0, rot);
    const c = TREE[ti];
    if (kind === 0) {
      push(MESH._cyl, x, y + s * 1.4, z, s * 0.7, s * 3, s * 0.7, tq, 0.72, 0.56, 0.5, 1, ...WHITE);
      push(MESH._sph, x, y + s * 4.2, z, s * 3.4, s * 3.6, s * 3.4, tq, c[0], c[1], c[2], 1, ...WHITE);
      push(MESH._sph, x, y + s * 5.8, z, s * 2.2, s * 2.3, s * 2.2, tq, c[0], c[1], c[2], 1, ...WHITE);
    } else {
      // flower clump - round and soft, so gloom prisms stay unmistakable
      const c2 = TREE[(ti + 2) & 3];
      push(MESH._sph, x, y + s * 0.45, z, s * 2.3, s * 1.4, s * 2.2, tq, 0.6, 0.84, 0.66, 1, ...WHITE);
      for (let k = 0; k < 3; k++) {
        const a = rot + k * 2.094;
        push(MESH._sph, x + cos(a) * s * 1.15, y + s * (1.25 + 0.3 * k), z + sin(a) * s * 1.15,
          s * 1.05, s * 0.8, s * 1.05, tq, c2[0] * 1.12, c2[1] * 1.12, c2[2] * 1.12, 1, ...WHITE);
      }
    }
  }
  flushAll();

  for (const [x, y, z, s, sq, rot] of clouds) {
    qaxis(tq, 0, 1, 0, rot + T * 0.02);
    const dr = sin(T * 0.3 + x) * 1.5;
    // tints above 1 push the clouds bright without needing an emissive pass
    push(MESH._sph, x, y + dr, z, s, s * 0.6, s * 0.8, tq, 1.4, 1.36, 1.42, 1, ...WHITE);
    push(MESH._sph, x + s * 0.5, y + dr - s * 0.1, z + s * 0.2, s * 0.7, s * 0.5, s * 0.6, tq, 1.4, 1.33, 1.4, 1, ...WHITE);
    push(MESH._sph, x - s * 0.55, y + dr - s * 0.12, z - s * 0.15, s * 0.66, s * 0.46, s * 0.6, tq, 1.38, 1.32, 1.4, 1, ...WHITE);
  }

  flushAll();
  G.uniform2f(pMain._u('u_des'), 0, 0.5 / EXT);

  // Gloom: colour-drained prisms. Angular silhouette + slate grey, so they can
  // never be confused with the round dark thunderclouds.
  for (const g of GLM) {
    const f = g._fade;
    const s = g._sc * (1 - f * 0.7);
    const k = 1 + f * f * 5;                      // flare white as they convert
    const bob = sin(g._ph * 1.3) * 0.7;
    qaxis(tq, 0, 1, 0, g._ph * 0.8);
    push(MESH._cry, g._x, g._y + bob, g._z, s * 2.9, s * 5.6, s * 2.9, tq,
      0.40 * k, 0.37 * k, 0.54 * k, 1, ...WHITE);
    // Trapped light orbiting outside the dark body - bright motes against a dark
    // silhouette are what make a gloom legible as a target from a distance.
    const pulse = 1.5 + 0.6 * sin(g._ph * 2.6);
    for (let i = 0; i < 3; i++) {
      const a = g._ph * 1.5 + (i * TAU) / 3;
      push(MESH._sph, g._x + cos(a) * s * 2.5, g._y + bob + sin(a * 1.7) * 1.6, g._z + sin(a) * s * 2.5,
        s * 0.9, s * 0.9, s * 0.9, tq,
        pulse * 1.15 * k, pulse * 1.3 * k, pulse * 1.6 * k, 1, ...WHITE);
    }
  }

  // Thunderclouds: round, dark, and they flicker - fly through one and your
  // ribbon is severed.
  for (const c of STORM) {
    // Drawn a little tighter than the collision radius and kept flat, so being
    // caught by one costs you the ribbon without blinding you.
    const flick = sin(c._ph * 2.3) > 0.97 ? 1.5 : 1;
    const b = (0.32 + sin(c._ph * 3) * 0.03) * flick;
    qaxis(tq, 0, 1, 0, c._ph * 0.15);
    for (let i = 0; i < 5; i++) {
      const a = (i * TAU) / 5 + c._ph * 0.2;
      const rr2 = i === 4 ? 0 : c._r * 0.46;
      push(MESH._sph, c._x + cos(a) * rr2, c._y + sin(i * 2.1) * 0.9 + (i === 4 ? 1.3 : 0), c._z + sin(a) * rr2,
        c._r * (i === 4 ? 1.0 : 0.84), c._r * 0.44, c._r * (i === 4 ? 0.92 : 0.76), tq,
        b, b * 0.94, b * 1.3, 1, ...WHITE);
    }
  }

  // sparks
  for (const p of PART) {
    const a = clamp(p[6] / p[7], 0, 1);
    const s = p[11] * a;
    qaxis(tq, 0, 1, 0, p[6] * 9);
    push(MESH._cry, p[0], p[1], p[2], s, s * 2.2, s, tq, p[8] * 1.9, p[9] * 1.9, p[10] * 1.9, 1, ...WHITE);
  }

  flushAll();

  drawUnicorn();
  flushAll();

  // --- rainbow ribbons ---
  buildRibbon(ribAir, 0, 1.2);
  buildRibbon(ribGnd, 1, 2.1);
  G.useProgram(pRib);
  G.uniformMatrix4fv(pRib._u('u_vp'), false, vpM);
  G.uniform3f(pRib._u('u_cam'), camX, camY, camZ);
  G.enable(G.BLEND);
  G.blendFunc(G.SRC_ALPHA, G.ONE_MINUS_SRC_ALPHA);
  G.depthMask(false);
  G.disable(G.CULL_FACE);
  G.uniform1f(pRib._u('u_g'), 1);
  G.uniform4f(pRib._u('u_par'), 0.72 + S._flash * 0.3, S._flash, 0.0000075, T);
  drawRibbon(ribGnd);
  G.uniform1f(pRib._u('u_g'), 0);
  G.uniform4f(pRib._u('u_par'), 0.97, S._flash, 0.0000075, T);
  drawRibbon(ribAir);
  G.depthMask(true);
  G.enable(G.CULL_FACE);

  // --- UI: an orthographic pass of textured quads, no HTML anywhere ---
  mOrtho(uiM, W, H);
  G.useProgram(pMain);
  G.uniformMatrix4fv(pMain._u('u_vp'), false, uiM);
  G.uniform4f(pMain._u('u_par'), 1, 0.02, 0, T);   // fully emissive, no fog
  G.uniform2f(pMain._u('u_des'), 0, 0);
  G.disable(G.DEPTH_TEST);
  G.disable(G.CULL_FACE);
  G.blendFunc(G.SRC_ALPHA, G.ONE_MINUS_SRC_ALPHA);
  drawUI(T, vpM, muted);
  G.enable(G.DEPTH_TEST);
  G.enable(G.CULL_FACE);
  G.disable(G.BLEND);
};

setLoopCb((n, mult, cx, cy, cz, at) => {
  console.log('LOOP n=' + n + ' x' + mult + ' score=' + S._score + ' time=' + S._time.toFixed(1));
  if (!n) { sfxWhiff(); return; }
  sfxLoop(n, mult);
  // restore a generous patch of colour around everything the loop caught
  for (let i = 0; i < at.length; i += 2) stamp(at[i], at[i + 1], 22, 0.9);
  stamp(cx, cz, 14 + n * 2.5, 0.7);
});
setEndCb(sfxOver);

// --- state machine ------------------------------------------------------------
const startRun = () => {
  initAudio();
  clearPaint();
  resetGame();
  MODE._v = 1;
  sfxStart();
  if (!locked) C.requestPointerLock();
};

addEventListener('keydown', (e) => {
  const c = e.code;
  if (c === 'KeyM') { initAudio(); toggleMute(); return; }
  if (c === 'KeyR' && MODE._v > 1) { startRun(); return; }
  if (c !== 'Escape') return;
  if (MODE._v === 1) { MODE._v = 2; unlock(); sfxUI(); }
  else if (MODE._v === 2) { MODE._v = 1; sfxUI(); if (!locked) C.requestPointerLock(); }
});

initInput(() => {
  if (MODE._v === 0 || MODE._v === 3) startRun();
  else if (MODE._v === 2) MODE._v = 1;
});

setQuad(MESH._quad);
try { S._best = +localStorage.pl26 || 0; } catch (e) { }
resetGame();          // populate the island so the title screen has something to show
MODE._v = 0;
// leave a few restored patches on the attract-mode island so the title screen
// shows both halves of the premise at once: drained grey and reclaimed colour
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * TAU + 0.7;
  stamp(cos(a) * 52, sin(a) * 52, 30, 0.85);
}
// test hook, compiled out of production builds
if (DEV) self.D26 = { S, GLM, TR, P, MODE, peekPaint, stamp, audioState };

requestAnimationFrame(frame);
