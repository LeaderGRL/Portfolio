# CRT Cursor final validation — issue #86

Date: 2026-09-17  
Integration branch: `cursor`  
Validation branch: `cursor-86-final-validation`  
Specification: `docs/specs/crt-cursor-absorption.md`  
ADR: `docs/adr/0001-crt-cursor-absorption.md`

## Scope

Issue #86 is the final validation gate for the accepted CRT Cursor interaction. It does not reopen the ADR or introduce a second interaction model. Its purpose is to prove the completed implementation across deterministic interaction, GPU upload invariants, browser fallbacks, visual baselines and repository integration.

The throwaway prototype modules are absent from the integration tree. Production uses the `src/crt-cursor-*.js` modules and `src/crt-cursor.css`; there is no `src/crt-cursor.prototype.js`, `src/crt-cursor.prototype.css`, prototype HUD/switcher/trail runtime, or import from `prototype/crt-cursor-visuals`.

## AC-001 → AC-021 evidence matrix

| AC | Evidence |
| --- | --- |
| AC-001 | `tests/e2e/crt-cursor-final-validation.spec.js` starts on the physical POWER control and asserts `NATIVE_OUTSIDE` with no owned-cursor class. |
| AC-002 | `tests/node/runtime/crt-cursor-foundation.test.js` validates the squircle aperture/magnetic zone; final E2E enters Absorption from outside the visible aperture. |
| AC-003 | `tests/e2e/crt-cursor-handoff.spec.js` checks the DOM cursor tip against the real pointer to sub-pixel tolerance. |
| AC-004 | Final E2E oscillates rapidly inside the hysteresis band, asserts `zoneLatched` remains true after every move, then retreats beyond it and proves the latch releases without Snap. |
| AC-005 | Final E2E validates GPU hotspot UV alignment at the centre, four straight-edge positions and four curved-corner positions; handoff E2E validates the SVG hotspot. |
| AC-006 | `tests/node/runtime/crt-cursor-foundation.test.js` covers the bounded 180–240 ms speed mapping. |
| AC-007 | `crt-cursor-visual-regression.spec.js` includes deterministic mid-Absorption and pre-Snap baselines. |
| AC-008 | `tests/node/runtime/crt-cursor-reaction.test.js` validates localized reaction math; visual baselines cover pre-Snap, recoil and click reaction states. |
| AC-009 | `tests/e2e/crt-cursor-handoff.spec.js` validates SVG → GPU ownership and asserts the inactive representation is hidden. |
| AC-010 | `tests/node/runtime/crt-cursor-gpu.test.js` validates the final CRT composite cursor path; visual baselines cover active GPU states and no DOM duplicate. |
| AC-011 | Final E2E instruments the production `RenderController → crt.render` call and proves real pointer motion keeps `sourceDirty=false`; `tests/node/runtime/crt-cursor-performance.test.js` then proves 180 such clean frames do not increase source/cursor texture upload counts while a real invalidation uploads exactly once. |
| AC-012 | Cursor state/unit coverage validates movement angle and stable rest behavior; final E2E and visual baselines cover active centre/boundary rendering without a trail layer. |
| AC-013 | `tests/e2e/crt-cursor-interaction.spec.js` and `tests/node/runtime/crt-cursor-interaction.test.js` validate Interactive Lock without hotspot movement; visual baselines cover lock and click impulse. |
| AC-014 | `tests/e2e/crt-cursor-handoff.spec.js` validates clicks during Absorption; interaction E2E validates normal active-pointer activation semantics. |
| AC-015 | `tests/e2e/crt-cursor-interaction.spec.js` navigates content under a stationary owned pointer and proves `CRT_ACTIVE` continuity without replaying Absorption. |
| AC-016 | Handoff E2E validates Release to native ownership; reaction tests and the deterministic Release visual baseline validate the quieter exit model. |
| AC-017 | Final E2E proves CRT OFF keeps `CRT_ACTIVE` ownership through the SVG bypass; `crt-cursor-robustness.spec.js` proves POWER OFF returns synchronously to native ownership. |
| AC-018 | `tests/e2e/crt-cursor-robustness.spec.js` validates direct reduced-motion ownership changes; visual regression includes the reduced-motion active state. |
| AC-019 | `tests/e2e/crt-cursor-robustness.spec.js` validates sandboxed iframe `NATIVE_EXTERNAL` ownership and direct return without boundary-cinematic replay. |
| AC-020 | Final integration-tree audit confirms no prototype source/style files or development prototype import remain. |
| AC-021 | Repository CI runs quality, asset audit, production build/budget, Nginx validation, runtime/content suites, Chromium/Firefox/WebKit/mobile Playwright and the visual-regression project. Cursor-specific tests are included in those gates. |

## Performance proof

The proof is deliberately split across the real application path and the GL upload layer.

`tests/e2e/crt-cursor-final-validation.spec.js` first stabilizes the terminal source, instruments the actual `crt.render(state, sourceDirty)` call used by `RenderController`, moves the real pointer repeatedly while the CRT cursor remains active and asserts every sampled pointer frame reaches the renderer with `sourceDirty=false`. It then calls the normal `renderController.render()` source path and proves the next CRT frame observes `sourceDirty=true`.

`tests/node/runtime/crt-cursor-performance.test.js` separately records source and immutable cursor raster upload counts, then renders 180 clean cursor frames with changing hotspot, angle, compression, hover, click impulse and recomposition values. The source upload count and cursor raster upload count must remain unchanged for the entire sequence. A final render with a real source invalidation must increment the source upload count by exactly one.

Together these layers protect the accepted rule end-to-end: pointer motion never dirties the application source, and a clean CRT frame never re-uploads that stabilized source texture.

## Deterministic visual review

`tests/e2e/crt-cursor-visual-regression.spec.js` freezes both cursor model progression and chassis tilt before every screenshot instead of racing real animation time. Approved raster baselines cover:

- mid-Absorption stretch;
- pre-Snap squash/glass crossing;
- active GPU cursor at centre;
- active GPU cursor near a curved boundary;
- Glass Recoil;
- Interactive Lock;
- click impulse;
- Release;
- CRT effect OFF while interaction remains active;
- reduced-motion active ownership.

The captures use the same desktop Chromium visual-regression project as the existing physical-composition baselines. Cursor snapshots use an absolute diff budget small enough that removing the cursor cannot remain under the visual threshold. Baselines are committed; CI never auto-approves changes.

## `master` → `cursor` integration audit

At the start of #86, GitHub reports `cursor` as 120 commits ahead and 4 commits behind `master`, with merge base `60c96f28a0f16bc3c5abd17f332bb2c8e7ff2353`.

The changed-file set belongs to the accepted feature scope:

- ADR/spec/context documentation;
- CRT Cursor production modules/styles;
- minimal app, machine-state, render and runtime-control integration points;
- CRT shader/composite integration;
- cursor-specific runtime/E2E tests and supporting smoke tooling;
- package test-command wiring.

No unrelated portfolio content, project/article copy, media asset, responsive chassis asset or deployment configuration is part of the feature diff. The four newer `master` commits should be reconciled as part of the final `cursor` → `master` integration review rather than silently folded into this child ticket.

## Manual review checklist

The visual-regression report is the review surface for representative 1440×900 desktop captures. Before merging #86 into `cursor`, review the ten cursor baselines together with the existing desktop/mobile composition baselines and confirm:

- hotspot remains visually attached to the pointer tip at centre and tube boundaries;
- no SVG/GPU double cursor appears at handoff;
- no phosphor trail or cursor afterimage is visible;
- glass deformation remains local and readable;
- Release is quieter than entry;
- CRT OFF keeps cursor ownership understandable;
- reduced-motion has no stretch/recoil cinematic;
- native chassis ownership remains visually unmodified;
- fullscreen/standard CRT composition baselines remain unchanged.

## Merge gate

#86 is ready to merge into `cursor` only when its PR reports green quality/build/runtime/content/browser/visual jobs and the committed visual baselines have been reviewed. The child branch must never merge directly to `master`; final integration remains `cursor` → `master` after #79 review.
