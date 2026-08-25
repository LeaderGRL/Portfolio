# Project Experience Engine

## Goal

Build one maintainable content engine capable of presenting very different portfolio projects — PENW, LEAK, Frogbyte, Crossatro and future work — without project-specific JavaScript or CSS.

A new project should normally require only:

1. one Markdown document;
2. its assets;
3. optional use of already-registered generic blocks.

If adding LEAK after PENW requires `leak.js`, the architecture has failed.

---

## Core invariant

The JG-1500 has one physical CRT post-process for every local pixel source:

```text
terminal canvas ───────┐
article raster ────────┤
project raster ────────┼─> DisplayPipeline
local video frame ─────┤        |
local Three.js canvas ─┘        v
                              CRT
                               |
                               v
                     photographic glass
```

The important distinction is **local pixels vs. cross-origin pixels**, not articles vs. projects.

Local text, images, video frames and Three.js canvases can be sampled by WebGL and therefore receive the real `FRAG_CRT` pipeline.

Cross-origin iframes such as YouTube, Sketchfab and Miro cannot legally/safely be sampled into WebGL. They are mounted inline above the raster picture and below the photographic glass, with compositor-level CRT optics applied to make the transition visually coherent.

---

## Design principles

### 1. Projects are data, never implementations

Forbidden:

```js
if (project.id === 'penw') { ... }
if (project.id === 'leak') { ... }
```

Preferred:

```md
::facts{columns=2}
ENGINE | UNITY
ROLE | GAMEPLAY + SYSTEMS
::

::pipeline
INPUT | ROTARY ENCODER
GAME STATE | UNITY
FEEDBACK | SLIDER + CAMERA
::

::model3d{src=assets/cabinet.glb}
```

The current validation is deliberate: PENW and LEAK are both real rich project documents and neither has a runtime module.

### 2. Blocks own capabilities, not projects

The shared `BlockRegistry` currently provides the project/document vocabulary:

```text
text
├── heading
├── prose
├── list
├── code
├── figure
└── note

media
├── image
└── video

composition
├── hero
├── facts
├── pipeline
├── gallery
├── compare
└── timeline

integration
├── model3d
└── embed
```

A reusable block may provide:

- measurement/layout metadata;
- preload behavior;
- raster paint behavior;
- interaction metadata;
- disposal behavior;
- semantic mirror footprint.

If a future project needs a capability that another project could plausibly reuse, add a block. Do not branch on the project id.

### 3. Integrations are adapters

Provider-specific behavior lives in `IntegrationRegistry`, not project documents or the rasteriser.

```text
IntegrationRegistry
├── iframe
├── YouTube
├── Sketchfab
├── Miro
├── Google
└── local-3d
```

The document only declares intent:

```md
::embed{provider=youtube id=VIDEO_ID}
::embed{provider=sketchfab uid=MODEL_UID}
::embed{provider=miro src="..."}
```

### 4. Local 3D is preferred over remote 3D

When a redistributable local `.glb` is available, use `::model3d`.

`Local3DManager` currently:

- loads glTF/GLB with Three.js `GLTFLoader`;
- renders to a reusable transparent canvas;
- derives camera distance from the model bounding sphere and camera FOV;
- derives zoom limits from model scale;
- provides key/fill/rim lighting;
- provides a generic transparent contact shadow;
- uses OrbitControls for input;
- keeps the visible 3D pixels in the document raster -> real CRT path;
- disposes geometries, materials and textures when the document runtime is destroyed.

Use Sketchfab when the local model is unavailable, the public hosted model is itself useful, or Sketchfab-specific features matter.

### 5. Content, composition and display are separate

Content says what exists:

```md
::image{src=assets/cabinet.webp}
```

A block option says how that content is composed:

```md
::gallery{columns=2}
...
::
```

The physical display decides how the result is presented:

```text
normal JG-1500
fullscreen JG-1500
same document source
same CRT
```

Blocks must not create their own fullscreen architecture.

### 6. Long-form navigation is automatic

Projects and articles should not require authors to maintain a separate table of contents.

`DocumentProgressOverlay` derives chapters from Markdown headings and paints the navigation directly into the document raster:

- vertical progress rail;
- chapter markers;
- active chapter counter;
- active chapter label.

Because it is painted into the source canvas, this UI receives the real CRT shader too.

### 7. Graceful degradation is mandatory

Failure of one optional visual capability must not make the document disappear.

Examples:

```text
WebGL CRT unavailable   -> direct document source canvas
iframe displacement API -> neutral displacement map
local 3D load fails     -> readable 3D unavailable state
remote provider hidden  -> surrounding document remains scrollable
```

The document engine should degrade one capability at a time.

---

## Authoring model

Recommended project structure:

```text
content/projects/
└── my-project/
    ├── index.md
    └── assets/
        ├── hero.webp
        ├── gameplay.mp4
        ├── screenshot.webp
        └── model.glb
```

Legacy flat files such as `content/projects/frogbyte.md` remain supported during migration.

The content plugin resolves project-relative assets at build time. Authors should never add generated URLs to runtime JavaScript.

The detailed authoring reference lives in `docs/ADDING_PROJECTS.md`.

---

## Shared project primitives

### Facts

Compact project/system information without creating another prose section.

```md
::facts{columns=2 label="PROJECT SNAPSHOT"}
ENGINE | UNITY
ROLE | PROJECT LEAD + GAMEPLAY
PLATFORM | CUSTOM ARCADE CABINET
PERIOD | 2021 — 2023
::
```

### Pipeline

Generic connected flow for systems thinking.

```md
::pipeline{label="AI PRESSURE ARCHITECTURE"}
DIRECTOR AI | MONITORS MACRO PRESSURE
PRESSURE SIGNAL | GUIDES THREAT LOCATION
CREATURE AI | LOCAL SENSORS + BEHAVIOURS
PLAYER RESPONSE | HIDE + DIVERT + ESCAPE
::
```

The same primitive currently represents PENW hardware/input flow and LEAK Director/Creature AI flow. That is exactly the kind of reuse this architecture is aiming for.

### Gallery / compare / timeline

These blocks make visual iteration and chronology data-driven rather than project-specific layouts.

```md
::gallery{columns=2}
assets/a.webp | Prototype
assets/b.webp | Final
::

::compare{before=assets/a.webp after=assets/b.webp}

::timeline
2025-01 | Prototype
2025-04 | Production
::
```

---

## Cross-origin integration policy

### Why they do not use the real shader

The WebGL renderer cannot read arbitrary pixels from a cross-origin iframe. This is a browser security boundary, not a missing rendering trick.

Therefore:

```text
local asset / canvas
      -> real CRT shader

cross-origin iframe
      -> native inline compositor surface
      -> SVG/CSS CRT optics
      -> photographic glass
```

### Inline behavior

Remote integrations are mounted only while their corresponding document block is visible and are removed when it leaves the visible document region.

They are not hidden behind a generic `OPEN INTEGRATION` modal.

### YouTube

YouTube is intentionally **scroll-first**:

- a persistent transparent shield remains above the iframe;
- wheel always scrolls the document;
- click/keyboard toggles play/pause via the YouTube iframe `postMessage` API;
- raw iframe pointer input remains disabled;
- `enablejsapi=1` and `playsinline=1` are enabled.

This prevents playback from trapping the page scroll.

### Sketchfab

Sketchfab disables viewer wheel zoom by default (`scrollwheel=0`) so the document owns the wheel. Direct pointer manipulation can be temporarily activated by the inline interaction layer.

### CRT optics for native iframes

The compositor applies a lightweight approximation:

- SVG displacement map / `feDisplacementMap`;
- scanline overlay;
- RGB mask;
- vignette;
- subtle bloom/softening;
- photographic CRT glass remains above it.

If Canvas2D APIs needed to generate the displacement texture are unavailable, a neutral map is used and only displacement is dropped.

---

## Current real validation projects

### PENW / Project Echo: Neon Wave

PENW proves that the engine can represent:

- arcade/game metadata with `facts`;
- software + hardware as one project;
- physical input flow with `pipeline`;
- level-authoring flow with the same `pipeline` block;
- YouTube gameplay inline;
- Sketchfab cabinet inline;
- long timeline;
- future local cabinet GLB without changing runtime architecture.

There is **no PENW-specific runtime code**.

### LEAK

LEAK intentionally stresses a different shape of project:

- horror/gameplay metadata;
- survival loop with `pipeline`;
- Director AI + Creature AI architecture with the same block;
- body-cam/player systems as `facts`;
- optimization facts;
- multiple YouTube videos;
- Sketchfab model;
- Miro game-design board;
- development timeline.

There is **no Leak-specific runtime code**.

This is the current anti-overfit proof for the engine.

---

## Performance rules

1. Keep the document raster source at a controlled internal resolution.
2. Only visible remote integrations should remain mounted.
3. Local 3D should reuse one renderer/canvas per model source.
4. Pause or avoid expensive animation when rich blocks are offscreen where practical.
5. Cache decoded static image resources inside the document runtime.
6. Dispose Three.js geometries, materials and textures deterministically.
7. Do not create a per-project dependency graph.
8. Prefer optimized portfolio assets over loading presentation-export originals at runtime.

---

## Accessibility / interaction rules

- The raster source canvas is visual only.
- The hidden semantic document owns reading order and scroll range.
- Inline integration shields have keyboard-accessible activation behavior.
- YouTube remains scrollable while playing.
- Power OFF hides/tears down native interaction surfaces.
- No interaction may depend on an invisible control whose position does not match the visible raster.
- If a provider requires unusual behavior, solve it in a provider adapter, not a project page.

---

## Asset strategy

Each rich project has an `assets/README.md` migration manifest while old presentation exports are being curated.

Rules:

- use descriptive filenames;
- prefer WebP for static screenshots/photos;
- preserve GIF only when animation is informative;
- prefer local MP4/WebM over YouTube when the original file is available;
- prefer local GLB over Sketchfab when redistribution is appropriate;
- optimize before committing;
- never solve an asset problem with project-specific runtime code.

---

## Research notes

### Three.js

`GLTFLoader` is the official Three.js addon for glTF 2.0 and supports modern glTF extensions. Local GLB is therefore a good canonical format for interactive project assets.

Reference: https://threejs.org/docs/pages/GLTFLoader.html

### Sketchfab

The Sketchfab Viewer supports hosted 3D interaction and remains useful when the hosted model is the canonical artifact or a local redistributable model is unavailable.

References:
- https://sketchfab.com/developers/viewer
- https://sketchfab.com/developers/viewer/initialization
- https://sketchfab.com/developers/viewer/functions

---

## Acceptance criteria before merging

- [x] Basic project folder requires only Markdown + assets.
- [x] Runtime modules do not branch on PENW or LEAK ids.
- [x] Articles and projects share the same parsed block contract and CRT document path.
- [x] Unknown directives fail at build time.
- [x] Local images/video frames can remain under the real CRT shader.
- [x] Inline remote integrations preserve document scrolling.
- [x] YouTube playback does not capture document wheel scrolling.
- [x] Local Three.js architecture keeps 3D pixels in the real CRT path.
- [x] WebGL document fallback exists.
- [x] Power OFF hides native integration surfaces.
- [x] PENW can be authored with no PENW-specific runtime code.
- [x] LEAK can be authored with no Leak-specific runtime code.
- [x] npm lockfile includes the Three.js dependency for `npm ci`.
- [x] Smoke tests cover schema, integrations, 3D contract and both reference projects.
- [ ] Curated PENW binary assets are committed and referenced by the document.
- [ ] Curated LEAK binary assets are committed and referenced by the document.
- [ ] A real local GLB has been validated visually in-browser through `model3d`.
- [ ] Fullscreen document UX has been visually validated.

---

## Next implementation order

1. Validate current PENW + LEAK composition in the browser.
2. Migrate curated static media using the descriptive asset manifests.
3. Validate one real local GLB through `model3d`.
4. Add gallery/compare sections once those curated assets are versioned.
5. Tune project visual themes only through generic tokens/options.
6. Validate responsive/mobile project reading.
7. Validate fullscreen using the same document and CRT pipeline.
