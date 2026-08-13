// All artwork is generated at boot into two canvases - zero image bytes shipped.
//   TILE  64x64  repeating grass, mipmapped, for the terrain
//   ATLAS 256x256 sprite sheet on a 16x16 grid of 16px cells, NEAREST filtered
import { G } from './gl.js';
import { rnd, seed, floor, sin, cos, TAU } from './math.js';

export const CELL = 16;
export const GRID = 16;

/** uv rect (u0,v0,du,dv) for an atlas cell, inset by a texel to stop bleeding. */
export const U = (cx, cy, w = 1, h = 1) => {
  const s = 1 / GRID, e = 0.5 / (CELL * GRID);
  return [cx * s + e, cy * s + e, w * s - 2 * e, h * s - 2 * e];
};
export const WHITE = U(0, 0);

const cv = (w, h) => {
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
};

export const tex = (src, { rep = 0, mip = 0, near = 1 } = {}) => {
  const t = G.createTexture();
  G.bindTexture(G.TEXTURE_2D, t);
  G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, G.RGBA, G.UNSIGNED_BYTE, src);
  const wrap = rep ? G.REPEAT : G.CLAMP_TO_EDGE;
  G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_S, wrap);
  G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_T, wrap);
  G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MAG_FILTER, near ? G.NEAREST : G.LINEAR);
  if (mip) {
    G.generateMipmap(G.TEXTURE_2D);
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MIN_FILTER, G.LINEAR_MIPMAP_LINEAR);
  } else {
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MIN_FILTER, near ? G.NEAREST : G.LINEAR);
  }
  return t;
};

// --- terrain tile -------------------------------------------------------------
export const makeTile = () => {
  const [c, x] = cv(64, 64);
  seed(7);
  x.fillStyle = '#8fdca8';
  x.fillRect(0, 0, 64, 64);
  // dithered value variation, chunky 2px pixels
  for (let i = 0; i < 64; i += 2)
    for (let j = 0; j < 64; j += 2) {
      const r = rnd();
      x.fillStyle = r < 0.16 ? '#7fd09a' : r < 0.3 ? '#9ee5b3' : r < 0.36 ? '#adecbe' : '#8fdca8';
      x.fillRect(i, j, 2, 2);
    }
  // scattered flower specks + grass blades
  for (let i = 0; i < 26; i++) {
    const px = floor(rnd() * 32) * 2, py = floor(rnd() * 32) * 2;
    x.fillStyle = ['#ffe9b0', '#ffd9e8', '#e0c9ff', '#bfe3ff'][floor(rnd() * 4)];
    x.fillRect(px, py, 2, 2);
  }
  for (let i = 0; i < 40; i++) {
    const px = floor(rnd() * 64), py = floor(rnd() * 62);
    x.fillStyle = '#79c894';
    x.fillRect(px, py, 1, 2);
  }
  return tex(c, { rep: 1, mip: 1, near: 0 });
};

// --- sprite atlas -------------------------------------------------------------
export let ATLAS_CV;

/**
 * Draw a 16x16 sprite from row strings. Each character indexes `pal`;
 * space and '.' are transparent. Repetitive strings gzip extremely well.
 */
export const blit = (x, cx, cy, rows, pal) => {
  const ox = cx * CELL, oy = cy * CELL;
  for (let j = 0; j < rows.length; j++)
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === '.' || ch === ' ') continue;
      x.fillStyle = pal[ch];
      x.fillRect(ox + i, oy + j, 1, 1);
    }
};

// The UI font is rasterised with Canvas2D into atlas cells at boot, so no glyph
// data is shipped at all. Magnified with NEAREST it reads as chunky pixel type.
export const CHARS = "0123456789:.,'!?X+-%/ ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const FONT_ROW = 8;

export const charUV = (ch) => {
  const i = CHARS.indexOf(ch);
  return i < 0 ? 0 : U(i % GRID, FONT_ROW + ((i / GRID) | 0));
};

const drawFont = (x) => {
  x.font = 'bold 14px Verdana,DejaVu Sans,sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#fff';
  for (let i = 0; i < CHARS.length; i++) {
    if (CHARS[i] === ' ') continue;
    const cx = (i % GRID) * CELL, cy = (FONT_ROW + ((i / GRID) | 0)) * CELL;
    // maxWidth condenses wide glyphs so nothing bleeds into the next cell
    x.fillText(CHARS[i], cx + CELL / 2, cy + CELL / 2 + 1, CELL - 5);
  }
};

export const makeAtlas = () => {
  const [c, x] = cv(CELL * GRID, CELL * GRID);
  ATLAS_CV = x;
  x.clearRect(0, 0, 256, 256);
  // cell 0,0 - solid white, used by every untextured surface
  x.fillStyle = '#fff';
  x.fillRect(0, 0, CELL, CELL);
  drawFont(x);
  return x;
};

export const finishAtlas = (x) => tex(x.canvas, { near: 1 });
