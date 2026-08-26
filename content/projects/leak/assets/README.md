# LEAK asset manifest

This folder tracks the curated LEAK asset plan. Substantial streamed media lives under `public/media/Leak/` so it is served independently from the application bundle.

The original presentation export uses opaque UUID/timestamp filenames. Do not reference those export names directly from `index.md`. Curate useful source assets once, give them a stable portfolio role/name where practical, and keep project-specific behavior out of the runtime.

## Local media already versioned

| Asset | Role | Current use |
| --- | --- | --- |
| `public/media/Leak/Leak.mp4` | main project/gameplay presentation | `::video` in THE EXPERIENCE |
| `public/media/Leak/Leak - Hiding system demo V1.mp4` | hiding / survival-system demonstration | `::video` after SURVIVAL LOOP |
| `public/media/Leak/Leak _ Character demo V1.mp4` | character / player-system demonstration | `::video` in PLAYER PRESSURE SYSTEMS |
| `public/media/Leak/Leak (1).mp4` | role not yet identified confidently from filename | intentionally unused until verified |

Local videos are preferred because their frames remain inside `article-source` and therefore receive the real CRT shader, physical VOLUME control and media lifecycle rules.

## Remaining curated targets

| Portfolio asset | Original/source role | Intended block |
| --- | --- | --- |
| `logo.webp` | LEAK logo | hero / media |
| `manor-hero.webp` | manor atmosphere / project overview | hero / media |
| `bodycam-reference.webp` | body-cam visual treatment | media / gallery |
| `flashlight-system.webp` | flashlight/player system | gallery |
| `interaction-system.webp` | universal interaction system | gallery |
| `inventory.webp` | inventory system | gallery |
| `decrypt-puzzle.webp` | encrypted-file puzzle | gallery |
| `environment-01.webp` | manor/environment production | gallery |
| `environment-02.webp` | manor/environment production | gallery |
| `skull-cinematic.webp` | high-detail Skull version | compare / gallery |
| `skull-game.webp` | optimized game Skull version | compare / gallery |
| `skull.glb` | local Skull model when redistributable | model3d |

## External integrations still useful

- Skull optimization video: YouTube `Myl4n_aTp5g`
- Skull model: Sketchfab `9e3a24e3e08840d69fc031b9c1a0e55d`
- Game-design board: Miro live embed

These remain provider-level fallbacks until equivalent curated local assets exist. The main project/hiding/character videos no longer depend on YouTube.

## Asset rules

- Keep the original aspect ratio unless a curated crop is deliberately exported.
- Prefer WebP for static screenshots and photography.
- Prefer local MP4/WebM over YouTube when the original video is available.
- Prefer local GLB over Sketchfab when a redistributable model is available.
- Optimize assets before committing them; do not make the runtime compensate for oversized presentation exports.
- Never add LEAK-specific rendering/loading code. If an asset needs new behavior, implement a reusable document block or provider adapter another project can also use.
