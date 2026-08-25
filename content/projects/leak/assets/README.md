# LEAK asset manifest

This folder is the canonical home for portfolio-ready LEAK media.

The original presentation export uses opaque UUID/timestamp filenames. Do not reference those export names directly from `index.md`. Copy or transcode the useful source asset once, give it a descriptive filename here, then reference the descriptive path from the document.

## Initial portfolio targets

| Portfolio asset | Original/source role | Intended block |
| --- | --- | --- |
| `logo.webp` | LEAK logo | hero / image |
| `manor-hero.webp` | manor atmosphere / project overview | hero / gallery |
| `bodycam-reference.webp` | body-cam visual treatment | gallery |
| `flashlight-system.webp` | flashlight/player system | gallery |
| `interaction-system.webp` | universal interaction system | gallery |
| `inventory.webp` | inventory system | gallery |
| `decrypt-puzzle.webp` | encrypted-file puzzle | gallery |
| `environment-01.webp` | manor/environment production | gallery |
| `environment-02.webp` | manor/environment production | gallery |
| `skull-cinematic.webp` | high-detail Skull version | compare / gallery |
| `skull-game.webp` | optimized game Skull version | compare / gallery |
| `skull.glb` | local Skull model when available | model3d |
| `gameplay.mp4` | local gameplay/presentation video when available | video |

## External integrations currently available

- Main presentation video: YouTube `_FgVGmmpo1c`
- Skull optimization video: YouTube `Myl4n_aTp5g`
- Skull model: Sketchfab `9e3a24e3e08840d69fc031b9c1a0e55d`
- Game-design board: Miro live embed

These are provider-level fallbacks. Prefer local video/model media when the original assets are available because local pixels can remain inside the real CRT raster/post-process pipeline.

## Asset rules

- Keep the original aspect ratio unless a curated crop is deliberately exported.
- Prefer WebP for static screenshots and photography.
- Prefer local MP4/WebM over YouTube when the original video is available.
- Prefer local GLB over Sketchfab when a redistributable model is available.
- Optimize assets before committing them; do not make the runtime compensate for oversized presentation exports.
- Never add LEAK-specific rendering/loading code. If an asset needs new behavior, implement a reusable document block or provider adapter that another project could also use.
