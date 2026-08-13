// PRISM LOOP - js13kGames 2026. Boot, the frame loop, and the render order.
// Everything else lives in engine/ (reusable), world/ (the island), game/ (rules),
// render/ (drawing) and ui/ (screens). This file is the conductor only.
import { C, G, W, H, resize, program, push, flush, drawRibbon } from './engine/gl.js';
import { makeAtlas, finishAtlas, makeTile } from './engine/atlas.js';
import {
  initAudio, toggleMute, muted, setIntensity, audioState,
  sfxLoop, sfxWhiff, sfxSever, sfxUI, sfxStart, sfxOver,
} from './engine/audio.js';
import {
  PI, TAU, sin, cos, clamp, lerp, damp, angDamp, min,
  qid, qaxis, qmul, qvec, mPerspective, mView, mMul, mOrtho,
} from './engine/math.js';

import { VS_MAIN, FS_MAIN, VS_SKY, FS_SKY, VS_TERR, FS_TERR, VS_RIB, FS_RIB } from './world/shaders.js';
import { terrainH } from './world/geometry.js';
import { initPaint, clearPaint, stamp, paintTex, EXT, peekPaint } from './world/paint.js';

import { S, MODE, setLoopCb, setEndCb, loadBest } from './game/state.js';
import { P, initInput, updatePlayer, boosting, unlock, locked } from './game/player.js';
import { GLM } from './game/entities.js';
import { TR } from './game/trail.js';
import { resetGame, updateGame } from './game/run.js';

import { MESH, TERRAIN, flushAll } from './render/meshes.js';
import { drawProps, drawClouds } from './render/scenery.js';
import { drawGloom, drawStorms, drawSparks } from './render/actors.js';
import { drawUnicorn } from './render/unicorn.js';
import { AIR, GROUND, buildRibbons } from './render/ribbon.js';

import { setQuad } from './ui/draw.js';
import { drawUI } from './ui/screens.js';

// --- boot ---------------------------------------------------------------------
resize();
addEventListener('resize', resize);

const pMain = program(VS_MAIN, FS_MAIN);
const pSky = program(VS_SKY, FS_SKY);
const pTerr = program(VS_TERR, FS_TERR);
const pRib = program(VS_RIB, FS_RIB);

const texAtlas = finishAtlas(makeAtlas());
const texTile = makeTile();
initPaint();
setQuad(MESH._quad);

const FOG = 0.0000075;

// --- camera -------------------------------------------------------------------
const vpM = new Float32Array(16), uiM = new Float32Array(16);
const projM = new Float32Array(16), viewM = new Float32Array(16);
const camQ = qid(), tq = qid(), tq2 = qid();
const vR = new Float32Array(3), vU = new Float32Array(3), vF = new Float32Array(3);

let camYaw = 0, camPitch = -0.24, camRoll = 0, camFov = 1.05;
let camX = 0, camY = 26, camZ = 78;

/** Per-program uniforms shared by the terrain and object passes. */
const setPar = (p, emis, cut, fogK) => {
  G.uniform4f(p._u('u_par'), emis, cut, fogK, T);
  G.uniform3f(p._u('u_cam'), camX, camY, camZ);
  G.uniformMatrix4fv(p._u('u_vp'), false, vpM);
};

const updateCamera = (dt, rdt) => {
  camYaw = angDamp(camYaw, P._yaw, 7, dt);
  camPitch = damp(camPitch, P._pitch * 0.42 - 0.36, 6, dt);
  camRoll = damp(camRoll, P._roll * 0.17, 5, dt);
  camFov = damp(camFov, lerp(1.03, 1.2, boosting), 4, dt);

  qmul(camQ, qaxis(tq, 0, 1, 0, camYaw), qaxis(tq2, 1, 0, 0, camPitch));
  qmul(camQ, camQ, qaxis(tq, 0, 0, 1, camRoll));
  qvec(vR, camQ, 1, 0, 0);
  qvec(vU, camQ, 0, 1, 0);
  qvec(vF, camQ, 0, 0, -1);

  // sit behind and above the unicorn, pulling back further under hard bank
  const dist = lerp(14, 17, boosting);
  const cs = MODE._v ? 14 : 3;
  camX = damp(camX, P._x - vF[0] * dist + vU[0] * 3.2, cs, rdt);
  camY = damp(camY, P._y - vF[1] * dist + vU[1] * 3.2 + 2.6, cs, rdt);
  camZ = damp(camZ, P._z - vF[2] * dist + vU[2] * 3.2, cs, rdt);

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
  return aspect;
};

/** Slow orbit over the island behind the title screen. */
const attract = (dt) => {
  const a = T * 0.13;
  P._x = cos(a) * 74;
  P._z = sin(a) * 74;
  P._y = terrainH(P._x, P._z) + 30;
  P._yaw = PI - a;
  P._pitch = P._roll = 0;
  P._t += dt;
  qmul(P._q, qaxis(tq, 0, 1, 0, P._yaw), qaxis(tq2, 1, 0, 0, 0));
};

// --- render -------------------------------------------------------------------
const render = (aspect) => {
  G.viewport(0, 0, W, H);
  G.clear(G.DEPTH_BUFFER_BIT);
  G.enable(G.DEPTH_TEST);
  G.enable(G.CULL_FACE);

  // sky: one fullscreen triangle, view ray rebuilt from the camera basis
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
  setPar(pTerr, 0, 0, FOG);
  G.activeTexture(G.TEXTURE1);
  G.bindTexture(G.TEXTURE_2D, texTile);
  G.activeTexture(G.TEXTURE2);
  G.bindTexture(G.TEXTURE_2D, paintTex);
  G.uniform1i(pTerr._u('u_tile'), 1);
  G.uniform1i(pTerr._u('u_paint'), 2);
  G.bindVertexArray(TERRAIN._vao);
  G.drawElements(G.TRIANGLES, TERRAIN._n, G.UNSIGNED_SHORT, 0);

  // instanced objects
  G.useProgram(pMain);
  setPar(pMain, 0, 0.35, FOG);
  G.activeTexture(G.TEXTURE0);
  G.bindTexture(G.TEXTURE_2D, texAtlas);
  G.uniform1i(pMain._u('u_tex'), 0);
  G.uniform1i(pMain._u('u_paint'), 2);

  // scenery is drained until the paint map says its patch has been restored
  G.uniform2f(pMain._u('u_des'), 1, 0.5 / EXT);
  drawProps();
  flushAll();
  drawClouds(T);
  flushAll();

  // actors and the unicorn keep their own colour
  G.uniform2f(pMain._u('u_des'), 0, 0.5 / EXT);
  drawGloom();
  drawStorms();
  drawSparks();
  flushAll();
  drawUnicorn();
  flushAll();

  // rainbow ribbons, blended and depth-read-only
  buildRibbons();
  G.useProgram(pRib);
  G.uniformMatrix4fv(pRib._u('u_vp'), false, vpM);
  G.uniform3f(pRib._u('u_cam'), camX, camY, camZ);
  G.enable(G.BLEND);
  G.blendFunc(G.SRC_ALPHA, G.ONE_MINUS_SRC_ALPHA);
  G.depthMask(false);
  G.disable(G.CULL_FACE);
  G.uniform1f(pRib._u('u_g'), 1);
  G.uniform4f(pRib._u('u_par'), 0.72 + S._flash * 0.3, S._flash, FOG, T);
  drawRibbon(GROUND);
  G.uniform1f(pRib._u('u_g'), 0);
  G.uniform4f(pRib._u('u_par'), 0.97, S._flash, FOG, T);
  drawRibbon(AIR);
  G.depthMask(true);
  G.enable(G.CULL_FACE);

  // UI: an orthographic pass of textured quads, no HTML anywhere
  mOrtho(uiM, W, H);
  G.useProgram(pMain);
  G.uniformMatrix4fv(pMain._u('u_vp'), false, uiM);
  G.uniform4f(pMain._u('u_par'), 1, 0.02, 0, T);   // fully emissive, no fog
  G.uniform2f(pMain._u('u_des'), 0, 0);
  G.disable(G.DEPTH_TEST);
  G.disable(G.CULL_FACE);
  drawUI(T, vpM, muted);
  G.enable(G.DEPTH_TEST);
  G.enable(G.CULL_FACE);
  G.disable(G.BLEND);
};

// --- frame --------------------------------------------------------------------
let T = 0, last = 0, sevPrev = 0;

const frame = (now) => {
  requestAnimationFrame(frame);
  const rdt = min(0.05, (now - last) / 1000) || 0.016;
  last = now;
  T += rdt;
  // brief slow-motion on a successful loop - the cheapest feel win there is
  const dt = S._slow > 0 ? rdt * 0.35 : rdt;
  const live = MODE._v === 1;

  if (live) {
    updatePlayer(dt);
    updateGame(dt);
    if (S._sever > 0.9 && !sevPrev) sfxSever();
    sevPrev = S._sever > 0.9;
    if (S._over) { MODE._v = 3; unlock(); }
  } else if (MODE._v === 3) {
    updateGame(dt);           // let the sparks settle behind the end screen
  } else if (!MODE._v) {
    attract(dt);
  }
  setIntensity(clamp((S._combo - 1) / 5, 0, 1) * (live ? 1 : 0.25));

  render(updateCamera(dt, rdt));
};

// --- wiring -------------------------------------------------------------------
setLoopCb((n, mult, cx, cy, cz, at) => {
  if (!n) { sfxWhiff(); return; }
  sfxLoop(n, mult);
  // restore a generous patch of colour around everything the loop caught
  for (let i = 0; i < at.length; i += 2) stamp(at[i], at[i + 1], 22, 0.9);
  stamp(cx, cz, 14 + n * 2.5, 0.7);
});
setEndCb(sfxOver);

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

loadBest();
resetGame();     // populate the island so the title screen has something to show
MODE._v = 0;
// Leave a few restored patches on the attract-mode island, so the title screen
// shows both halves of the premise at once: drained grey and reclaimed colour.
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * TAU + 0.7;
  stamp(cos(a) * 52, sin(a) * 52, 30, 0.85);
}

// test hook, compiled out of production builds by an esbuild define
if (DEV) self.D26 = { S, GLM, TR, P, MODE, peekPaint, stamp, audioState };

requestAnimationFrame(frame);
