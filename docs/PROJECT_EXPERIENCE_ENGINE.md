# Project Experience Engine

## Goal

Build one maintainable content engine capable of presenting very different portfolio projects — PENW, Leak, Frogbyte, Crossatro and future work — without project-specific JavaScript or CSS.

A new project should normally require only:

1. one Markdown document;
2. its assets;
3. optional use of already-registered generic blocks.

If adding `Leak` after `PENW` requires `leak.js`, the architecture has failed.

---

## Core invariant

The JG-1500 has one physical display pipeline:

```text
Document / app / media source
          |
          v
      pixel source
          |
          v
       CRT shader
          |
          v
photographic shade + glass
```

Native integrations that cannot be sampled by WebGL (cross-origin iframe providers such as Sketchfab, Miro, YouTube and Google tools) temporarily use a native interaction surface below the photographic glass. Their normal/document state is represented by a raster preview that goes through the real CRT shader.

Local video, images, animated images and local WebGL canvases should stay in the real CRT pipeline whenever possible.

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
::gallery{layout=masonry}
...
::

::model3d{src=arcade.glb}

::embed{provider=miro src="..."}
```

### 2. Blocks own capabilities, not projects

Every block type is registered once and can be reused by every document.

```text
BlockRegistry
├── prose
├── heading
├── image
├── video
├── code
├── gallery
├── hero
├── timeline
├── compare
├── model3d
└── embed
```

Each block may provide:

- layout metadata;
- raster rendering;
- native interaction behavior;
- preload/disposal hooks;
- accessibility description.

### 3. Integrations are adapters

```text
IntegrationRegistry
├── GenericIframeAdapter
├── SketchfabAdapter
├── YouTubeAdapter
├── MiroAdapter
└── GoogleEmbedAdapter
```

Provider-specific code never belongs in project documents or the main renderer.

### 4. Local 3D is preferred over remote 3D

When a project has a local `.glb`, load it with Three.js / `GLTFLoader` and render it into a local canvas so the complete 3D scene can pass through the real CRT shader.

Use Sketchfab when:

- the source model is unavailable locally;
- annotations/material configurators from Sketchfab are valuable;
- the hosted model is the canonical artifact.

The PENW archive contains `borne_arcade.glb`, so PENW should validate the local `model3d` path first. Sketchfab remains a second supported adapter.

### 5. Content, layout and theme are separate

Content says *what* exists.

```md
::image{src=cabinet.webp}
```

Layout says *how the block occupies the document*.

```md
::gallery{layout=filmstrip}
```

Theme changes a constrained set of visual tokens, never component structure.

```yaml
theme: synthwave
```

No `.penw-special-*` or `.leak-special-*` CSS selectors.

### 6. Graceful degradation is mandatory

Every interactive block needs a non-interactive representation.

```text
model3d      -> poster / generated preview
sketchfab    -> poster + OPEN 3D
miro         -> labelled preview + OPEN BOARD
youtube      -> poster + PLAY
video        -> first frame / poster
```

No blank space if a provider is unavailable.

### 7. Fullscreen is a display concern

Blocks must not implement their own fullscreen layout. The same document viewport and CRT pipeline resize together.

---

## Proposed runtime architecture

```text
src/document/
├── document-engine.js
├── document-controller.js
├── document-layout.js
├── document-rasteriser.js
├── block-registry.js
├── integration-registry.js
│
├── blocks/
│   ├── text.js
│   ├── image.js
│   ├── video.js
│   ├── code.js
│   ├── hero.js
│   ├── gallery.js
│   ├── timeline.js
│   ├── compare.js
│   ├── model3d.js
│   └── embed.js
│
└── integrations/
    ├── iframe.js
    ├── sketchfab.js
    ├── youtube.js
    ├── miro.js
    └── google.js
```

The first implementation does not need every file immediately. This hierarchy defines module boundaries and ownership so the implementation can grow without turning into one giant switch statement.

---

## Document model

A parsed document is provider-neutral data:

```js
{
  id: 'penw',
  kind: 'project',
  meta: {
    title: 'PROJECT ECHO: NEON WAVE',
    year: '2023',
    stack: ['Unity', 'C#', 'Arduino'],
    theme: 'synthwave'
  },
  blocks: [
    { type: 'hero', ... },
    { type: 'prose', ... },
    { type: 'gallery', ... },
    { type: 'model3d', ... }
  ]
}
```

Articles and projects should eventually consume this same document model. `kind` changes defaults and navigation, not the rendering architecture.

---

## Authoring DSL

Keep the current directive syntax and extend it instead of introducing MDX/React-specific authoring.

### Hero

```md
::hero{media=hero.gif eyebrow="ARCADE RHYTHM GAME" fit=cover}
```

### Gallery

```md
::gallery{layout=filmstrip columns=3}
image-a.webp | Early visual research
image-b.webp | Character iteration
image-c.webp | Final direction
::
```

### Timeline

```md
::timeline
2021-10 | Prototype started
2022-03 | Level editor
2023-02 | Arcade hardware integration
::
```

### Comparison

```md
::compare{before=background-v1.gif after=background-v3.gif label="Visual evolution"}
```

### Local 3D

```md
::model3d{
  src=borne_arcade.glb
  poster=cabinet.webp
  label="ARCADE CABINET"
  environment=studio
  autospin=0.15
}
```

### Sketchfab

```md
::embed{
  provider=sketchfab
  uid=d1fa122dc2d4447a949b151b83e7df02
  poster=cabinet.webp
  label="INTERACT WITH CABINET"
}
```

### Other remote providers

```md
::embed{provider=youtube id=gchRNrRPOwI poster=gameplay.webp}
::embed{provider=miro src="..." poster=design-board.webp}
```

---

## Project folder convention

Target convention:

```text
content/projects/
├── penw/
│   ├── index.md
│   └── assets/
│       ├── arcade-cabinet.glb
│       ├── hero.gif
│       ├── gameplay.webp
│       └── ...
├── leak/
│   ├── index.md
│   └── assets/
└── frogbyte/
    ├── index.md
    └── assets/
```

The content plugin resolves relative project assets at build time. Authors should never need to manually copy generated URLs into JavaScript.

---

## Media strategy

### Images

- preserve alpha;
- preserve aspect ratio unless the block explicitly requests cropping;
- allow responsive intrinsic layout;
- rasterize through the CRT.

### Animated GIF/WebP

Decode through browser image/media APIs and refresh the source canvas while visible. Avoid permanent animation loops for offscreen blocks.

### Video

Prefer local video for hero/gameplay because local frames can be rasterized through the real CRT shader. Remote YouTube is an interaction adapter and should have a CRT preview state.

### 3D

Local `.glb` is rendered by Three.js into a dedicated provider canvas. The document engine treats that canvas like any other raster source. Dispose geometries, materials and image bitmaps when the block/document is destroyed; Three.js notes that glTF image bitmaps require explicit cleanup when no longer referenced.

### Remote iframes

Never attempt to copy cross-origin iframe pixels into WebGL. Use a preview state + explicit native interaction state.

---

## Performance rules

1. Only visible or near-visible rich blocks may actively render.
2. Pause videos and 3D animation when outside the viewport.
3. Lazy initialize remote iframe providers only after explicit interaction.
4. Do not instantiate Sketchfab on page load for every model.
5. Keep the document raster source at a controlled resolution; fullscreen changes output resolution independently.
6. Cache decoded static image resources across documents.
7. Provide deterministic disposal hooks for 3D, video and iframe providers.
8. Avoid a per-project dependency graph.

---

## Accessibility / interaction rules

- The raster canvas is visual only.
- Semantic content remains available to assistive technology.
- Interactive providers always have a visible explicit trigger.
- Escape closes the active integration before navigating away.
- Power OFF closes native integrations immediately.
- Keyboard and pointer behavior must not depend on invisible hit targets.

---

## PENW validation matrix

PENW should prove these generic capabilities:

- animated hero;
- image gallery;
- transparent images;
- long-form text;
- local video;
- local GLB model viewer;
- optional Sketchfab fallback;
- blueprint image;
- timeline;
- comparison block.

No PENW-specific runtime code is allowed.

---

## Leak validation matrix

Leak should prove the engine is not overfit to PENW:

- dark/cinematic theme tokens;
- environment gallery;
- YouTube adapter;
- Sketchfab or local 3D asset;
- Miro adapter;
- external document/embed adapter;
- technical/AI diagrams;
- long-form project text.

Again: no Leak-specific runtime code.

---

## Research notes

### Three.js

`GLTFLoader` is the official Three.js addon for glTF 2.0 and supports modern glTF extensions including Draco, Meshopt, KTX2 and WebP. Local GLB is therefore a good canonical 3D format for project assets.

Official reference: https://threejs.org/docs/pages/GLTFLoader.html

### Sketchfab

The Sketchfab Viewer API supports programmatic viewer initialization and control. Useful capabilities include camera control, events and screenshots. `autostart`, `autospin`, annotations and other behavior can be configured. Some UI-hiding options depend on paid Sketchfab plans, which is another reason local GLB should be preferred when available.

Official references:
- https://sketchfab.com/developers/viewer
- https://sketchfab.com/developers/viewer/initialization
- https://sketchfab.com/developers/viewer/functions

---

## Acceptance criteria before merging

- [ ] Adding a basic project requires only Markdown + assets.
- [ ] No project id/name is referenced by runtime modules.
- [ ] Article and project content share the same parsed block contract.
- [ ] Unknown directives fail at build time with actionable errors.
- [ ] Every interactive block has a raster fallback.
- [ ] Local images/video/3D can remain under the real CRT shader.
- [ ] Remote embeds initialize only on explicit interaction.
- [ ] Power OFF closes all native integrations.
- [ ] Fullscreen does not require block-specific code.
- [ ] PENW can be authored without project-specific JavaScript.
- [ ] Leak can be authored without project-specific JavaScript.
- [ ] Smoke tests verify the block registry and at least one representative project document.

---

## Implementation order

1. Generalize article raster/interaction concepts into document-level services.
2. Add a declarative `BlockRegistry` and `IntegrationRegistry`.
3. Extend parser with `hero`, `gallery`, `timeline`, `compare`, `model3d` while preserving existing blocks.
4. Route project detail through the document engine.
5. Build PENW using only generic blocks.
6. Build Leak using the same blocks; add a generic capability only when genuinely missing.
7. Add local Three.js GLB integration.
8. Add Sketchfab and other iframe adapters.
9. Polish transitions/themes/fullscreen after the architecture survives both projects.
