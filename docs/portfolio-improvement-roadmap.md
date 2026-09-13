# Portfolio improvement roadmap

This roadmap is intentionally sequential. Each item must start from the latest merged `master`, use one linked issue and one dedicated branch, pass its validation, and be merged before the next item starts.

## Non-negotiable visual constraints

- Do not change the CRT shader, bloom, scanlines, phosphor, vignette, distortion, curvature, persistence, defocus, framebuffer appearance, or CRT geometry.
- Do not redesign the chassis, controls, global layout, responsive composition, project palettes, or fullscreen behavior.
- Do not reduce visual quality for performance gains.
- Small UX improvements are allowed only when they stay inside the existing terminal/chassis vocabulary.
- Do not migrate the project to React, Next.js, or TypeScript as part of this roadmap.

## Sequential issues

1. **Lazy-load Three.js / local 3D runtime** — keep the same viewer, interaction, fallback, and CRT compositing while removing Three.js from the initial JavaScript path.
2. **Make the critical chassis asset discoverable before JavaScript** — improve the network critical path without changing the rendered asset or geometry.
3. **Convert IBM Plex Sans Condensed from TTF to WOFF2** — preserve the same families, weights, metrics, and visual output; preload only first-screen fonts.
4. **Make `npm test` autonomous on a fresh clone** — add shared asset prerequisite logic so tests generate required assets when missing.
5. **Replace the coarse bundle budget** — track initial JavaScript, lazy chunks, CSS, fonts, HTML, and critical assets separately.
6. **Add performance instrumentation** — measure boot, resources, frame time, framebuffer behavior, desktop/mobile/fullscreen, CRT on/off, media, and background-tab behavior without modifying rendering.
7. **Decouple reveal timing from clamped frame rate** — preserve nominal animation speed, appearance, and audio synchronization while making progression stable during frame drops.
8. **Apply small document UX improvements** — prevent footer/progress overlap, add a discreet fullscreen reading hint on long documents, and shorten overly long project metadata without changing global layout.
9. **Unify inline Markdown parsing** — create shared inline tokens for DOM and raster consumers while keeping current CRT raster styling visually identical.
10. **Strengthen code quality tooling** — add ESLint, `.editorconfig`, `jsconfig.json`, targeted `checkJs`, and useful JSDoc without mass formatting churn.
11. **Rationalize test commands and harnesses** — expose clear runtime/content/E2E/visual/all targets and migrate small custom runners to `node:test` gradually.
12. **Audit and optimize media after measurement** — inventory resolution, duration, codec, bitrate, references, and content hashes before changing any asset; preserve perceived quality.
13. **Extend SEO output** — add social images, sitemap, robots, `Person` JSON-LD, and reliable project/article structured data while preserving visible pages.
14. **Harden HTTP headers** — add provider-aware CSP and Permissions-Policy, validate Nginx, and document HSTS responsibility when TLS terminates upstream.
15. **Pin asset-pipeline dependencies** — make Python asset generation reproducible and harmonize CI action versions where needed.
16. **Clean repository assets and QA artifacts** — classify build-used, reference-useful, and confirmed-orphan files; rename useful generated assets and remove only verified duplicates/orphans.
17. **Editorial positioning pass** — preserve `SYSTEMS / PERFORMANCE / ARCHITECTURE`, clarify the game/engine-to-systems/software progression, keep Frogbyte first, and avoid layout changes.

## Validation policy

Every branch starts from the newly merged `master`. Before a PR, run the checks appropriate to its surface area, normally including `npm test`, `npm run build`, Chromium E2E, mobile Chromium, and visual regression. Use Firefox/WebKit for interaction changes, `nginx -t` for Nginx/SEO/header work, Axe for accessibility changes, bundle reports for performance work, and asset audits for media changes.

For purely technical PRs, visual regression must remain identical. Snapshot updates must never be used to hide an unintended visual change. CI must be green before merge.
