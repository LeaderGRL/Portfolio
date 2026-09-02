# JG-1500 visual system

## Intent

JG-1500 is a working portfolio presented as a late-1970s French engineering
terminal. The interface must feel like one coherent manufactured object: warm
injection-moulded cream, softly recessed neomorphic keys, photographic control
hardware, and live P1
green phosphor. It is restrained, tactile, technical, and never card-based.

## Visual source of truth

- Desktop reference: user-supplied
  `assets/src/chassis-moulding-desktop.png` at 1672 × 941. It is cropped
  symmetrically by less than one source pixel vertically, never stretched, and
  exported at 1920 × 1080 and 3840 × 2160.
- Portable/mobile: user-supplied `assets/src/chassis-moulding-mobile.png` and
  artist-cut `assets/src/chassis-frame-mobile.png`, both at 941 × 1672.
  They are used full bleed without stretching; the supplied frame alpha is the
  exact aperture for the live CRT and must not be replaced by a CSS radius.

## Palette and material

- Panel highlight: `#f9ecd9`
- Panel face: `#f3e5d1`
- Panel mid: `#eddfca`
- Panel shadow: `#dccbb1`
- Panel edge: `#c3b096`
- Hard ink: `#423a2c`
- Soft ink: `#93825f`
- CRT black-green: `#030604`
- P1 phosphor: `#2fd06d`

The desktop chassis and CRT recess are one photographic 16:9 plate. Only the
central glass is converted to a transparent aperture: the complete black inner
moulding stays photographic and sits above the live CRT. Switches, grille, and
rocker still come from `assets/build/*.webp`. Navigation/action keys follow the supplied
`soft-ui-neumorphic-buttons-led-dynamic-palette-cavity-slider.html`: every
highlight, shadow, cavity and face is derived from the terminal's cream panel
surface, so the controls read as one moulded assembly. A small integrated LED
at the upper-right owns route selection without recolouring the entire face.
CSS owns layout, travel, focus, and responsive composition.
The glass specular is anchored slightly inside the tube's upper-left curvature:
one enlarged, blurred copy of the photographic gloss supplies the softbox
halo, while a second sharper copy preserves the bright glass streak. Both
follow the top and left curvature instead of floating over terminal content.
The live tube deliberately bleeds 10–12 design pixels behind the photographic
moulding. The moulding remains the visual mask, while the raster no longer
exposes dead bands or unfilled corners at the measured aperture boundary.

## Geometry

Desktop uses a native 1920 × 1080 photographic design surface with three fixed
columns: 512 / 896 / 512. The screen is registered to the measured inner-glass
aperture at 34.7396–65.3125% horizontally and 31.2963–72.963% vertically. This compact,
centered frame is an explicit user preference over the larger target-design
opening. Navigation and actions
are narrow, vertically balanced rails. Desktop keys keep their 3.4577:1
physical proportion at a restrained 154px width; moulding, cavity, and face
scale as one physical object. Responsive fitting scales the complete plate
uniformly with a cover fit. The 4K source is selected from 2560px upward, while
Full HD uses the 1920px derivative.
The portable variant
keeps its separate, reference-specific wide key mould. The model footer is
omitted from the reference state.

Portable uses the portrait plate's native 941 × 1672 surface with a cover fit.
Its order is nameplate, large CRT, six full-width navigation keys, paired
CRT/volume controls, then power. Navigation never becomes a two-column grid
and stays directly accessible; there is no hamburger/menu control. The live
glass follows the measured alpha of `chassis-frame-mobile.png` (roughly
26.1–73.8% horizontally and 18.1–46.5% vertically).
The photographic frame ends before the navigation begins, leaving a deliberate
gap and preventing the keys from touching the moulding. The mobile navigation
rail is a centred 430px-wide column with a 10px rhythm between the six keys;
it begins noticeably below the CRT instead of visually attaching to its frame.
CRT/Volume form a second lower tier, while Power sits on a distinct final tier.

## Typography and iconography

Panel text uses a compact industrial sans with tracked uppercase labels.
Terminal text remains the live raster glyph system. Mobile navigation uses
filled Font Awesome solid icons because their weight and simple silhouettes
match the reference hardware legends.

## Interaction contract

- Every physical control remains a native button or an ARIA control.
- Hover, press, visible keyboard focus, selected, and power states remain
  distinct without layout movement.
- Keys use one restrained motion signature: hover slightly raises face
  brightness, press lowers the edged cream button into its tinted cavity, and
  selected routes illuminate the integrated green LED without moving layout.
- Reduced-motion users keep immediate state changes without parallax motion.
- The terminal remains mirrored into the polite live region for assistive
  technology.
- Terminal chrome, bitmap headlines, body rows, status rows, and footer rules
  own separate row bands; bloom must never be used to excuse textual overlap.
- The screen, ARIA state, and rocker initialize powered **ON**;
  the first press visibly throws the rocker to OFF.
- Desktop CRT-effects, full-screen and volume controls remain large enough to
  read as deliberate physical hardware. Compact/mobile uses the supplied cream
  plate full bleed, with no outer device surround or viewport bars.
- FULL SCREEN is a second two-position switch from the same render as CRT
  EFFECTS, captioned in the same language (OFF/ON). On the desk it sits
  between CRT EFFECTS and VOLUME, grouping the two display controls; on the
  portable the CRT / FULL SCREEN / VOLUME tier is one three-column row.
- Full screen uses a continuous, viewport-filling phosphor surface with no
  4:3 backing rectangle or black bars. The terminal grid stays proportional;
  documents reflow into a readable column with 15–20 CSS px body text. Sources
  and persistence textures use the actual output resolution (2x density,
  4096-pixel dimension and 8-megapixel caps), including media inspection.
  Fullscreen restores the original CRT profile: bloom, curvature, grille,
  chromatic separation and phosphor persistence match the desk. Diffuse shading
  stays active, but the photographic gloss is desk-only: its rounded streak
  does not match a borderless viewport and can obscure portrait article text.
  Do not round/crop the fullscreen canvas or add a substitute glare to justify
  that reflection. Beam count stays independent of source resolution,
  preserving the CRT character without downsampling article content.
  The chassis is hidden; a phosphor-styled softkey row at the bottom carries the
  sections, BACK, ENTER and EXIT so touch and pointer users are never
  stranded. `Escape` leaves full screen before it means BACK.
- Fullscreen reserves separate document, progress-footer and navigation bands.
  Images preserve their proportions; narrow-column media frames scale down
  rather than introducing large empty vertical gaps.
- Entering full screen moves keyboard focus to EXIT; leaving it restores the
  triggering control. Keyboard softkey activation preserves focus. BACK uses
  `Backspace`, not `Escape`, while full screen is active; modified shortcuts
  and text composition remain owned by the browser or native control.
- Switching display size preserves the document's normalized reading position;
  native scroll anchoring must not make the article jump during the transition.
- CRT scanlines stay sub-pixel-thin and restrained. Long-form article content
  receives the same glass, fine scanline, grille and CRT toggle treatment as
  the terminal canvas.
- The shader never owns the corner radius. It paints through the complete
  rectangular backing surface; only the photographic chassis alpha defines
  the visible glass silhouette, so there can be no competing corner shapes.
- Chassis alpha is published only by `tools/build_chassis.py`. Desktop uses the
  artist-cut transparency from `assets/src/chassis-frame-desktop.png` verbatim;
  mobile follows the same rule with `assets/src/chassis-frame-mobile.png`.
  Code must not approximate either silhouette with a second superellipse. The
  live tube may overscan behind these alpha cuts, never in front of the moulding.
