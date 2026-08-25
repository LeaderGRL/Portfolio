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

No actionable P0, P1 or P2 findings remain.

final result: passed
