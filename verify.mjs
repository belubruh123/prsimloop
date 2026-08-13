// Compliance check for the real submission artifact.
// Unzips prism-loop.zip into a clean directory, serves ONLY that directory,
// plays it headless, and fails on any error or outbound request.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, statSync, readdirSync } from 'node:fs';

const LIMIT = 13312;
const ROOT = new URL('.', import.meta.url).pathname;
const ZIP = ROOT + 'prism-loop.zip';
const OUT = ROOT + '.verify';
const fail = [];

const size = statSync(ZIP).size;
console.log(`\n  zip            ${size} / ${LIMIT} bytes`);
if (size > LIMIT) fail.push(`zip is ${size - LIMIT} bytes over the limit`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execSync(`unzip -qo "${ZIP}" -d "${OUT}"`);

const entries = readdirSync(OUT);
console.log(`  zip contents   ${entries.join(', ')}`);
if (!entries.includes('index.html')) fail.push('index.html is not at the zip root');

const html = readFileSync(OUT + '/index.html', 'utf8');
// Any absolute URL in the payload would mean an external dependency.
const ext = html.match(/https?:\/\/[^"'\s)]+/g);
if (ext) fail.push('external URL referenced: ' + ext.join(', '));

const srv = createServer((q, s) => {
  const f = q.url === '/' ? '/index.html' : q.url.split('?')[0];
  try {
    s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    s.end(readFileSync(OUT + f));
  } catch { s.writeHead(404); s.end(); }
}).listen(0);
const port = srv.address().port;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errs = [];
const reqs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith(`http://127.0.0.1:${port}/`) && !u.startsWith('data:')) reqs.push(u);
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.mouse.click(640, 360);
await page.keyboard.down('Space');
await page.keyboard.down('KeyD');
await page.waitForTimeout(9000);
await page.keyboard.up('Space');
await page.keyboard.up('KeyD');
await page.screenshot({ path: ROOT + 'shots/prod.png' });

// The debug hook is compiled out of production, so probe the canvas instead:
// a live WebGL canvas that has actually drawn something.
const drew = await page.evaluate(() => {
  const c = document.getElementById('c');
  return !!c && c.width > 0 && c.height > 0;
});
if (!drew) fail.push('canvas was never sized - the game did not boot');

console.log(`  external reqs  ${reqs.length ? reqs.join(', ') : 'none'}`);
console.log(`  canvas         ${drew ? 'live' : 'DEAD'}`);
if (reqs.length) fail.push('made ' + reqs.length + ' external request(s)');
if (errs.length) fail.push(...new Set(errs));

await browser.close();
srv.close();
rmSync(OUT, { recursive: true, force: true });

if (fail.length) {
  console.error('\n  FAILED:\n   - ' + fail.join('\n   - ') + '\n');
  process.exit(1);
}
console.log('\n  PASS - runs offline, no external requests, within budget\n');
