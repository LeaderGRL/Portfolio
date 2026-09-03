# Adding rich projects

Rich projects live under `content/projects/<slug>/index.md` and use the shared document block vocabulary. The project runtime must never special-case a project id.

Recommended layout:

```text
content/projects/my-project/
├── index.md
└── assets/
    └── small-inline-image.webp

public/media/my-project/
├── hero.webp
├── gameplay.mp4
├── soundtrack.mp3
├── screenshot-01.webp
└── model.glb
```

Use `content/projects/<slug>/assets/` only for small document-local images that benefit from build-time inlining. Use `public/media/<slug>/` for streamed or substantial assets: video, audio, GLB, large GIFs and large image collections.

## Minimal project

```md
---
title: MY PROJECT
sub: One-line project description
status: COMPLETE
stack: [C++, Unreal Engine]
theme: synthwave
link: https://example.com
---

## THE PROJECT

A concise introduction.
```

## Editorial media

### Image

```md
::media{src="screenshot.webp" label="GAMEPLAY" alt="Gameplay screenshot" fit=contain height=280}
```

Use `fit=contain` whenever cropping would remove meaningful information. `media` blocks are inspectable: clicking or focusing their transparent interaction surface opens the source image in the CRT media viewer.

`background=off` removes the editorial panel behind transparent or poster-like artwork.

### Gallery

```md
::gallery{columns=2 fit=contain}
screenshot-01.webp | First view
screenshot-02.webp | Second view
::
```

Gallery cells use the same media inspector and can be browsed as one set.

### Compare

```md
::compare{before="before.webp" after="after.webp" beforeLabel="BEFORE" afterLabel="AFTER" fit=contain}
```

## Interactive media

### Local video

```md
::video{src="/media/my-project/gameplay.mp4" label="GAMEPLAY"}
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

Use `audio` for a soundtrack, music cue or sound-design example that should remain directly playable inside the CRT document.

```md
::audio{src="/media/my-project/theme.mp3" label="MAIN THEME" credit="SOUND DESIGNER · FULL TRACK"}
```

Interaction contract:

```text
click / Enter / Space   play or pause
physical VOLUME         controls audio volume
starting another track  pauses the previous track
browser tab hidden      pauses active audio
block leaves viewport   releases its playback surface
```

The player is a generic document capability, not project-specific UI. Full-length tracks are acceptable when they are web-compressed and intentionally published with the project. Audio starts with metadata-only preload, so several full tracks may appear in one document without eagerly downloading every payload. Prefer a short excerpt only when licensing, bandwidth or editorial intent requires one; do not truncate a track merely to satisfy the document renderer.

Do not ship uncompressed production masters such as large WAV exports when a high-quality web MP3/Opus encode communicates the same work. The runtime lifecycle is a safety net, not an excuse to ignore media size.

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
4. Local audio uses metadata-first loading, pauses competing tracks and releases its source when the inline surface is destroyed. Full tracks are fine when compressed for the web.
5. Cross-origin iframes use browser lazy loading and are mounted only while their block is visible.
6. Three.js animation only ticks while the model block is visible; runtime teardown disposes GPU resources explicitly.
7. Keep exported screenshots/WebP, web audio, video and GLB sizes appropriate for portfolio presentation; runtime lazy loading is not a substitute for asset optimization.

## Content rules

1. Curate from the exhaustive source material; do not dump an archive into the CRT.
2. Explain the project, verified contribution, decisions and trade-offs. Do not turn planning documents into claims about shipped features.
3. Prefer local raster/video/audio/3D when practical because the portfolio can control their lifecycle and presentation directly.
4. Keep filenames descriptive and asset ownership explicit.
5. Never add project-specific rendering/loading code. If behavior is reusable, implement it as a shared block or provider adapter.
6. Keep input predictable: ordinary wheel input must continue to scroll the project.
7. Validate both CRT ON and CRT OFF because they use different presentation paths.
8. For team projects, distinguish project architecture from personal authorship unless ownership is explicitly known.

## Validation rule

PENW, LEAK and ASTRO deliberately stress different shapes of project. A new engine capability should make sense across them without checking a project id. If a feature only works when the runtime knows which named project it is rendering, the abstraction is wrong.
