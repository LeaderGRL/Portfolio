# Design QA — JG-1500 CRT and responsive pass

## Source truth

- Desktop composition: `assets/src/target_portfolio.png`, with the later
  user-selected centered chassis in `assets/src/chassis-reference-centered.png`.
- Mobile plate: `assets/src/ChatGPT Image 25 août 2026, 00_31_47 (1).png`
  at 941 × 1672.
- The centered desktop chassis intentionally overrides the older target's
  larger CRT opening. Neither desktop nor mobile source is stretched.

## Combined visual comparisons

- `qa/desktop-comparison.png` places the target and final 1920 × 1080 state on
  the same canvas.
- `qa/mobile-comparison.png` places the cover-cropped mobile source plate and
  final 430 × 900 state on the same canvas.
- Supporting captures: `qa/desktop-final.png`,
  `qa/desktop-article-final.png`, `qa/mobile-final.png`, and
  `qa/mobile-article-final.png`.

Both combined comparisons were inspected at original resolution. The mobile
opening, moulded contour, highlight direction, cream texture and full-bleed
cover crop remain registered to the supplied plate. The only desktop geometry
departure from the older target is the explicitly preferred smaller, centered
screen.

## Findings and fixes

- Lighting: the real glass gloss asset is anchored and strengthened toward the
  upper-left inner corner. A zoomed inspection confirms that the reflected
  shoulder starts at the top-left edge rather than floating over content.
- CRT raster: scanline troughs now use a narrow seventh-power profile with
  lower amplitude. Aperture-grille strength and noise are also reduced to
  prevent thick bands and moiré.
- Article rendering: long-form content again receives fine scanlines, a subtle
  phosphor grille, glass shade and upper-left gloss. The CRT switch removes the
  article overlays as well as the canvas effect.
- Mobile background: the portrait asset is converted to a transparent-aperture
  frame and cover-fitted at its native aspect ratio. At 430 × 900 the machine
  extends 38.6 px past each horizontal edge by design, which fills the viewport
  without distortion or background bars.
- Mobile layout: the hamburger icon is absent. The screen ends at 588.3 px,
  navigation occupies 606.0–793.7 px, and controls begin at 797.4 px; these
  regions do not overlap. A stray `CRT EFFECTS` pseudo-label found during the
  first capture was removed from the CONTACT-button area.
- Article mobile: rich text and code remain readable and independently
  scrollable inside the photographed opening.

## Verification

- `pnpm.cmd build`: passed; production single-file output generated.
- `pnpm.cmd test`: all smoke, WebGL, navigation, power, slider, keyboard,
  responsive and interaction checks passed.
- Browser states checked at 1920 × 1080 and 430 × 900: HOME and article detail.
- CRT article switch: overlay opacity changes from 0.72/0.17 to 0/0 when OFF.
- Browser console: no application errors.

Final result: passed
