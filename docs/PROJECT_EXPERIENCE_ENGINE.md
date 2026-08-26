# Project Experience Engine

## Goal

Build one maintainable content engine capable of presenting very different portfolio projects — PENW, LEAK and future work — without project-specific JavaScript or CSS.

A project should normally require only Markdown, assets and already-registered generic blocks. If adding a project requires `src/<project>.js`, the architecture should be reconsidered.

## Core invariant

The JG-1500 has one physical CRT compositor for every local pixel source:

```text
terminal canvas ───────┐
document raster ───────┤
local image/video ─────┼─> DisplayPipeline -> FRAG_CRT -> photographic glass
local Three.js canvas ─┘
```

The relevant boundary is **local pixels vs cross-origin pixels**. Local text, images, video frames and Three.js canvases can be sampled by WebGL. YouTube, Sketchfab, Miro and other cross-origin iframes cannot; they are mounted inline below the photographic glass and receive compositor-level CRT optics.

## Runtime layers

```text
Markdown / content plugin
        |
        v
shared document schema
        |
        v
BlockRegistry -------------------- IntegrationRegistry
 |                                      |
 | text / media / composition           | video / iframe / 3D adapters
 v                                      v
ArticleRasteriser                 InlineIntegrationController
        |                                 |
        +------------ physical CRT -------+
```

Projects are data. Runtime modules must not branch on PENW or LEAK ids.

## Shared blocks

The authoring vocabulary includes:

```text
text       heading, prose, list, code, figure, note
media      image, video, media
layout     hero, facts, system, pipeline, gallery, compare, timeline
external   model3d, embed
```

`system` represents responsibilities or states that coexist. `pipeline` is reserved for an actual ordered process. Arrows are semantic, not decorative.

`media` is the large editorial image block. It supports `fit=cover|contain`, configurable height/gap, and `background=on|off`. `gallery`, `compare` and `media` share the same CRT image inspector.

## Interaction architecture

There is no second generic modal interaction system.

Local video, image inspection, local 3D and provider iframes are all owned by the inline/document layers:

- local video uses a transparent play/pause hotspot over the rasterised frame;
- image inspection temporarily owns `article-source`, remaining inside the physical CRT;
- local 3D keeps a detached Three.js render canvas and a transparent DOM input proxy;
- cross-origin providers mount inline only while their corresponding block is visible.

This removes an unnecessary competing visual state from the CRT pipeline.

## Local video lifecycle

User-started local video uses `preload="none"`. Playback is explicit and obeys the physical machine:

```text
click / keyboard  -> play / pause
VOLUME             -> media volume
POWER OFF          -> pause
project switch     -> pause
browser hidden     -> pause
return / power on  -> remain paused until user action
```

Autoplay loops are a special case: they must be muted and may opt into eager loading.

## Media loading policy

The engine avoids eagerly constructing a complete rich project in memory:

- large `media`, `gallery` and `compare` images request their asset on first visible paint;
- local user-started video uses `preload="none"`;
- remote iframes use `loading="lazy"` and are only mounted for visible blocks;
- local 3D animation ticks only while the model block intersects the CRT viewport;
- image decode results are cached in the document rasteriser;
- Three.js resources are disposed deterministically on runtime teardown.

Asset optimization still matters. Lazy loading is not a substitute for appropriately sized WebP, MP4/WebM and GLB files.

## Local 3D

`Local3DManager` uses Three.js `GLTFLoader` and `OrbitControls`. The model is auto-framed from its bounds and rendered to a detached canvas so every visible model pixel travels through the real CRT shader.

The DOM owns only input:

```text
drag          rotate
wheel         scroll document
Ctrl+wheel    zoom
double click  reset camera
```

The runtime disposes geometry, material, texture and renderer GPU resources when destroyed. Offscreen scenes do not tick their animation loop.

## Cross-origin integrations

Remote provider pixels cannot be copied into the CRT WebGL texture because of the browser cross-origin boundary. Their presentation is therefore:

```text
iframe -> inline integration surface -> CSS/SVG CRT optics -> glass
```

The `IntegrationRegistry` currently supports generic iframe, YouTube, Sketchfab, Miro, Google, local video and local 3D adapters.

YouTube remains scroll-first: a shield owns click/keyboard playback commands while ordinary wheel input continues to move the document. Sketchfab disables its own scroll-wheel zoom.

## Semantic mirror and long documents

`article-source` is visual-only. `article-reader` mirrors the document semantics and scroll footprint while remaining visually hidden behind the raster picture in CRT mode. `DocumentProgressOverlay` derives chapter progress from Markdown headings and paints it directly into the document framebuffer.

The semantic mirror must account for the same measured heights as the raster blocks or scroll positions diverge.

## Validation projects

### PENW / Project Echo: Neon Wave

PENW currently proves:

- local MP4 video through the real CRT path;
- physical volume control and playback lifecycle;
- local textured GLB through Three.js;
- hardware/input pipeline;
- level editor and full-width media;
- galleries, compare, configurable media backgrounds and CRT inspection;
- long-form timeline and chapter progress.

There is no PENW-specific runtime code.

### LEAK

LEAK stresses a very different project structure:

- ordered survival/information loop;
- Director Utility AI + Creature Behavior Tree represented as non-linear systems;
- movement/noise/distraction counterplay;
- inventory, flashlight and body-cam systems;
- diegetic audio decryption workflow;
- environment-production decisions;
- Skull optimization study;
- YouTube, Sketchfab and Miro fallbacks;
- development timeline and team process.

There is **no Leak-specific runtime code**. Until curated LEAK binary assets are versioned, the page intentionally uses existing external providers rather than inventing local paths.

## Graceful degradation

Optional capabilities fail independently:

```text
WebGL CRT unavailable -> direct source canvas
local image missing    -> loading/unavailable state, document remains readable
local 3D load fails    -> explicit unavailable state
remote iframe absent   -> surrounding document still scrolls
CRT effects OFF        -> direct document/media source without glass optics
```

## Testing contract

Static/DOM smoke tests lock the architecture around:

- one physical CRT output and one document framebuffer;
- absence of the old modal interaction layer;
- shared schema/block/provider registration;
- media inspector layering;
- configurable/lazy editorial media;
- local video play/pause, volume and lifecycle;
- lazy remote iframes;
- Three.js disposal and offscreen animation gating;
- PENW and LEAK both using the same engine.

The GitHub CI runs build plus the complete smoke suite on each pushed commit.

## Browser validation

A passing build is necessary but not sufficient. Before merge, manually exercise at least:

1. PENW desktop with CRT ON and OFF;
2. image inspection and return to the same scroll position;
3. local video play/pause, VOLUME and POWER OFF;
4. local 3D rotate/scroll/zoom/reset;
5. browser-tab background pause;
6. LEAK remote video, Skull viewer and Miro scrolling;
7. one mobile viewport for PENW and LEAK;
8. a long scroll from top to bottom looking for semantic/raster drift.

## Acceptance status

- [x] Projects require Markdown/data rather than project runtime modules.
- [x] PENW and LEAK share one schema and CRT document path.
- [x] Local image/video/3D pixels remain eligible for the real CRT shader.
- [x] Cross-origin integrations are inline and visibility-gated.
- [x] Image inspection remains inside the CRT.
- [x] Local video follows physical volume and power state.
- [x] Background browser tabs cannot leave local project video playing.
- [x] Large editorial media and external iframes have lazy-loading boundaries.
- [x] Three.js teardown disposes GPU resources.
- [x] Legacy generic interaction modal has been removed.
- [x] PENW has local MP4 and local GLB reference-quality paths.
- [x] LEAK can express its AI/gameplay/design structure without project-specific code.
- [ ] Curated local LEAK images/video/GLB are still to be versioned if/when those source assets are prepared.
- [ ] Final visual browser QA must still be performed on desktop and mobile before taking the PR out of Draft.

See `docs/ADDING_PROJECTS.md` for the authoring reference.
