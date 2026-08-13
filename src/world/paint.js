// The colour-restoration map: a 128x128 single-channel texture covering the
// island. Converting gloom stamps soft discs into it, and both the terrain and
// the scenery shaders use it to blend from drained grey back to full colour.
import { G, program } from '../engine/gl.js';
import { VS_STAMP, FS_STAMP } from './shaders.js';
import { ARENA } from './geometry.js';

const SZ = 128;
export const EXT = ARENA * 1.22;   // world half-extent the map covers
export let paintTex;

let fb, pStamp, vao;

export const initPaint = () => {
  paintTex = G.createTexture();
  G.bindTexture(G.TEXTURE_2D, paintTex);
  G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, SZ, SZ, 0, G.RGBA, G.UNSIGNED_BYTE, null);
  G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MIN_FILTER, G.LINEAR);
  G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MAG_FILTER, G.LINEAR);
  G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_S, G.CLAMP_TO_EDGE);
  G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_T, G.CLAMP_TO_EDGE);

  fb = G.createFramebuffer();
  G.bindFramebuffer(G.FRAMEBUFFER, fb);
  G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, paintTex, 0);
  console.log('paint fb', G.checkFramebufferStatus(G.FRAMEBUFFER) === G.FRAMEBUFFER_COMPLETE ? 'ok' : 'INCOMPLETE');
  G.bindFramebuffer(G.FRAMEBUFFER, null);

  pStamp = program(VS_STAMP, FS_STAMP);
  vao = G.createVertexArray();
  G.bindVertexArray(vao);
  const b = G.createBuffer();
  G.bindBuffer(G.ARRAY_BUFFER, b);
  G.bufferData(G.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), G.STATIC_DRAW);
  G.enableVertexAttribArray(0);
  G.vertexAttribPointer(0, 2, G.FLOAT, false, 0, 0);
  G.bindVertexArray(null);
};

export const clearPaint = () => {
  G.bindFramebuffer(G.FRAMEBUFFER, fb);
  G.viewport(0, 0, SZ, SZ);
  G.clearColor(0, 0, 0, 1);
  G.clear(G.COLOR_BUFFER_BIT);
  G.bindFramebuffer(G.FRAMEBUFFER, null);
};

/** Debug: highest paint value currently in the map, 0..255. */
export const peekPaint = () => {
  G.bindFramebuffer(G.FRAMEBUFFER, fb);
  const px = new Uint8Array(SZ * SZ * 4);
  G.readPixels(0, 0, SZ, SZ, G.RGBA, G.UNSIGNED_BYTE, px);
  G.bindFramebuffer(G.FRAMEBUFFER, null);
  let m = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) { if (px[i] > m) m = px[i]; if (px[i] > 20) n++; }
  return { max: m, covered: ((n / (SZ * SZ)) * 100).toFixed(1) + '%' };
};

/** Paint a soft disc of colour at world (x, z) with world-space radius r. */
export const stamp = (x, z, r, a) => {
  G.bindFramebuffer(G.FRAMEBUFFER, fb);
  G.viewport(0, 0, SZ, SZ);
  G.disable(G.DEPTH_TEST);
  G.enable(G.BLEND);
  G.blendFunc(G.SRC_ALPHA, G.ONE);
  G.useProgram(pStamp);
  G.uniform4f(pStamp._u('u_d'), x / EXT, z / EXT, r / EXT, 0);
  G.uniform1f(pStamp._u('u_a'), a);
  G.bindVertexArray(vao);
  G.drawArrays(G.TRIANGLES, 0, 3);
  G.disable(G.BLEND);
  G.enable(G.DEPTH_TEST);
  G.bindFramebuffer(G.FRAMEBUFFER, null);
};
