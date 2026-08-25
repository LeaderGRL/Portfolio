# JG-1500

A skeuomorphic CRT terminal portfolio. The chassis is composited from 3D
component renders; the screen is a live WebGL2 tube driven by a 480×360
character raster.

## Running it

Requires Node 18+ and Python 3 with `pillow numpy scipy`.

```bash
npm install
npm run assets
npm run dev
```

Then open http://localhost:5173. Editing anything in `content/` reloads the
screen.

Do not paste `#` comments after these commands on Windows: `cmd` passes the
`#` through and npm tries to install a package called `#`.

`npm run assets` generates `assets/build/`, which is gitignored. It is only
needed again when a file in `assets/src/` changes. On Windows it looks for
`py -3`, then `python`, then `python3` — `python3` alone resolves to a
Microsoft Store stub that prints a help message and exits successfully,
which makes the step look like it worked when it did nothing.

`assets/build/` is gitignored, so a fresh clone has no sprites until
`npm run assets` has been run once. After that it is only needed again when a
file in `assets/src/` changes.

```bash
npm run build      # dist/index.html — one self-contained file
npm run preview    # serve that build
npm test           # loads the build in jsdom and asserts on the DOM
```

`npm test` exists because the failures that reach production here are not
syntax errors — they are ReferenceErrors on code paths nothing walks until a
user does. It runs the built page in jsdom three times:

| Pass | What it proves |
|---|---|
| `smoke.mjs` | boots once (six keys, not twelve), every sprite resolves, every custom property the stylesheet needs is published, and each of the six routes renders without throwing |
| `smoke.mjs --gl` | with a WebGL2 context available the tube initialises and does **not** take the 2D fallback |
| `interactions.mjs` | every control, keyboard shortcut, scroll path and the responsive breakpoint, asserting on uncaught errors |

Each of those caught a real bug that had already shipped: a module booting
twice, `crt.js` using a constant it never imported, `list()` reading fields the
content adapter does not produce, and an unguarded `setPointerCapture`.

---

## Layout

```
content/            what the site says          ← you edit this
  site.json           identity, contact, model plate
  pages/*.md          about, resume, contact
  projects/*.md       one file per project
  articles/*.md       one file per article
  media/              images, inlined at build

src/                what the machine is
  core.js             constants, geometry, wrap()
  audio.js            synthesized panel foley — no audio files
  type.js             glyph atlas + 5×7 bitmap headline font
  terminal.js         cell buffer, scrolling document, rasteriser
  media.js            image/video → phosphor dither
  pages.js            one renderer per screen
  crt.js              WebGL2: persistence pass + composite shader
  panel.js            sprite-backed DOM controls
  app.js              router, boot sequence, RAF loop
  assets.js           generated sprite table
  style.css           layout only; material comes from the sprites

assets/src/         the component renders (source of truth)
assets/build/       generated sprites — gitignored, rebuild with npm run assets
tools/build_assets.py   the splitting pipeline
plugins/content.js  Markdown → typed blocks, at build time
```

---

## How a page works

**Not routes in the web sense, and not MDX.** Both would be the wrong shape
here, for the same reason: the screen is a canvas, not a DOM. There is no
element for a router to swap and nothing for MDX's component substitution to
substitute into. What exists is a 50×21 cell buffer and a rasteriser.

So the model is: **content is data, and a page is a function that lays that
data into cells.**

```
content/projects/frogbyte.md
        │
        │  plugins/content.js — parses once, at build time
        ▼
   typed blocks:  [{type:'prose',…}, {type:'image',…}, {type:'figure',…}]
        │
        │  src/pages.js — PAGES.detail walks the blocks
        ▼
   Terminal cell buffer (may be taller than the tube)
        │
        │  src/terminal.js — Rasteriser draws the visible window
        ▼
   480×360 canvas → WebGL texture → CRT shader → screen
```

Navigation is state, not URL: `app.js` holds `{route, cursor, item}` and calls
`render()`. Adding hash routing (`#/projects/frogbyte`) is a small change in
`app.js` and nothing else — the renderers do not know routes exist.

---

## Editing a project

Create `content/projects/my-thing.md`. It appears in the list automatically,
ordered by filename.

```markdown
---
title: MY THING
sub: One line under the headline
status: SHIPPED
year: 2026
stack: [Rust, WebGL]
link: https://github.com/you/my-thing
---

Ordinary paragraphs. Wrapped to the tube's width at render time, so do not
hard-wrap them yourself.

## A SECTION

- bullet
- another bullet

::image{src=bench.png alt="What it shows" rows=10}

::video{src=demo.mp4 loop rows=12}

::note
A boxed aside.
::
```

Front matter is `key: value`, with `[a, b, c]` for lists. Everything after the
closing `---` is the body.

### Blocks

| Block | Written as | Notes |
|---|---|---|
| paragraph | plain text | wrapped automatically |
| heading | `## TEXT` | rule drawn underneath |
| list | `- item` lines | |
| image | `::image{src= alt= rows= gain=}` | `rows` = height in cells |
| video | `::video{src= loop rows=}` | muted, autoplays |
| figure | `::figure{cols=A,B,C}` + body + `::` | the column diagram |
| note | `::note` + body + `::` | boxed aside |

A directive followed immediately by text takes a body and closes with `::`.
A directive followed by a blank line is self-closing.

### Adding a new block type

Two edits, and existing content keeps parsing:

1. add the name to `KNOWN_DIRECTIVES` in `plugins/content.js`
2. add a `case` to `PAGES.detail` in `src/pages.js`

An unregistered directive is a build error, not a blank space on the screen.

---

## Images and video

Both are dithered to the tube's four phosphor levels and go through the CRT
shader with everything else — curvature, scanlines, bloom, the lot. A
full-colour photograph pasted onto this screen would read as a photograph
pasted onto this screen; quantising it to the same ramp the text uses is what
makes it look like something the machine is displaying.

The dither is an 8×8 Bayer matrix rather than error diffusion. Floyd–Steinberg
gives a better still frame but boils on video, because a pixel sitting one
level from a threshold flips as the error front moves. A Bayer matrix is a
fixed function of position, so a pixel that does not change does not flicker.

- **Images** live in `content/media/` and are inlined as data URIs. The built
  page stays one file.
- **Video** lives in `public/media/` and ships alongside `index.html`. This is
  the one place the single-file promise bends: a clip worth showing is large
  enough that base64 is a bad trade.

`rows` sets the block height in character cells. `gain` (default 1.15) lifts
exposure before quantising — most source images are far brighter than a tube
ever gets.

---

## Scrolling

A page writes into a document that may be taller than the tube. `Terminal`
keeps the document and the window separate, so a renderer lays out everything
it has and never asks how much fits.

Wheel, `↑ ↓`, `PageUp/PageDown`, `Home/End`. The scrollbar is drawn as cells in
the right-hand column — a browser scrollbar floating over a CRT would give the
whole thing away.

---

## The chassis

The controls are not CSS. They are the component renders in `assets/src/`,
split by `tools/build_assets.py` into the pieces that have to move
independently:

| Render | Split into | Why |
|---|---|---|
| bezel | kept whole | its transparent aperture masks the picture |
| glass | shade map + gloss map | real optics over a live canvas |
| key | frame + cap | the cap travels, the frame does not |
| switch, slider | track + thumb | the thumb travels |
| power | housing + paddle + lamp | the paddle pivots in 3D |

The pipeline also writes `assets/build/meta.json`: aspect ratios, the bezel's
aperture, the cap's footprint, the paddle's footprint. `panel.js` publishes
those as CSS custom properties, so the stylesheet sizes every box from the
artwork's own proportions. Replace a render with a different version and the
layout follows it — there are no hand-typed dimensions to fall out of date.

CSS does layout, hit targets, state transitions and travel. It does not do
material. A gradient is a function of one axis; these are compound-curved
mouldings lit from a single source, and every attempt to approximate them in
CSS read as an approximation of a photograph rather than as an object.

---

## Shaders

`src/crt.js` carries three: a passthrough vertex shader, a phosphor
persistence pass (ping-pong FBO), and the composite.

The composite is deliberately small. It does not draw the tube's silhouette,
its specular, its Fresnel rim or its surround — the bezel's alpha channel and
the glass maps do all of that. What remains is only what has to be recomputed
every frame from live content: barrel geometry, beam, scanlines, aperture
grille, bloom, and the collapse to a line and a dot at power-off.

They are worth compiling before shipping — a broken shader gives a black
screen, not an error:

```
glslangValidator src/shaders/*.frag
```

---

## Known limits

- WebGL2 required; there is a 2D fallback path but it is plain.
- Video is not inlined (see above).
- Content is compiled at build time. A CMS would need the plugin replaced with
  a fetch and the parser moved to the runtime.
