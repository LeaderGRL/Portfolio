# JG-1500

A skeuomorphic CRT portfolio built as one physical display with multiple pixel
sources. Terminal screens and long-form project/article documents feed the same
WebGL CRT pipeline, so text, code, images, video frames and local 3D renders all
share the tube's curvature, persistence, scanlines and phosphor treatment.

The surrounding chassis is composited from authored component renders. CSS owns
layout, interaction and responsive behavior; material, moulding and lighting
come from the source renders.

## Development

Requires Node 22+ and Python 3 with `pillow`, `numpy` and `scipy`.

```bash
npm install
npm run assets
npm run dev
```

`npm run assets` generates `assets/build/` from `assets/src/`. The generated
folder is gitignored, so it must be created once after a fresh clone and again
whenever the chassis source renders change.

On Windows the asset launcher tries `py -3`, then `python`, then `python3`.
Avoid appending shell-style `# comments` to npm commands in `cmd.exe`.

## Production and tests

```bash
npm run build          # dist/index.html + dist/nginx.conf
npm run preview        # preview the production Vite output
npm run test:runtime   # jsdom/runtime/schema/navigation/SEO regression suite
npm run test:e2e       # Playwright: Chromium, Firefox, WebKit and mobile
npm run audit:assets   # writes tmp/asset-audit.json
npm test               # production build + runtime suite
```

GitHub Actions additionally installs the real Playwright browser engines, runs
Axe accessibility checks, validates the generated Nginx configuration with
`nginx -t`, and retains Playwright traces/screenshots/video when a browser test
fails. Feature branches are tested through `pull_request`; production image
publishing happens only after a successful push to `master`.

## Repository layout

```text
content/
  site.json                 identity, contact and machine metadata
  pages/*.md                ABOUT / RESUME / CONTACT content
  projects/*.md             project documents
  projects/*/index.md       project documents with local media
  articles/*.md             long-form articles

src/
  app.js                    navigation state, History API, boot, single RAF
  navigation.js             URL serialization and runtime document metadata
  terminal.js               terminal cell buffer and raster source
  crt.js                    WebGL2 persistence/composite CRT
  display-pipeline.js       selects terminal/document pixels for the same CRT
  article-crt-bridge.js     explicit ArticleCRTRuntime adapter
  article-rasteriser.js     long-form document -> CRT pixel source
  article-reader.js         semantic/native long-form DOM mirror
  document/                 typed rich-block renderers and integrations
  panel.js                  physical controls and chassis behavior
  runtime-controls.js       touch/hit-area behavior
  semantic-focus.js         visible CRT proxy for semantic keyboard focus
  fullscreen-softkeys.js    on-glass navigation row while the chassis is away
  style.css                 authored desktop/compact panel geometry
  release-fixes.css         full-bleed compact material + focus presentation
  fullscreen.css            full-screen glass layout and raster registration

assets/src/                 source chassis/component renders
assets/build/               generated sprites, gitignored
public/media/               runtime video/media files
plugins/content.js          Markdown/front matter -> typed document bundle
tools/                      asset, smoke, audit and SEO build tooling
```

## Navigation

The portfolio uses real browser URLs and the History API:

```text
/
/about
/resume
/projects
/projects/:id
/articles
/articles/:id
/contact
```

`src/navigation.js` maps those URLs to the CRT runtime state and keeps browser
Back/Forward working. Invalid document IDs fall back to their collection route.
Keyboard navigation remains available on desktop (`1-5`, arrows, Enter,
Escape/Backspace), while compact/coarse-pointer layouts can select project and
article rows directly on the CRT.

## Full screen

The aperture is small by design, so the panel carries a FULL SCREEN switch
(shortcut `F`) next to CRT EFFECTS. It is an accessibility mode: the glass
fills the viewport and the chassis is set aside. The terminal keeps a proportional
cell grid on a continuous phosphor surface, without a 4:3 backing rectangle or
black bands. Articles and projects reflow into a readable column (15–20 CSS px
body text); images retain their aspect ratio. Canvas sources and persistence
textures render at viewport resolution rather than enlarging 480x360 pixels.
Density is capped at 2x, 4096 pixels per dimension and 8 megapixels to bound GPU
memory, and reduced further when the active GPU reports a smaller texture,
renderbuffer or viewport limit. Framebuffer/source allocation is checked;
failure releases the GL resources and exposes the live 2D canvas instead of a
black screen. Fullscreen uses the original CRT bloom, curvature, grille, phosphor
persistence and diffuse shading. The photographic reflection is hidden only
in fullscreen: its curved streak belongs to the physical bezel, not a
borderless viewport, and would obscure article headings on portrait screens.
Scanlines retain the tube's beam count independently of the sharper source;
the desk optics stay intact, and CRT OFF still provides a neutral display.

While the chassis is away a softkey row along the bottom of the glass carries
the six sections, BACK, ENTER and EXIT FULL SCREEN, so pointer and touch users
keep navigating. `Escape` leaves full screen first and only then means BACK.
Native browser full screen is requested on top when available; the layout
never depends on it (iOS Safari has no element full screen and still gets
the enlarged tube), and leaving native full screen through the browser
returns the chassis.

Focus moves to EXIT on entry and returns to the triggering control on exit.
The document retains its normalized reading position across entry, exit,
window resizing and orientation changes, including CRT-off and WebGL fallback
rendering. Reflow restores progress from the previous raster geometry, not an
old pixel offset divided by the browser's already-updated scroll range.
`Backspace` remains BACK within full screen; browser shortcuts such as `Ctrl+F`
are not intercepted. A refused or delayed native request cannot strand the
browser in a different layout state; legacy WebKit's void-returning request
settles on its change/error event. Navigation and the progress footer each
reserve space below the document so they cannot cover its last visible lines.
Media inspection uses the same high-resolution source as the fullscreen article.

## Display architecture

There is deliberately **one physical CRT**, not a DOM article with a fake CRT
overlay.

```text
terminal screens
    -> Terminal/Rasteriser -----------\
                                       -> DisplayPipeline -> CRT WebGL -> #gl
long-form documents                    /
    -> ArticleRasteriser -> article-source
```

`App` owns the persistent animation frame. `ArticleCRTRuntime` plugs into that
scheduler through explicit `frame()`, `paint()` and `handleBack()` methods; it
does not monkey-patch App methods and does not create a second perpetual RAF.

### Long-form documents

Projects and articles are parsed into typed blocks at build time. Their visible
pixels are painted by `ArticleRasteriser` into `article-source`, then processed
by the same CRT shader as terminal text.

A synchronized `ArticleReader` DOM mirror exists for semantic structure,
scrolling, links and native media behavior. That surface is visually transparent
while document pixels are shown through the CRT. When keyboard focus enters a
semantic control, `semantic-focus.js` projects a visible focus rectangle back
onto the physical CRT.

Local Three.js scenes render off-DOM and are sampled into the article raster.
If WebGL creation fails, document rendering continues with an authored poster or
static fallback. Cross-origin embeds cannot legally be copied into a canvas, so
they are mounted inline below the photographic glass layers and receive a
matching CRT optics treatment.

## Editing a project or article

Create a Markdown document under `content/projects/` or `content/articles/`.
A project may also use a directory with an `index.md` when it owns local assets.

```markdown
---
title: MY SYSTEM
sub: Performance-oriented runtime architecture
status: RUST · SYSTEMS
year: 2026
stack: [Rust, WebGL]
link: https://github.com/example/project
---

Ordinary prose.

## MEMORY LAYOUT

- Archetype storage
- Cache-aware iteration

::image{src=layout.webp alt="Archetype memory layout" rows=10}

::video{src=demo.mp4 rows=12}
```

Front matter is parsed by `plugins/content.js`; the document body becomes typed
blocks registered in `src/document/schema.js`. Unknown directives are build
errors instead of silently disappearing.

Rich directives include the ordinary prose/heading/list/code/image/video/note
blocks plus project-specific blocks such as facts, systems, pipelines,
galleries, timelines, comparisons, local 3D models and external embeds. Add a
new directive to the shared document schema and provide its raster/semantic
renderer rather than adding a legacy `PAGES.detail` case.

## Media

Local images that participate in authored documents may be inlined by the
content plugin. Large videos live in `public/media/` and are loaded as runtime
files rather than being converted to base64. Media that is painted into the CRT
uses the same phosphor-oriented rendering rules as the rest of the document.

`npm run audit:assets` is non-destructive. It reports media/source totals,
unreferenced candidates, exact duplicates and the largest files to
`tmp/asset-audit.json`; a candidate should be verified before deletion because
some source renders are consumed indirectly by the asset builders.

## Responsive chassis

Desktop uses the authored 1920×1080 chassis geometry. Compact layouts use the
941×1672 portable geometry with a `contain` scale so controls such as POWER are
never cropped. The functional machine therefore keeps its authored proportions,
while the surrounding chassis material extends independently to the viewport so
mobile and tablet screens do not expose a visually unrelated letterbox area.

## SEO and deep links

Runtime navigation updates `title`, description, Open Graph and canonical tags
for normal SPA transitions. Social crawlers also need those values in the HTML
response before JavaScript executes.

`npm run build` therefore generates `dist/nginx.conf` from the Markdown front
matter. The production Nginx config maps each known URL to a title, description
and Open Graph type, then substitutes those values into the initial HTML
response. Canonical and `og:url` values are built from the incoming scheme,
host and normalized `$uri`, so tracking query parameters are excluded.

The Docker production stage copies this generated configuration rather than the
source template.

## Accessibility

The chassis controls expose native/ARIA semantics and minimum coarse-pointer hit
areas. CONTACT destinations are real links. Long-form rich blocks have semantic
DOM representations even though their visible pixels are rasterized through the
CRT. Generic imported image descriptions are contextualized from their current
article section for the semantic reader.

Playwright runs Axe across representative terminal, collection and long-form
routes. Keyboard focus entering the transparent semantic document is mirrored by
a visible CRT focus proxy.

## CRT and fallback behavior

`src/crt.js` implements the passthrough vertex stage, phosphor persistence and
composite CRT shader. WebGL2 is preferred for the physical display. The main
terminal has a 2D fallback, and local Three.js document blocks fail gracefully
without taking down the article.

The composite shader is responsible for effects that depend on live pixels;
photographic bezel/glass assets remain responsible for the physical surround,
faceplate shading and highlights.

## Deployment

The Docker build:

1. installs Node/Python dependencies;
2. regenerates chassis assets;
3. builds the Vite bundle and route-aware Nginx config;
4. runs runtime regressions against that exact output;
5. copies only `dist/` plus the generated Nginx config into the production
   Nginx image.

Nginx retains SPA fallback behavior for deep links, so opening a project or
article URL directly loads the portfolio and restores the correct runtime state.
