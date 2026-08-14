// PRISM LOOP build pipeline.
//   src/main.js --esbuild--> terser --> roadroller --> index.html --> zip -> ect -> advzip
// Prints the final byte count against the js13k limit and fails the build if over.
//
// Runs on Windows, macOS and Linux: paths go through node:path and the archive
// is written in-process, so no `zip`/`unzip` binaries are required.
import { build, context } from 'esbuild';
import { minify } from 'terser';
import { Packer } from 'roadroller';
import ect from 'ect-bin';
import advzip from 'advzip-bin';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, statSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { writeZip } from './tools/zip.mjs';

const LIMIT = 13312;
const DEV = process.argv.includes('--dev');
// fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/..." and
// every path built from it comes out as "C:\C:\...".
const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src', 'main.js');
const OUT = join(ROOT, 'dist');
const ZIP = join(ROOT, 'prism-loop.zip');

const shell = (js, dev) =>
  '<!doctype html><meta charset=utf-8><title>PRISM LOOP</title>' +
  '<style>html,body{margin:0;height:100%;overflow:hidden;background:#12030f;' +
  'touch-action:none}canvas{display:block;width:100%;height:100%}</style>' +
  '<canvas id=c></canvas>' +
  (dev ? '<script src=b.js></script>' : '<script>' + js + '</script>');

async function bundle() {
  const r = await build({
    entryPoints: [SRC],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    treeShaking: true,
    write: false,
    minify: false,
    legalComments: 'none',
    define: { DEV: 'false' },   // compiles out the headless-test hook
  });
  return r.outputFiles[0].text;
}

// Every internal property is written `_name` so property mangling is safe.
const terserOpts = {
  ecma: 2020,
  module: false,
  toplevel: true,
  compress: {
    passes: 4,
    unsafe: true,
    unsafe_arrows: true,
    unsafe_comps: true,
    unsafe_math: true,
    unsafe_methods: true,
    booleans_as_integers: true,
    pure_getters: true,
    drop_console: true,
    hoist_funs: true,
  },
  mangle: { toplevel: true, properties: { regex: /^_/ } },
  format: { comments: false },
};

async function roadroll(js) {
  const packer = new Packer([{ data: js, type: 'js', action: 'eval' }], { maxMemoryMB: 512 });
  await packer.optimize(2);
  const { firstLine, secondLine } = packer.makeDecoder();
  return firstLine + secondLine;
}

/** Recompress in place. Optional: a missing binary should not fail the build. */
const squeeze = (bin, args, name) => {
  try {
    execFileSync(bin, args, { stdio: 'ignore' });
  } catch (e) {
    console.warn(`  note: ${name} unavailable, skipping (artifact will be slightly larger)`);
  }
};

function zipUp(html) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'index.html'), html);
  rmSync(ZIP, { force: true });
  writeZip(ZIP, [{ name: 'index.html', data: html }]);
  squeeze(ect, ['-9', '-zip', '-strip', ZIP], 'ect');
  squeeze(advzip, ['-z', '-4', '-q', ZIP], 'advzip');
  return statSync(ZIP).size;
}

if (DEV) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'index.html'), shell('', true));
  const ctx = await context({
    entryPoints: [SRC],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    outfile: join(OUT, 'b.js'),
    define: { DEV: 'true' },
    sourcemap: 'inline',
    logLevel: 'info',
  });
  await ctx.watch();
  const { hosts, port } = await ctx.serve({ servedir: OUT, host: '0.0.0.0', port: 8000 });
  console.log(`\n  PRISM LOOP dev  ->  http://localhost:${port}  (also ${hosts[0]}:${port})\n`);
} else {
  const raw = await bundle();
  const min = (await minify(raw, terserOpts)).code;

  // Roadroller wins on large payloads but loses on small ones (its decoder is
  // ~2KB of overhead). Zip both ways and keep whichever is actually smaller.
  const plainSize = zipUp(shell(min, false));
  copyFileSync(ZIP, ZIP + '.plain');

  const packed = await roadroll(min);
  const packedSize = zipUp(shell(packed, false));

  let size = packedSize;
  let how = 'roadroller';
  if (plainSize <= packedSize) {
    copyFileSync(ZIP + '.plain', ZIP);
    size = plainSize;
    how = 'terser only';
  }
  rmSync(ZIP + '.plain', { force: true });

  const pct = ((size / LIMIT) * 100).toFixed(1);
  const bar = '#'.repeat(Math.round((size / LIMIT) * 40)).padEnd(40, '.');
  console.log(`\n  raw ${raw.length}b -> min ${min.length}b -> packed ${packed.length}b`);
  console.log(`  [${bar}]`);
  console.log(`  ${size} / ${LIMIT} bytes  (${pct}%, ${LIMIT - size} left)  via ${how}\n`);
  if (size > LIMIT) {
    console.error(`  OVER BUDGET by ${size - LIMIT} bytes\n`);
    process.exit(1);
  }
}
