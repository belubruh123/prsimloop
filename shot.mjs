// Headless smoke test + screenshots. Builds the dev bundle, serves it, drives
// some input, and captures frames so visuals can be checked without manual play.
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const ROOT = new URL('.', import.meta.url).pathname;
const OUT = ROOT + 'dist';
const SHOTS = ROOT + 'shots';
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

// Times (ms) to capture, and keys held going into each capture. Holding
// Space+KeyD flies a hard-banked circle, which is what closes a loop.
const PLAN = [
  [600, []],
  [3000, ['KeyD']],
  [8000, ['Space', 'KeyD']],
  [14000, ['Space', 'KeyD']],
  [20000, ['Space', 'KeyD']],
  [26000, ['KeyA']],
];

await build({
  entryPoints: [ROOT + 'src/main.js'],
  bundle: true, format: 'iife', target: 'es2020',
  outfile: OUT + '/b.js', logLevel: 'warning',
});
writeFileSync(OUT + '/index.html',
  '<!doctype html><meta charset=utf-8><title>PRISM LOOP</title>' +
  '<style>html,body{margin:0;height:100%;overflow:hidden;background:#12030f}' +
  'canvas{display:block;width:100%;height:100%}</style>' +
  '<canvas id=c></canvas><script src=b.js></script>');

const srv = createServer((q, s) => {
  const f = q.url === '/' ? '/index.html' : q.url.split('?')[0];
  try {
    s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' });
    s.end(readFileSync(OUT + f));
  } catch { s.writeHead(404); s.end(); }
}).listen(0);
const port = srv.address().port;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle',
    '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') errs.push('CONSOLE ' + t);
  else if (!/^hello/.test(t)) console.log('   [log]', t);
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
// click starts the game (pointer lock will fail headless; the game still runs)
await page.mouse.click(640, 360);

let held = [];
let t0 = Date.now();
for (const [at, keys] of PLAN) {
  if (held.join() !== keys.join()) {
    for (const k of held) if (!keys.includes(k)) await page.keyboard.up(k);
    for (const k of keys) if (!held.includes(k)) await page.keyboard.down(k);
    held = keys;
  }
  const wait = at - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const name = `${SHOTS}/t${String(at).padStart(5, '0')}.png`;
  await page.screenshot({ path: name });
  console.log('  shot', name.replace(ROOT, ''));

  // Once we're established in a hard-banked circle, drop gloom clusters to the
  // left, right and centre of the turn so enclosure is exercised deterministically.
  if (at === 8000) {
    await page.evaluate(() => {
      const { P, GLM } = self.D26;
      const rx = -P._fwd[2], rz = P._fwd[0];
      for (const d of [-11, 0, 11])
        for (let i = 0; i < 8; i++) {
          const x = P._x + rx * d + (Math.random() - 0.5) * 7;
          const z = P._z + rz * d + (Math.random() - 0.5) * 7;
          GLM.push({ _x: x, _z: z, _y: P._y - 6, _ph: 0, _sc: 1, _drift: 0, _fade: 0 });
        }
    });
    console.log('   seeded 24 gloom around the turn');
  }
}

const st = await page.evaluate(() => ({
  score: self.D26.S._score, combo: self.D26.S._combo,
  time: +self.D26.S._time.toFixed(1), gloom: self.D26.GLM.length, trail: self.D26.TR.length, paint: self.D26.peekPaint(),
}));
console.log('  state', JSON.stringify(st));

// report the frame rate the page actually achieved
const fps = await page.evaluate(() => new Promise((r) => {
  let n = 0; const s = performance.now();
  const f = () => (performance.now() - s < 1000 ? (n++, requestAnimationFrame(f)) : r(n));
  requestAnimationFrame(f);
}));
console.log('  fps ~', fps);

await browser.close();
srv.close();

if (errs.length) {
  console.error('\n  ERRORS:\n   ' + [...new Set(errs)].join('\n   ') + '\n');
  process.exit(1);
}
console.log('  no console errors\n');
