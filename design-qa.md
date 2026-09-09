# Design QA — CRT patch audit and aperture overscan

## Source truth and normalization

- Patch reviewed: `C:/Users/jorda/Downloads/0001-crt-fixes.patch`.
- Desktop visual source: `assets/src/chassis-moulding-desktop.png`, 1672 × 941.
- Mobile visual source: `assets/src/chassis-moulding-mobile.png`, 941 × 1672.
- Desktop implementation: `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-overscan-desktop.png`,
  CSS viewport and screenshot 1920 × 1080, DPR 1.
- Mobile implementation: `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-overscan-mobile.png`,
  CSS viewport and screenshot 430 × 900, DPR 1.
- Desktop source was fitted without stretch to 960 × 540. Mobile source was
  centre-cover-cropped without stretch to 430 × 900.
- States: HOME for desktop/mobile full views; first local article for the
  responsive reader and CRT toggle.

## Patch decision

- Applied: aperture fade outside the visible canvas, shallower beam falloff,
  radial edge defocus, horizontal overshoot, wide halation, article media
  frames, code headers, embed wells, beam falloff and reduced-motion-safe
  flicker.
- Adapted: looping video only autoplays and mutes when `loop` is truthy.
- Intentionally not applied: the patch's thicker article scanlines and grille,
  because the maintained design contract requires sub-pixel-thin restrained
  lines; the current 0.45px/2.15px treatment remains.
- Intentionally not applied: the connected-component gloss extractor, because
  the current broad upper-left photographic reflection matches the approved
  design and the proposed extraction could collapse it back into a small spot.

## Comparison evidence

- Desktop full view:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-overscan-desktop-comparison.png`.
- Mobile full view:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-overscan-mobile-comparison.png`.
- Focused CRT/moulding view:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-overscan-focus-comparison.png`.
- Mobile article state:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-overscan-mobile-article.png`.

The source and implementation were inspected together in each comparison.

## Required fidelity surfaces

- Fonts and typography: existing panel and raster font families, hierarchy,
  weight and wrapping remain unchanged. Edge defocus is progressive and keeps
  the central terminal text readable.
- Spacing and layout: the live tube now bleeds 12 design pixels horizontally
  and 10 vertically on desktop, and 10 pixels on mobile. At 430 × 900 the tube
  occupies y=155.01–424.69, navigation y=468.30–662.63, and controls
  y=684.70–803.12; no regions overlap.
- Colors and visual tokens: the P1 green, cream chassis and photographic black
  moulding remain unchanged. The flatter beam falloff removes the artificial
  dark border without washing out the tube centre.
- Image quality and assets: both photographic chassis plates retain their
  native aspect ratios. The moulding remains above the live raster and masks
  the controlled overscan; no stretched or CSS-drawn replacement is used.
- Copy and content: navigation, terminal and article text remain unchanged.
  Code and external embeds receive clearer CRT-native framing.
- Accessibility and motion: native buttons/ARIA controls remain intact.
  Reduced-motion disables flicker. CRT OFF now sets scanlines and reader
  flicker to opacity 0 and removes the animation.

## Comparison history

- Earlier P1: the shader aperture faded from d=0.965, leaving visible dark
  bands at the raster boundary. Fix: move the fade to d=1.04–1.14 and flatten
  the duplicated shader vignette. Post-fix evidence: the focused comparison
  shows green phosphor continuously reaching the inner moulding.
- Earlier P1: the live canvas ended exactly at the aperture bounding box, so
  rounding and raster registration could reveal black corners. Fix: enlarge
  the complete live tube behind the photographic mask by 10–12 design pixels.
  Post-fix evidence: desktop and mobile comparisons show no uncovered corner.
- Earlier P2: article flicker continued to animate when CRT effects were OFF.
  Fix: remove the reader animation in the off state. Post-fix browser evidence:
  scanline opacity 0, flicker opacity 0, animation name `none`.

## Browser verification

- Page identity and meaningful DOM: passed at `http://127.0.0.1:5173/`.
- Framework overlay: absent.
- Console errors/warnings: none.
- Desktop HOME at 1920 × 1080: passed.
- Mobile HOME at 430 × 900: passed, no overlap.
- Interaction: ARTICLES → first detail opened; reader title and 23 code blocks
  rendered.
- CRT switch: ON → OFF → ON verified on the article reader.
- Build and automated interaction suite: passed.

## Corner reconstruction and reflection audit — 2026-08-25

- Defect evidence supplied by the user:
  `C:/Users/jorda/AppData/Local/Temp/codex-clipboard-b13eb313-60c5-408c-8075-8e328d24c5cc.png`.
- Desktop implementation:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-final-desktop.png`,
  CSS viewport and screenshot 1920 × 1080, DPR 1.
- Focused 2× CRT inspection:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-final-zoom-2x.png`.
- Mobile implementation:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-final-mobile.png`,
  CSS viewport and screenshot 430 × 900, DPR 1.
- Same-canvas focused comparison:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-corner-comparison.png`.

### Resolved findings

- P1 — competing corner geometry: the fragment shader applied a synthetic
  superellipse on top of the photographic moulding's alpha aperture. Its
  different radius exposed a black crescent at the top-left and could leave
  dark wedges in the other corners. Resolution: delete the shader aperture
  mask entirely. The complete raster now continues behind the moulding, and
  the photographic alpha is the single source of truth for all four corners.
- P1 — reflection collapsed to a point: the generated specular map discarded
  most of the photographic softbox tail. Resolution: retain low-energy
  highlights during extraction and composite two copies of that same measured
  map: a broad blurred halo plus a sharper core streak. Both originate at the
  top-left, follow the glass curvature and stay above terminal/article content.
- P2 — responsive regression risk: verified at 430 × 900 after the geometry
  change. Tube y=155.01–424.69 and navigation begins below it; the chassis,
  buttons and controls do not overlap.

### Final verification

- Four-corner close-up: passed; phosphor remains continuous up to the inner
  moulding edge and no second-radius void is visible.
- Reflection direction and layering: passed; broad top-left shoulder and crisp
  highlight are both present without obscuring central text.
- Power interaction: ON → OFF → ON passed; the control returns to
  `aria-pressed=true` and the first toggle animates.
- Clean browser session: correct page identity, meaningful DOM, no framework
  overlay, no console errors or warnings (only Vite connection debug entries).
- Premium static audit, strict mode: 0 findings.
- Native dialog anti-pattern scan: no `alert`, `confirm` or `prompt` calls.

No actionable P0, P1 or P2 findings remain.

## Artist-cut aperture audit — 2026-08-25

- Source visual truth:
  `C:/Users/jorda/Downloads/ChatGPT Image 25 août 2026, 12_44_13.png`,
  1672 × 941 RGBA. Repository source:
  `assets/src/chassis-frame-desktop.png`.
- Desktop implementation after the complete production asset pass:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-user-alpha-final-desktop.png`,
  CSS viewport and screenshot 1920 × 1080, DPR 1, HOME state.
- Focused 2× implementation:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-user-alpha-desktop-zoom.png`.
- Mobile implementation:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-user-alpha-mobile.png`,
  CSS viewport and screenshot 430 × 900, DPR 1, HOME state.
- Same-canvas focused comparison:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-crt-user-alpha-comparison.png`.
- Alpha validation composite:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-chassis-frame-1920.webp-green.png`.

### Comparison history and fixes

- Earlier P1 — opaque black wedges: the generated exponent-5.2 aperture left
  source-face pixels over the canvas. Removing only the shader radius could
  not affect those pixels because the photographic frame is above the tube.
- Intermediate P1 — over-cut aperture: increasing the generated superellipse
  to exponent 9 removed the wedges but made the opening too square and cut
  into the inner black lip. The same-viewport comparison records that rejected
  intermediate state on the left.
- Final fix: desktop no longer synthesizes an aperture. The pipeline publishes
  the exact artist-cut alpha supplied by the user. Near-opaque plate pixels
  (alpha ≥ 240) are normalized to 255, while every aperture antialias pixel is
  preserved. The live tube remains behind this mask.
- Pipeline P1 — competing generators: `build_assets.py` and
  `build_chassis.py` previously generated the same frame in sequence. Chassis
  ownership now belongs only to `build_chassis.py`; the general sprite pass
  preserves the last complete chassis metadata until replacement.
- Pipeline P2 — live regeneration on Windows: outputs are encoded off-path;
  complete staged bytes are then published with rename retries and a short
  copy fallback when Vite holds the destination open.

### Required fidelity surfaces

- Fonts and typography: unchanged; terminal hierarchy and wrapping match the
  prior approved state.
- Spacing and layout: unchanged. Desktop remains 1920 × 1080; mobile tube is
  x=88.76, y=155.01, w=251.92, h=269.68 with navigation below and no overlap.
- Colors and tokens: cream chassis, black moulding, P1 phosphor and the
  upper-left glass reflection remain unchanged.
- Image quality and assets: the supplied 1672 × 941 alpha is the silhouette
  source; it is resampled without aspect-ratio distortion to Full HD and 4K.
  The focused view shows the fine inner lip intact with no opaque corner wedge
  and no green spill over the moulding.
- Copy and content: unchanged.

### Browser verification

- Page identity and meaningful DOM: passed at `http://127.0.0.1:5173/`.
- Framework overlay: absent.
- Broken images: 0 desktop and mobile.
- Clean-session console errors/warnings: none.
- Power interaction: ON → OFF → ON passed.
- Desktop 1920 × 1080 and mobile 430 × 900: passed.

No actionable P0, P1 or P2 findings remain.

## Artist-cut mobile aperture and control-density audit — 2026-08-25

- Source visual truth:
  `C:/Users/jorda/Downloads/ChatGPT Image 25 août 2026, 13_01_44 (1).png`,
  941 × 1672 RGBA. Repository source: `assets/src/chassis-frame-mobile.png`.
- Browser implementation:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-mobile-alpha-controls-430.png`,
  CSS viewport and screenshot 430 × 900, DPR 1, HOME state.
- Same-canvas normalized comparison:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-mobile-comparison.png`.
  The 941 × 1672 source was centre-cover-cropped to the visible 799 × 1672
  design region and downsampled without stretching to 430 × 900.
- Focused frame/corner comparison:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-mobile-corners-zoom.png`.
- Article implementation:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-mobile-article-crt.png`,
  first local article with the CRT scanline, grille, vignette, flicker and
  photographic glass layers active.

### Findings and fixes

- P1 — mobile used a generated superellipse instead of the supplied aperture.
  Fix: `build_chassis.py` now publishes the artist-cut mobile alpha exactly,
  normalising only near-opaque plate pixels. The focused comparison shows the
  live phosphor fully behind the four inner corners with no secondary radius.
- P2 — mobile control rail was too spread out and carried redundant endpoint
  labels. Fix: reduce navigation width from 515 to 475 design pixels, reduce
  the CRT/Volume grid from 659 to 520 pixels, hide visual OFF/ON and LOW/HIGH
  endpoints while preserving ARIA state/value, and lower Power by 27 design
  pixels. All controls remain native and keyboard accessible.

### Required fidelity surfaces

- Fonts and typography: legends keep the established industrial type system;
  hiding redundant endpoint copy does not remove the accessible labels.
- Spacing and layout rhythm: six keys remain one centered column, CRT and
  Volume now form one related group, and Power has a distinct lower tier.
  No frame, key or control overlap is visible at 430 × 900.
- Colors and visual tokens: unchanged cream hardware, black moulding and P1
  phosphor palette.
- Image quality and asset fidelity: supplied RGBA source is used at its native
  aspect ratio; no CSS-drawn or generated corner replacement remains.
- Copy and content: HOME/ABOUT/RESUME/PROJECTS/ARTICLES/CONTACT and control
  titles are unchanged; only redundant endpoint captions are visually hidden.

### Browser verification

- Page identity, meaningful DOM and framework-overlay check: passed.
- Console errors/warnings: none.
- Power interaction: ON → OFF → ON, `aria-pressed=false/true` passed.
- CRT interaction: ON → OFF → ON, `aria-checked=false/true` passed.
- ARTICLES → first detail: passed; semantic article, headings and selectable
  code render beneath the fixed CRT overlays.
- Full-view and focused same-canvas comparisons: passed.

No actionable P0, P1 or P2 findings remain.

final result: passed

## Landscape mobile reference refinement — 2026-09-09

### Source truth and normalization

- Source visual truth: `C:/Users/jorda/Downloads/goal.png`, 1672 × 941 px.
- Primary implementation evidence:
  `C:/Users/jorda/.codex/visualizations/2026/08/24/01a03439-850c-7012-90c3-29be629e11cb/pr15-landscape-final/915x412-home.png`,
  915 × 412 CSS px and image px, DPR 1, HOME state.
- Full-view comparison:
  `C:/Users/jorda/.codex/visualizations/2026/08/24/01a03439-850c-7012-90c3-29be629e11cb/pr15-landscape-final/comparison-goal-915x412.png`.
  The source was centre-cover-cropped to the same 915:412 viewport without
  stretching before being placed beside the implementation.
- Narrow implementation evidence:
  `C:/Users/jorda/.codex/visualizations/2026/08/24/01a03439-850c-7012-90c3-29be629e11cb/pr15-landscape-final/568x280-home.png`,
  568 × 280 CSS px and image px, DPR 1, HOME state.
- Large implementation evidence:
  `C:/Users/jorda/.codex/visualizations/2026/08/24/01a03439-850c-7012-90c3-29be629e11cb/pr15-landscape-final/1280x600-home.png`,
  1280 × 600 CSS px and image px, DPR 1, HOME state.

### Required fidelity surfaces

- Fonts and typography: the industrial panel type remains unchanged above
  640px. At the 568px narrow tier only, the rendered legend size and start
  inset are reduced enough to contain `PROJECTS` under Firefox's wider font
  metrics while remaining readable in the native-size capture.
- Spacing and layout rhythm: the goal's large left CRT and right two-column
  control deck are preserved from 568 × 280 through 1280 × 600. Navigation,
  actions, display controls and power remain separate tiers; all twelve target
  centres are reachable and the document has zero overflow in every capture.
- Colors and visual tokens: cream chassis, black CRT moulding, green phosphor,
  shadows and selected-state LED match the supplied reference palette.
- Image quality and asset fidelity: seven authored chassis ratios cover the
  tested landscape range without stretching. Exterior alpha corners are
  reconstructed from neighbouring chassis material while CRT apertures retain
  their authored transparency.
- Copy and content: HOME, ABOUT, RESUME, PROJECTS, ARTICLES, CONTACT, ENTER,
  BACK, CRT, FULL SCREEN, VOLUME and POWER remain intact.

### Comparison history and fixes

- Earlier P1 — transparent exterior chassis corners could reveal the page
  behind the asset. Fix: reconstruct only exterior alpha from adjacent cream
  material and preserve the inner CRT aperture. Post-fix evidence: the 915 ×
  412 comparison has continuous full-bleed chassis material.
- Earlier P2 — three chassis ratios produced avoidable crop and proportion
  drift across common phone/tablet landscapes. Fix: expand to seven measured
  variants and select the closest authored composition, with 16:9 retained for
  ordinary phone ratios to match the approved target.
- Earlier P2 — fixed control sizing made short and tall landscapes diverge.
  Fix: interpolate deck rhythm and control sizes from 280px through 600px
  height while preserving 44px targets or falling back safely when the stack
  cannot fit.
- CI P2 — Firefox at 568 × 280 reported `PROJECTS` overflowing its legend by
  16 internal pixels. Fix: narrow-tier legend size 8.25 → 7.25px and inset 21
  → 19.5px. Post-fix evidence: the native 568 × 280 capture plus 24/24
  sequential landscape/full-screen tests across all four browser profiles.

The narrow viewport itself is the focused control-region evidence; a further
crop was unnecessary because the labels and control boundaries are legible at
native 1:1 scale and are also checked with real `clientWidth`/`scrollWidth`
browser metrics.

No actionable P0, P1 or P2 findings remain.

final result: passed

## Mobile vertical-rhythm refinement — 2026-08-25

- Prior implementation:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-mobile-alpha-controls-430.png`.
- Revised implementation:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-mobile-spacing-refined.png`,
  CSS viewport and screenshot 430 × 900, DPR 1, HOME state.
- Same-canvas comparison:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-mobile-spacing-comparison.png`.

### Findings and fixes

- P2 — navigation rail remained too wide and too close to the CRT. Fix: reduce
  the mobile rail from 475 to 430 design pixels and lower its origin by 40
  design pixels.
- P2 — the six keys read as one dense slab. Fix: increase their vertical gap
  from 5 to 10 design pixels without changing the 56px key height or touch
  semantics.
- P2 — Power remained visually attached to the adjustment controls. Fix: move
  the complete control rail down by 53 design pixels and add 28 design pixels
  of separation before Power, keeping it fully visible at 430 × 900.

### Browser verification

- Page identity and meaningful DOM: passed at `http://127.0.0.1:5173/`.
- Framework overlay: absent; console errors/warnings: none.
- Navigation HOME → ABOUT: passed and selected state remains visible.
- Power ON → OFF → ON: passed (`aria-pressed=false/true`).
- CRT effects ON → OFF → ON: passed (`aria-checked=false/true`).
- Same-canvas visual comparison: revised navigation is narrower, lower and
  more breathable; controls remain separated and no overlap is visible.

No actionable P0, P1 or P2 findings remain.

final result: passed

## Latest handoff status — 2026-09-09

The landscape-mobile comparison and post-CI Firefox correction documented
above are the current implementation. The regenerated 568 × 280, 915 × 412
and 1280 × 600 evidence shows no remaining fidelity or usability regression,
and the complete 24-case landscape/full-screen browser matrix passes.

final result: passed

# Landscape mobile design QA

## Reference

- Visual source of truth: user-supplied `goal.png` (green guides define the intended composition).
- The reference is compositional rather than a single pixel-exact viewport: the landscape runtime must preserve the same CRT/control hierarchy across the supplied chassis ratios.

## Final comparison set

Chromium screenshots generated by `tests/e2e/landscape-reference.spec.js` and preserved locally for handoff:

- 915 × 412 — Pixel 7-class landscape
- 844 × 390 — common Android landscape
- 800 × 360 — short phone landscape
- 667 × 375 — compact 16:9 landscape
- 600 × 480 — near-square touch landscape
- 915 × 300 — extreme short browser-chrome case
- 1280 × 600 — upper landscape activation bound

## Findings resolved

- The control deck is centred in the actual free material between the measured outer CRT recess and the visible right chassis edge.
- The full measured black CRT moulding remains inside the viewport; any unavoidable fill comes from continued exterior cream material rather than cropping the screen assembly.
- Navigation, action, display and POWER tiers keep distinct whitespace boundaries.
- The POWER separator is derived from collision-free whitespace, stays above the label/rocker, and disappears when no safe rule can fit.
- 44 CSS px touch targets remain intact while the visible key faces stay compact.
- The shortest layouts keep a real row gutter and additional action-to-display breathing room without per-resolution overrides.

## Verification history

- Initial full landscape run exposed one sub-pixel face-gap assertion at 800 × 360 and 915 × 300 on all engines.
- The assertion was aligned with the real 44 px target/inset geometry, then a separate genuine action-to-display spacing shortfall was fixed in the shared interpolation.
- Final reference matrix: 32 passed, 0 failed across Chromium, Firefox, WebKit and mobile Chromium.
- Final landscape regression matrix: 76 passed, 36 project-scoped skips, 0 failed.
- `npm test`: passed (production build plus complete runtime suite).
- Strict premium audit: 0 findings.

## Result

PASS — no observed control/CRT overlap, moulding crop, POWER-rule collision, or horizontal control-bank drift in the final comparison set.
