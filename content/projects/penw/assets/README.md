# PENW asset manifest

This folder is the canonical home for portfolio-ready Project Echo: Neon Wave media.

The original presentation export uses timestamped filenames. Do not reference those names from `index.md`. Copy or transcode the source asset once, give it a descriptive filename here, then use the descriptive path from the document.

## Recommended mapping

| Portfolio asset | Original source asset | Intended block |
| --- | --- | --- |
| `project-logo.webp` | `a7c7b9c7-e598-4a0e-9127-1f1fa1b79f4b.png` | hero / image |
| `camera-effect.webp` | `1680785313665-camera.PNG` | gallery |
| `visual-logo-study.webp` | `1680514188816-Logo+-+Copie.png` | gallery |
| `title-reference.webp` | `1681115063169-1681115063169.png` | compare / gallery |
| `title-background-v1.gif` | `1681115350176-Alveoles_ecran_titre-_1_.gif` | gallery |
| `title-background-v2.gif` | `1681115598277-Alveoles_background2.gif` | gallery |
| `title-background-v3.gif` | `1681115827807-Background_ecrantitre.gif` | gallery / hero |
| `ingame-background-prototype.webp` | `1681116387654-1681116387654.png` | gallery |
| `level-selection.webp` | `1680513722932-Desktop_-_57.png` | gallery |
| `menu-design-study.webp` | `1680595375105-image+1.png` | gallery |
| `level-editor.webp` | `1680601058063-web.png` | image / gallery |
| `cabinet-original.webp` | `1680515402895-Borne_arcade_01.jpg` | gallery |
| `cabinet-plan.webp` | `1680772996610-plan.png` | gallery |
| `control-panel-plan.webp` | `1680773042242-1680773042242.png` | gallery |
| `control-panel-detail.webp` | `1680773141252-1680773141252.png` | gallery |
| `control-panel-side.webp` | `1680788346274-COTE_PANNEL_BORNE+(1).png` | gallery |
| `cabinet-wrap.webp` | `1680774199450-illubornecorrigeeversion_blanc.jpg` | gallery |
| `echo-hair.webp` | `1680599239974-Cheveux01.jpg` | gallery |
| `echo-outfit.webp` | `1680599287976-vêtements.jpg` | gallery |
| `echo-face.webp` | `1680599397973-design+perso+ebauche+1.JPG` | gallery |
| `echo-weapon.webp` | `1680599495018-Arme_et_masque.jpg` | gallery |
| `echo-3d-experiment.webp` | `1680786049921-echo+3d.png` | gallery |
| `project-board.webp` | `1681113075818-1681113075818.png` | gallery |
| `arcade-cabinet.glb` | local cabinet GLB export | model3d |

## Asset rules

- Keep the original aspect ratio unless a curated crop is deliberately exported.
- Prefer WebP for static screenshots and photography.
- Keep GIF only when the animation itself is the information being shown.
- Prefer local MP4/WebM over YouTube when the original gameplay video is available, because local frames can pass through the real CRT shader.
- Prefer `arcade-cabinet.glb` over Sketchfab once the local model is available in this folder.
- Optimize assets before committing them; the document engine should not compensate for oversized source exports at runtime.
- Never add PENW-specific loading code. If an asset needs a new behavior, implement a reusable document block or provider adapter.
