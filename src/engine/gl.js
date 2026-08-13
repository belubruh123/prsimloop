// WebGL2 core: one instanced draw call per mesh, 18 floats of instance data each.

export const C = document.getElementById('c');
export const G = C.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });

export let W = 1, H = 1;

// Cap DPR at 2 - beyond that we pay a lot of fill rate for nothing visible.
export const resize = () => {
  const d = Math.min(devicePixelRatio || 1, 2);
  W = C.width = (innerWidth * d) | 0;
  H = C.height = (innerHeight * d) | 0;
  G.viewport(0, 0, W, H);
};

export const program = (vs, fs) => {
  const p = G.createProgram();
  for (const [type, src] of [[G.VERTEX_SHADER, vs], [G.FRAGMENT_SHADER, fs]]) {
    const s = G.createShader(type);
    G.shaderSource(s, src);
    G.compileShader(s);
    if (!G.getShaderParameter(s, G.COMPILE_STATUS)) console.error(G.getShaderInfoLog(s), src);
    G.attachShader(p, s);
  }
  G.linkProgram(p);
  if (!G.getProgramParameter(p, G.LINK_STATUS)) console.error(G.getProgramInfoLog(p));
  // Uniform locations resolved on demand and memoised.
  const cache = {};
  p._u = (n) => (n in cache ? cache[n] : (cache[n] = G.getUniformLocation(p, n)));
  return p;
};

// per-instance layout: pos3 scale3 quat4 rgba4 uvrect4
export const STRIDE = 18;

/**
 * Build a mesh with its own instance buffer.
 * verts: interleaved position3 normal3 uv2. idx: Uint16 indices.
 */
export const mesh = (verts, idx, maxInst = 512) => {
  const vao = G.createVertexArray();
  G.bindVertexArray(vao);

  const vb = G.createBuffer();
  G.bindBuffer(G.ARRAY_BUFFER, vb);
  G.bufferData(G.ARRAY_BUFFER, new Float32Array(verts), G.STATIC_DRAW);
  let off = 0;
  for (const [loc, n] of [[0, 3], [1, 3], [2, 2]]) {
    G.enableVertexAttribArray(loc);
    G.vertexAttribPointer(loc, n, G.FLOAT, false, 32, off);
    off += n * 4;
  }

  const ib = G.createBuffer();
  G.bindBuffer(G.ELEMENT_ARRAY_BUFFER, ib);
  G.bufferData(G.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), G.STATIC_DRAW);

  const inst = G.createBuffer();
  G.bindBuffer(G.ARRAY_BUFFER, inst);
  G.bufferData(G.ARRAY_BUFFER, maxInst * STRIDE * 4, G.DYNAMIC_DRAW);
  off = 0;
  for (const [loc, n] of [[3, 3], [4, 3], [5, 4], [6, 4], [7, 4]]) {
    G.enableVertexAttribArray(loc);
    G.vertexAttribPointer(loc, n, G.FLOAT, false, STRIDE * 4, off);
    G.vertexAttribDivisor(loc, 1);
    off += n * 4;
  }
  G.bindVertexArray(null);

  return {
    _vao: vao,
    _vb: vb,
    _n: idx.length,
    _buf: inst,
    _d: new Float32Array(maxInst * STRIDE),
    _c: 0,
    _max: maxInst,
    _dyn: null,
  };
};

/**
 * A ribbon strip whose vertices are rewritten every frame. `n` is the number of
 * cross-sections; each contributes two vertices (left/right edge).
 */
export const ribbon = (n) => {
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const m = mesh(new Float32Array(n * 2 * 8), idx, 1);
  m._dyn = new Float32Array(n * 2 * 8);
  m._segs = 0;
  return m;
};

/** Upload the rewritten vertices and draw `_segs` cross-sections' worth of strip. */
export const drawRibbon = (m) => {
  if (m._segs < 2) return;
  G.bindVertexArray(m._vao);
  G.bindBuffer(G.ARRAY_BUFFER, m._vb);
  G.bufferSubData(G.ARRAY_BUFFER, 0, m._dyn, 0, m._segs * 16);
  G.drawElements(G.TRIANGLES, (m._segs - 1) * 6, G.UNSIGNED_SHORT, 0);
};

const IDENT = new Float32Array([0, 0, 0, 1]);

/** Queue one instance. q defaults to identity; uv defaults to the whole texture. */
export const push = (m, x, y, z, sx, sy, sz, q, r, g, b, a, u0, v0, u1, v1) => {
  if (m._c >= m._max) return;
  const d = m._d;
  let o = m._c++ * STRIDE;
  d[o] = x; d[o + 1] = y; d[o + 2] = z;
  d[o + 3] = sx; d[o + 4] = sy; d[o + 5] = sz;
  q = q || IDENT;
  d[o + 6] = q[0]; d[o + 7] = q[1]; d[o + 8] = q[2]; d[o + 9] = q[3];
  d[o + 10] = r; d[o + 11] = g; d[o + 12] = b; d[o + 13] = a === undefined ? 1 : a;
  d[o + 14] = u0 || 0; d[o + 15] = v0 || 0;
  d[o + 16] = u1 === undefined ? 1 : u1; d[o + 17] = v1 === undefined ? 1 : v1;
};

export const flush = (m) => {
  if (!m._c) return;
  G.bindVertexArray(m._vao);
  G.bindBuffer(G.ARRAY_BUFFER, m._buf);
  G.bufferSubData(G.ARRAY_BUFFER, 0, m._d, 0, m._c * STRIDE);
  G.drawElementsInstanced(G.TRIANGLES, m._n, G.UNSIGNED_SHORT, 0, m._c);
  m._c = 0;
};
