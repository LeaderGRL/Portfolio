# Design QA — moulded CRT frame and mobile recomposition

## Source truth and normalization

- Desktop source: `assets/src/chassis-moulding-desktop.png`, 1672 × 941.
- Mobile source: `assets/src/chassis-moulding-mobile.png`, 941 × 1672.
- Desktop implementation: `C:/Users/jorda/AppData/Local/Temp/jg1500-moulding-desktop.png`,
  browser viewport and output 1920 × 1080, DPR 1.
- Mobile implementation: `C:/Users/jorda/AppData/Local/Temp/jg1500-moulding-mobile.png`,
  browser viewport and output 430 × 900, DPR 1.
- The desktop source was normalized to 960 × 540. The mobile source was
  center-cover-cropped to the same 430 × 900 viewport as the implementation;
  no source image was stretched.
- State: HOME for full-view comparisons; first article detail for responsive
  content and CRT-effect verification.

## Comparison evidence

- Desktop full view:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-moulding-desktop-comparison.png`.
- Mobile full view:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-moulding-mobile-comparison.png`.
- Focused CRT/moulding comparison:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-moulding-focus-comparison.png`.
- Mobile article state:
  `C:/Users/jorda/AppData/Local/Temp/jg1500-moulding-mobile-article.png`.

The source and rendered captures were placed together in each comparison input
and inspected at original resolution.

## Required fidelity surfaces

- Fonts and typography: panel and terminal families, weights, tracking and
  hierarchy remain unchanged and readable. The mobile article keeps its title,
  metadata, heading and body rhythm without clipping.
- Spacing and layout: the desktop nameplate is 10px lower. At 430 × 900 the
  live glass ends at 419.3px, navigation occupies 468.3–662.6px, and controls
  occupy 684.7–803.1px. These regions have deliberate gaps and do not overlap.
- Colors and tokens: the photographic cream field and black moulding are used
  directly. Existing green phosphor, amber accents and hardware ink remain
  consistent with the supplied references.
- Image quality and assets: both user-supplied raster plates are used at their
  native aspect ratios. Only the inner-glass superellipse is transparent; the
  full black moulding, its highlights and contact shadow remain photographic.
  No CSS-drawn bezel substitutes the supplied asset.
- Copy and content: navigation labels, terminal copy and article content are
  unchanged. No text crosses the frame or a control.
- Icons and controls: the Font Awesome mobile icons remain optically aligned;
  all six navigation keys, switch, slider and rocker remain visible and usable.
- Accessibility and interaction: native buttons and ARIA switch/slider states
  remain intact. Focus/selected states are visible and the article has its own
  scroll region.

## Comparison history

- Earlier P1: the inner black moulding was absent because the complete dark
  opening was cut transparent. Fix: measure the inner glass separately and use
  an antialiased superellipse mask. Post-fix evidence: the focused comparison
  shows the supplied black rim continuously around the live CRT.
- Earlier P1: the mobile frame was too large and too low, causing the control
  stack to crowd it. Fix: use the new portrait plate and move navigation to
  design y=870 and controls to y=1272. Post-fix evidence: the mobile comparison
  and measured rectangles show no intersections.
- Earlier P2: the upper-left reflection read as a small clipped point. Fix:
  reposition the real gloss asset 1.6% inward and increase its brightness and
  opacity. Post-fix evidence: the focused comparison shows a broad reflection
  following both the upper and left glass curvature.
- Earlier P3: the desktop nameplate sat slightly high. Fix: move only the
  desktop plate down 10px, keeping the rails and mobile layout stable.

## Browser verification

- Page identity and meaningful DOM content: passed.
- Framework overlay: absent.
- Console errors/warnings: none.
- Primary interaction: ARTICLES → first detail opened on mobile; passed.
- CRT switch on article: scanline overlay opacity changes from 0.72 to 0 when
  OFF and returns when ON; passed.
- Responsive screenshots: 1920 × 1080 and 430 × 900 captured and compared.

No actionable P0, P1 or P2 differences remain. The photographed moulding and
live raster are registered cleanly at both target viewports.

final result: passed
