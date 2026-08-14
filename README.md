# PRISM LOOP

A 3D unicorn flight game for **[js13kGames 2026](https://js13kgames.com/2026/)** — theme: *Unicorns and Rainbows*.
The entire game ships as a single zip of **13,312 bytes or less**, runs offline, and makes no network requests.

By **BeluBruh123**.

---

## The idea

The sky island has been drained of colour. You fly a unicorn whose horn trails a rainbow ribbon.

**When your trail crosses itself, everything inside the loop bursts back into colour.**

The catch: loop closure is judged on the **ground projection** of your trail. A rainbow shadow is painted on the
terrain beneath you, so the shape you are drawing is always readable from the chase camera — while altitude
stays free for dodging. *Your shadow draws the loop.*

- Loops score **superlinearly** — 1 gloom is 100, but 5 in one loop is 1500. Greedy wide arcs are the skill.
- Every loop **adds time**, so a good run keeps extending itself.
- **Thunderclouds** shear your ribbon back if you fly through one.
- Chain loops within 8 seconds to build a **combo multiplier**.

## Controls

| Input | Action |
|---|---|
| Mouse (pointer lock) | Steer |
| `A` / `D` or `←` / `→` | Turn |
| `W` / `S` or `↑` / `↓` | Pitch |
| `Space` / `Shift` (hold) | Hard bank — much tighter turn radius |
| `Esc` | Pause · `R` restart · `M` mute |

Desktop only, by design.

---

## Build

```bash
npm install
npm run dev     # esbuild dev server + watch  -> http://localhost:8000
npm run build   # production zip, prints size against the 13,312 byte limit

npm run browser # one-time: fetch the Chromium used by the two test harnesses
npm run shot    # headless smoke test + screenshots into shots/
npm run verify  # compliance check on the built zip (see below)
```

Windows, macOS and Linux are all supported. `dev` and `build` need nothing but Node —
paths go through `node:path` and the archive is written in-process by `tools/zip.mjs`,
so no `zip`/`unzip` binaries are required. The two optimisers (`ect`, `advzip`) ship
per-platform binaries, and the build degrades to a slightly larger artifact with a
warning rather than failing if either is unavailable.

`shot` and `verify` additionally need a Chromium, hence the one-time `npm run browser`.

`npm run build` fails with a non-zero exit code if the zip exceeds the limit, so the budget can never
silently slip.

`npm run verify` is the pre-submission gate. It unzips the built artifact into a clean directory, serves
*only* that directory, plays it in headless Chromium, and fails if any of these is untrue:

- the zip is within 13,312 bytes
- `index.html` is at the zip root
- no absolute URL appears anywhere in the payload
- the page issues zero external requests
- the game boots with no console or page errors

### How it fits in 13 KB

The source in `src/` is ordinary, fully commented ES modules — readability is never traded for bytes.
The size constraint applies only to the **built artifact**:

```
src/*.js  --esbuild-->  bundle  --terser-->  minified  --roadroller-->  packed
          --> inlined into one index.html --> zip -9 --> ect -9 --> advzip -z4
```

Nothing is downloaded at runtime. Every asset is generated in code at boot:

- **Textures** — a 64×64 grass tile and a 256×256 sprite atlas are drawn into an `OffscreenCanvas`
  with Canvas2D at startup. Zero image bytes shipped.
- **Geometry** — every mesh is procedural (`src/mesh.js`): a surface-of-revolution builder produces the
  spheres, cones, cylinders and crystals; the island is a hash-noise heightfield.
- **Audio** — synthesised through the Web Audio API, no samples.

## Layout

Five layers, each depending only on the ones above it — there are no import cycles.

```
src/
  main.js          boot, the frame loop, and the render order — the conductor only
  engine/          reusable and game-agnostic; nothing here knows about unicorns
    math.js        quaternions, mat4, value noise, seeded PRNG
    gl.js          WebGL2 core: programs, instanced meshes, ribbon strips
    atlas.js       procedural pixel-art textures + the UI font
    audio.js       Web Audio synthesis and the music scheduler
  world/           what the island *is*
    shaders.js     all GLSL: sky, terrain, objects, ribbon, paint stamps
    geometry.js    procedural primitives + the island heightfield
    paint.js       the colour-restoration framebuffer
  game/            the rules; no file here draws anything
    state.js       run state, scoring, persistence, event callbacks
    player.js      flight model and input
    entities.js    gloom, thunderclouds, particles
    trail.js       the trail, self-intersection, and loop closure
    run.js         start a run; per-frame orchestration
  render/          how the rules are drawn
    meshes.js      the shared mesh registry
    scenery.js     trees, flowers, clouds
    actors.js      gloom, thunderclouds, sparks
    unicorn.js     the player model
    ribbon.js      trail -> the airborne strip and its ground shadow
  ui/              canvas UI; no HTML is used anywhere
    draw.js        text, rects, world-to-screen projection
    screens.js     HUD, title, pause, game over
```

`game/` is deliberately free of rendering, and `render/` is free of rules: the loop-closure
logic in `game/trail.js` can be reasoned about — or unit tested — without a GL context.

## Licence

MIT — see [LICENSE](LICENSE).
