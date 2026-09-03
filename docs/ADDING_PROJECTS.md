# Adding a rich project

The project engine is designed so a new portfolio project should require content and assets, not runtime JavaScript or project-specific CSS.

## Recommended structure

```text
content/projects/my-project/index.md
public/media/my-project/
├── hero.webp
├── gameplay.mp4
├── soundtrack-preview.mp3
├── screenshot-01.webp
└── model.glb
```

Use `content/projects/<slug>/assets/` only for small document-local images that benefit from build-time inlining. Use `public/media/<slug>/` for streamed or substantial assets: video, audio, GLB, large GIFs and large image collections.

## Minimal project

```md
---
title: MY PROJECT
sub: One sentence explaining why it matters
status: UNITY · C#
year: 2026
stack: [Unity, C#]
---

::facts{columns=2 label="PROJECT SNAPSHOT"}
TYPE | GAME / TOOL / SYSTEM
ENGINE | UNITY
ROLE | GAMEPLAY + SYSTEMS
YEAR | 2026
::

## THE PROJECT

Explain the problem, your contribution and the interesting engineering decisions.
```

If you are about to create `src/my-project.js`, stop and ask whether the missing behavior belongs in a reusable block or provider adapter.

## Blocks

### Project facts

```md
::facts{columns=2 label="PROJECT SNAPSHOT"}
ENGINE | UNITY
ROLE | PROJECT LEAD + GAMEPLAY
PLATFORM | CUSTOM HARDWARE
PERIOD | 2021 — 2023
::
```

Use `facts` for compact metadata and measured facts.

### System overview

```md
::system{columns=2 label="AI SYSTEM"}
DIRECTOR AI | MONITORS PACING AND GLOBAL PRESSURE
CREATURE AI | OWNS LOCAL PERCEPTION AND DECISIONS
PERCEPTION | HEARING, SIGHT AND PLAYER EVIDENCE
SEARCH STATE | INVESTIGATES WITHOUT PERFECT INFORMATION
::
```

Use `system` when items coexist. Avoid decorative flowcharts: arrows imply causality or sequence.

### Sequential pipeline

```md
::pipeline{label="INPUT LOOP"}
PHYSICAL INPUT | BUTTONS + ROTARY ENCODERS
INPUT BRIDGE | HARDWARE SIGNAL
GAME STATE | UNITY INPUT SYSTEM
PLAYER FEEDBACK | SLIDER + CAMERA RESPONSE
::
```

Use `pipeline` only when ordering is meaningful. If rows can be rearranged without changing the meaning, use `system`, `facts` or prose instead.

### Hero

```md
::hero{media=/media/my-project/hero.webp eyebrow="SYSTEM" title="PROJECT TITLE" subtitle="Short pitch"}
```

Only use a hero when there is useful visual media.

### Image

```md
::image{src=/media/my-project/screenshot.webp alt="Gameplay screenshot"}
```

### Full-width media

`media` is the preferred editorial block for a large screenshot, plan, waveform or key visual. It is clickable and opens in the CRT media inspector.

```md
::media{src=/media/my-project/editor.webp label="LEVEL EDITOR" fit=contain height=286}
```

Options:

- `fit=cover` fills the media well and may crop;
- `fit=contain` preserves the whole image;
- `height=150..340` controls the visual height;
- `gap=12..48` controls breathing room after the block;
- `background=on` is the default near-black media well;
- `background=off` removes that well for imagery that should sit directly on the document background.

Use `background=off` deliberately; technical plans and narrow images are usually easier to read with the dark well enabled.

### Gallery

```md
::gallery{columns=2 fit=contain}
/media/my-project/shot-01.webp | Prototype
/media/my-project/shot-02.webp | Final result
::
```

Gallery cells are also inspectable inside the CRT. `background=off` is available but the dark well is the default.

### Before / after

```md
::compare{before=/media/my-project/old.webp after=/media/my-project/final.webp beforeLabel="PROTOTYPE" afterLabel="FINAL" fit=contain}
```

### Local video

Prefer local video when you own the source because its frames are copied into `article-source` and therefore receive the real CRT shader.

```md
::video{src="/media/my-project/gameplay.mp4" alt="Gameplay demo"}
```

Interaction contract:

```text
click / Enter / Space   play or pause
physical VOLUME         controls video volume
POWER OFF               pauses video
project/document switch pauses video
browser tab hidden      pauses video
return to page           does not auto-resume
```

User-started local videos use `preload="none"`; the browser begins loading when playback is explicitly requested. Autoplay loop media is the exception and may request eager loading while remaining muted.

### Local audio

Use `audio` for a soundtrack excerpt, music cue or sound-design example that should remain directly playable inside the CRT document.

```md
::audio{src="/media/my-project/theme-preview.mp3" label="MAIN THEME" credit="SOUND DESIGNER · 12 S WEB PREVIEW"}
```

Interaction contract:

```text
click / Enter / Space   play or pause
physical VOLUME         controls audio volume
starting another track  pauses the previous track
browser tab hidden      pauses active audio
block leaves viewport   releases its playback surface
```

The player is a generic document capability, not project-specific UI. Keep soundtrack previews deliberately small: enough material to communicate the musical identity, but not an uncompressed archive of full production masters.

### YouTube

```md
::embed{provider=youtube id=VIDEO_ID label="GAMEPLAY" title="Gameplay demo"}
```

Use YouTube when the original local file is unavailable or the hosted player is itself useful. The iframe is mounted only while its document block is visible. Its shield keeps wheel scrolling attached to the document while click/keyboard controls playback through the iframe API.

### Local 3D model

```md
::model3d{src=/media/my-project/model.glb label="EXPLORE THE MODEL" autospin=0.08}
```

The GLB is rendered by Three.js to a detached canvas, then copied into the document framebuffer. Only a transparent input proxy exists in the DOM, so the model pixels remain inside the real CRT post-process.

```text
drag             rotate
wheel            scroll document
Ctrl + wheel     zoom / unzoom
double click     reset camera
```

The runtime pauses model animation while its block is offscreen and deterministically disposes geometries, materials, textures and the renderer when the document runtime is destroyed.

### Sketchfab

```md
::embed{provider=sketchfab uid=MODEL_UID label="MODEL" title="3D model"}
```

Use this fallback when a redistributable local GLB is unavailable or Sketchfab-specific features matter. Sketchfab wheel zoom is disabled so the surrounding document remains scrollable.

### Miro / generic embeds

```md
::embed{provider=miro src="https://miro.com/app/live-embed/..." label="DESIGN BOARD" title="Design board"}
::embed{provider=iframe src="https://example.com/embed" label="INTERACTIVE TOOL" title="Interactive tool"}
```

Cross-origin pixels cannot be sampled by the WebGL CRT, so external iframes are mounted below the photographic glass with compositor-level CRT optics. They are lazy and visibility-gated rather than hidden behind a second modal architecture.

### Timeline

```md
::timeline
2025-01 | First prototype
2025-03 | Core system complete
2025-06 | Production version
::
```

### Note

```md
::note
A short engineering takeaway.
::
```

## Media performance policy

Rich documents can become expensive quickly. Follow these rules:

1. Put substantial binary media under `public/media/<slug>/` so Vite serves it independently from the JS bundle.
2. Large `media`, `gallery` and `compare` images are loaded on their first visible CRT paint rather than during full-document layout.
3. Local user-started videos use `preload="none"` and never continue playing after POWER OFF, document replacement or browser backgrounding.
4. Local audio uses metadata-first loading, pauses competing tracks and releases its source when the inline surface is destroyed.
5. Cross-origin iframes use browser lazy loading and are mounted only while their block is visible.
6. Three.js animation only ticks while the model block is visible; runtime teardown disposes GPU resources explicitly.
7. Keep exported screenshots/WebP, compressed audio previews and GLB sizes appropriate for portfolio presentation; runtime lazy loading is not a substitute for asset optimization.

## Content rules

1. Curate from the exhaustive source material; do not dump an archive into the CRT.
2. Explain your contribution, decisions and trade-offs. Visuals support the engineering story.
3. Prefer local raster/video/audio/3D when practical because the portfolio can control their lifecycle and presentation directly.
4. Keep filenames descriptive and asset ownership explicit.
5. Never add project-specific rendering/loading code. If behavior is reusable, implement it as a shared block or provider adapter.
6. Keep input predictable: ordinary wheel input must continue to scroll the project.
7. Validate both CRT ON and CRT OFF because they use different presentation paths.

## Validation rule

PENW, LEAK and ASTRO deliberately stress different shapes of project. A new engine capability should make sense across them without checking a project id. If a feature only works when the runtime knows which named project it is rendering, the abstraction is wrong.
