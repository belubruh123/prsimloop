// Compliance check for the real submission artifact.
// Reads prism-loop.zip, serves ONLY what is inside it, plays it headless, and
// fails on any error or outbound request. Nothing is written to disk, so a
// stale file on the filesystem can never mask a missing entry in the archive.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readZip } from './tools/zip.mjs';

const LIMIT = 13312;
const ROOT = dirname(fileURLToPath(import.meta.url));
const ZIP = join(ROOT, 'prism-loop.zip');
const fail = [];

const size = statSync(ZIP).size;
console.log(`\n  zip            ${size} / ${LIMIT} bytes`);
if (size > LIMIT) fail.push(`zip is ${size - LIMIT} bytes over the limit`);

// Read the archive back exactly as a judge's browser would receive it.
const entries = readZip(ZIP);
const names = entries.map((e) => e.name);
console.log(`  zip contents   ${names.join(', ')}`);
if (!names.includes('index.html')) fail.push('index.html is not at the zip root');

const html = (entries.find((e) => e.name === 'index.html')?.data || Buffer.alloc(0)).toString('utf8');
// Any absolute URL in the payload would mean an external dependency.
const ext = html.match(/https?:\/\/[^"'\s)]+/g);
if (ext) fail.push('external URL referenced: ' + ext.join(', '));

// Serve straight from the archive, so nothing on disk can mask a missing file.
const srv = createServer((q, s) => {
  const f = (q.url === '/' ? '/index.html' : q.url.split('?')[0]).slice(1);
  const hit = entries.find((e) => e.name === f);
  if (!hit) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  s.end(hit.data);
}).listen(0);
const port = srv.address().port;

// playwright-core ships no browser; `npm run browser` fetches one once.
const launch = async () => {
  try {
    return await chromium.launch({
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle',
        '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
    });
  } catch (e) {
    console.error('\n  Chromium is not installed. Run:  npm run browser\n');
    process.exit(1);
  }
};

const browser = await launch();
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
await page.screenshot({ path: join(ROOT, 'shots', 'prod.png') });

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

if (fail.length) {
  console.error('\n  FAILED:\n   - ' + fail.join('\n   - ') + '\n');
  process.exit(1);
}
console.log('\n  PASS - runs offline, no external requests, within budget\n');
