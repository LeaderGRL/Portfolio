# Adding a rich project

The project engine is designed so a new portfolio project should require content and assets, not runtime JavaScript.

## Recommended project structure

Keep the authored document in `content/projects/<slug>/`. Small document-local images can live beside it, but large or streamed media should live under `public/media/<slug>/` so Vite serves them as files instead of embedding them into the JavaScript bundle.

```text
content/
└── projects/
    └── my-project/
        └── index.md

public/
└── media/
    └── my-project/
        ├── hero.webp
        ├── gameplay.mp4
        ├── screenshot-01.webp
        └── model.glb
```

Legacy one-file projects such as `content/projects/frogbyte.md` remain supported.

### Which asset folder should I use?

Use `content/projects/<slug>/assets/` for small images that are genuinely part of the document source and that benefit from build-time inlining.

Use `public/media/<slug>/` for:

- `.glb` / `.gltf` models;
- videos;
- large GIFs;
- large image galleries;
- assets you want the browser to load lazily or stream independently from the application bundle.

For rich projects, `public/media/<slug>/` should be the default for substantial media.

## Versioning 3D models

A GLB is a normal project asset. If it is a few hundred kilobytes or a few megabytes, commit it with regular Git; Git LFS is unnecessary at that scale.

Recommended workflow:

```bash
node tools/install-project-model.mjs C:/path/to/model.glb my-project model.glb

git add public/media/my-project/model.glb
git add content/projects/my-project/index.md
git commit -m "feat: add my-project 3D model"
git push
```

The installer validates the GLB header/version and copies it to the canonical public-media directory. It is optional convenience tooling; after the copy, the model is simply a tracked Git file.

Then reference it from Markdown:

```md
::model3d{src=/media/my-project/model.glb label="EXPLORE THE MODEL" autospin=0.08}
```

For ordinary portfolio-sized GLBs, this is all that is required. Consider Git LFS only if individual binary assets become genuinely large (for example tens or hundreds of megabytes) or change frequently enough to bloat repository history.

## Minimal project

```md
---
title: MY PROJECT
sub: One sentence explaining why it matters
status: UNITY · C#
year: 2026
stack: [Unity, C#]
---

::facts{columns=2}
TYPE | GAME / TOOL / SYSTEM
ENGINE | UNITY
ROLE | GAMEPLAY + SYSTEMS
YEAR | 2026
::

## THE PROJECT

Explain the problem, your role and the interesting engineering decisions.
```

No JavaScript registration is needed for a project. If you are about to create `src/my-project.js`, stop and ask whether the missing behavior should be a reusable document block instead.

## Blocks

### Hero

```md
::hero{media=/media/my-project/hero.webp eyebrow="ARCADE SYSTEM" title="PROJECT TITLE" subtitle="Short pitch"}
```

Use a hero only when it has useful visual media. Do not create an empty hero simply to reserve space.

### Project facts

```md
::facts{columns=2 label="PROJECT SNAPSHOT"}
GENRE | RHYTHM GAME
ENGINE | UNITY
PLATFORM | CUSTOM ARCADE CABINET
ROLE | GAMEPLAY + SYSTEMS
::
```

`facts` is a compact visual summary. Use `1`, `2` or `3` columns depending on the amount of information. The left side of each row is the fact name; the right side is the value.

### System overview

```md
::system{columns=2 label="AI SYSTEM"}
DIRECTOR AI | MONITORS PACING AND GLOBAL PRESSURE
CREATURE AI | OWNS LOCAL PERCEPTION AND DECISIONS
PERCEPTION | HEARING, SIGHT AND PLAYER EVIDENCE
SEARCH STATE | INVESTIGATES WITHOUT PERFECT INFORMATION
::
```

Use `system` for architecture, responsibilities, state groups and subsystems that coexist rather than happen in a strict order. It intentionally renders as an editorial grid with **no arrows**. Prefer this for AI architecture, gameplay subsystems, service boundaries and technical breakdowns.

### Sequential pipeline

```md
::pipeline{label="INPUT LOOP"}
PHYSICAL INPUT | BUTTONS + ROTARY ENCODERS
INPUT BRIDGE | HARDWARE SIGNAL
GAME STATE | UNITY INPUT SYSTEM
PLAYER FEEDBACK | SLIDER + CAMERA RESPONSE
::
```

Use `pipeline` only when the ordering is meaningful: input chains, rendering passes, network flows, authoring workflows or an actual gameplay loop. Do not use it just to make a technical section look more visual. If the rows could be rearranged without changing the meaning, `system`, `facts`, prose or a table-like block is usually a better choice.

### Image

```md
::image{src=/media/my-project/screenshot.webp alt="Gameplay screenshot"}
```

Small local PNG, JPEG, WebP and GIF assets placed next to `index.md` are resolved relative to the document and inlined by the build. Prefer `/media/<slug>/...` for substantial project media.

### Gallery

```md
::gallery{columns=2}
/media/my-project/shot-01.webp | Gameplay
/media/my-project/shot-02.webp | Level editor
/media/my-project/shot-03.webp | Final environment
::
```

Use `1`, `2` or `3` columns. The first pipe-separated field is an asset path; the rest is its caption.

### Before / after

```md
::compare{before=/media/my-project/old.webp after=/media/my-project/final.webp beforeLabel="PROTOTYPE" afterLabel="FINAL"}
```

### Timeline

```md
::timeline
2025-01 | First prototype
2025-03 | Core system complete
2025-06 | Production version
::
```

### Local 3D model

```md
::model3d{src=/media/my-project/model.glb label="EXPLORE THE MODEL" autospin=0.08}
```

Prefer this when the GLB belongs to the project and can be hosted with the portfolio. The model is rendered by Three.js into a detached local canvas and therefore remains inside the real CRT post-process even while the user rotates it.

Current interaction contract:

```text
drag             rotate
wheel            scroll document
Ctrl + wheel     zoom / unzoom
double click     reset camera
```

The model renderer and its DOM input proxy are deliberately separate. Never mount the Three.js render canvas into the document; only the transparent input proxy belongs in the DOM.

### YouTube

```md
::embed{provider=youtube id=VIDEO_ID label="GAMEPLAY" title="Gameplay demo"}
```

Use this when the original video file is not available. If you own a suitable local video, `::video` is visually better because its frames can stay in the real CRT raster pipeline.

YouTube is mounted inline. Its input shield keeps the document wheel available while playback is controlled through the YouTube iframe API.

### Sketchfab

```md
::embed{provider=sketchfab uid=MODEL_UID label="ARCADE CABINET 3D" title="3D model"}
```

Use Sketchfab when its hosted viewer, annotations or canonical public model are useful. Prefer `::model3d` for local GLB files when possible. Sketchfab disables its own wheel zoom by default so the surrounding document remains scrollable.

### Generic external integration

```md
::embed{provider=iframe src="https://example.com/embed" label="INTERACTIVE TOOL" title="Interactive tool"}
```

Miro and Google integrations use the same contract with `provider=miro` or `provider=google`.

Third-party iframes are mounted directly in the document rather than behind an `OPEN INTEGRATION` modal. Because cross-origin iframe pixels cannot be sampled by the WebGL CRT shader, the engine applies compositor-level CRT optics while the photographic glass remains above them.

### Note

```md
::note
A short callout or engineering takeaway.
::
```

## Content rules

1. Start from the exhaustive project report, but curate the portfolio version. A project page is an experience, not an archive dump.
2. Prefer local raster/video/3D media when practical because local pixels can pass through the real CRT shader.
3. External integrations should be inline when their provider allows it. Keep document scrolling predictable and use provider adapters for unusual interaction behavior.
4. Do not add project-specific CSS or JavaScript. Add a reusable block, layout option or theme token if a genuinely new capability is needed.
5. Keep filenames descriptive. Prefer `control-panel.webp` over exported UUID filenames.
6. A rich project should still explain your contribution, engineering decisions and lessons learned. Visual spectacle supports the story; it does not replace it.
7. Avoid decorative flowcharts. Arrows imply causality or sequence; use them only when that relationship is actually part of the system.
8. Keep binary asset ownership explicit: if a project page references `/media/<slug>/foo.glb`, that file should be committed with the project unless it is intentionally provided by an external CDN/provider.

## Validation rule

PENW and Leak are deliberately different reference projects. Any engine change made for one should be tested mentally against the other. If a capability only makes sense when checking `project.id`, it does not belong in the generic engine.
