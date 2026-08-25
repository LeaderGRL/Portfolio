# Adding a rich project

The project engine is designed so a new portfolio project should require content and assets, not runtime JavaScript.

## Recommended folder

```text
content/projects/
└── my-project/
    ├── index.md
    └── assets/
        ├── hero.webp
        ├── screenshot-01.webp
        ├── screenshot-02.webp
        └── model.glb
```

Legacy one-file projects such as `content/projects/frogbyte.md` remain supported.

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
::hero{media=assets/hero.webp eyebrow="ARCADE SYSTEM" title="PROJECT TITLE" subtitle="Short pitch"}
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

### System pipeline

```md
::pipeline{label="INPUT LOOP"}
PHYSICAL INPUT | BUTTONS + ROTARY ENCODERS
INPUT BRIDGE | HARDWARE SIGNAL
GAME STATE | UNITY INPUT SYSTEM
PLAYER FEEDBACK | SLIDER + CAMERA RESPONSE
::
```

`pipeline` renders a reusable connected sequence. It is suitable for gameplay loops, AI pipelines, rendering pipelines, networking flows, authoring workflows and hardware/software chains.

### Image

```md
::image{src=assets/screenshot.webp alt="Gameplay screenshot"}
```

Local PNG, JPEG, WebP and GIF assets are resolved relative to `index.md` and inlined by the build.

### Gallery

```md
::gallery{columns=2}
assets/shot-01.webp | Gameplay
assets/shot-02.webp | Level editor
assets/shot-03.webp | Final environment
::
```

Use `1`, `2` or `3` columns. The first pipe-separated field is an asset path; the rest is its caption.

### Before / after

```md
::compare{before=assets/old.webp after=assets/final.webp beforeLabel="PROTOTYPE" afterLabel="FINAL"}
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
::model3d{src=assets/model.glb label="EXPLORE THE MODEL" autospin=0.14}
```

Prefer this when the GLB belongs to the project and can be hosted with the portfolio. The model is rendered by Three.js into a local canvas and therefore remains inside the real CRT post-process even while the user rotates or zooms it.

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

## Validation rule

PENW and Leak are deliberately different reference projects. Any engine change made for one should be tested mentally against the other. If a capability only makes sense when checking `project.id`, it does not belong in the generic engine.
