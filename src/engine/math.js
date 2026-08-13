// Minimal math: quaternions for orientation (no gimbal lock, free smooth banking),
// mat4 only where the GPU needs one, plus hash noise and a seeded PRNG.

export const PI = Math.PI;
export const TAU = PI * 2;
export const sin = Math.sin;
export const cos = Math.cos;
export const abs = Math.abs;
export const min = Math.min;
export const max = Math.max;
export const sqrt = Math.sqrt;
export const floor = Math.floor;
export const hypot = Math.hypot;
export const atan2 = Math.atan2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
/** Hermite smoothstep between two edges. */
export const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Frame-rate independent exponential approach. rate = "fraction remaining per second".
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** Shortest signed angle from a to b. */
export const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > PI) d -= TAU;
  if (d < -PI) d += TAU;
  return d;
};
export const angDamp = (a, b, rate, dt) => a + angDiff(a, b) * (1 - Math.exp(-rate * dt));

// --- seeded PRNG (mulberry32) -------------------------------------------------
let _seed = 1337;
export const seed = (s) => (_seed = s >>> 0);
export const rnd = () => {
  _seed = (_seed + 0x6d2b79f5) >>> 0;
  let t = _seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const rr = (a, b) => a + rnd() * (b - a);

// --- value noise --------------------------------------------------------------
const h2 = (x, y) => {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
export const noise = (x, y) => {
  const xi = floor(x), yi = floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  return lerp(
    lerp(h2(xi, yi), h2(xi + 1, yi), xf),
    lerp(h2(xi, yi + 1), h2(xi + 1, yi + 1), xf),
    yf
  );
};
export const fbm = (x, y, oct = 4) => {
  let v = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    v += a * noise(x, y);
    n += a;
    a *= 0.5;
    x *= 2.03;
    y *= 2.01;
  }
  return v / n;
};

// --- quaternions (x,y,z,w) ----------------------------------------------------
export const qid = () => new Float32Array([0, 0, 0, 1]);

export const qmul = (o, a, b) => {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by;
  o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw;
  o[3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
};

// Quaternion for `ang` radians about a unit axis.
export const qaxis = (o, x, y, z, ang) => {
  const s = sin(ang / 2);
  o[0] = x * s; o[1] = y * s; o[2] = z * s; o[3] = cos(ang / 2);
  return o;
};

export const qnorm = (q) => {
  const l = hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  return q;
};

// Rotate vector (x,y,z) by quaternion q, writing into `o`.
export const qvec = (o, q, x, y, z) => {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  // t = 2 * cross(qv, v)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  o[0] = x + qw * tx + qy * tz - qz * ty;
  o[1] = y + qw * ty + qz * tx - qx * tz;
  o[2] = z + qw * tz + qx * ty - qy * tx;
  return o;
};

// Normalised lerp - cheaper than slerp and indistinguishable for camera smoothing.
export const qnlerp = (o, a, b, t) => {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  for (let i = 0; i < 4; i++) o[i] = a[i] + (b[i] * s - a[i]) * t;
  return qnorm(o);
};

// --- mat4 (column major) ------------------------------------------------------
export const mPerspective = (o, fovy, aspect, near, far) => {
  const f = 1 / Math.tan(fovy / 2);
  o.fill(0);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
};

// View matrix = inverse of a rigid transform built from quaternion q at point p.
export const mView = (o, q, px, py, pz) => {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  // rows of R (= columns of R^T, which is what the view matrix needs)
  const r0 = 1 - 2 * (yy + zz), r1 = 2 * (xy - wz), r2 = 2 * (xz + wy);
  const r3 = 2 * (xy + wz), r4 = 1 - 2 * (xx + zz), r5 = 2 * (yz - wx);
  const r6 = 2 * (xz - wy), r7 = 2 * (yz + wx), r8 = 1 - 2 * (xx + yy);
  o[0] = r0; o[4] = r3; o[8] = r6; o[12] = -(r0 * px + r3 * py + r6 * pz);
  o[1] = r1; o[5] = r4; o[9] = r7; o[13] = -(r1 * px + r4 * py + r7 * pz);
  o[2] = r2; o[6] = r5; o[10] = r8; o[14] = -(r2 * px + r5 * py + r8 * pz);
  o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1;
  return o;
};

export const mMul = (o, a, b) => {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
    }
  }
  return o;
};

export const mOrtho = (o, w, h) => {
  o.fill(0);
  o[0] = 2 / w; o[5] = -2 / h; o[10] = -1; o[15] = 1;
  o[12] = -1; o[13] = 1;
  return o;
};
