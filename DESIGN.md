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
- Portable/mobile fallback: user-supplied `assets/src/chassis-moulding-mobile.png`
  and artist-cut `assets/src/chassis-frame-mobile.png`, both at 941 × 1672.
  Authored portrait phones instead use the resolution profiles described below.
  In every case the supplied frame alpha owns the live CRT silhouette and must
  not be replaced by a CSS radius.

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
The portable variant keeps the same tactile key language as desktop and
landscape. The model footer is omitted from the reference state.

## Portrait mobile reference (September 11, 2026)

Portrait phones use 19 user-supplied chassis references in
`assets/src/portrait-chassis/`, covering 320 × 568 through 440 × 956. Exact
viewport matches select their exact profile; intermediate portrait sizes select
the closest profile by aspect ratio and physical size. This is one responsive
model, not a stack of per-device media queries.

`tools/build_chassis.py` normalizes only the cream material toward the desktop
reference while preserving texture, shadows and moulding. It then measures the
source aperture and maps it onto the aperture measured from the corresponding
goal reference in `assets/src/portrait-reference-geometry.json`. The resulting
`reference_aperture` and `frame_transform` values are published through
`assets/build/meta.json`. The frame can therefore be translated/scaled to match
the authored composition while the live CRT remains registered to the correct
opening.

Portrait runtime geometry is owned by `src/portrait-mobile.js` and
`src/portrait-mobile.css`. The chassis fills the viewport with no bars. The CRT
occupies the measured reference aperture. Below it, HOME / ABOUT, RESUME /
PROJECTS and ARTICLES / CONTACT form a two-column grid, followed by ENTER /
BACK, a separated CRT / FULL SCREEN / VOLUME tier, and centered POWER. The
layout scales continuously from the viewport dimensions; only the photographic
profile selection is discrete.

Portrait does **not** invent a new button design. The cavity, cream gradients,
LED treatment, text, iconography and press travel reuse the shared desktop key
rules. As on landscape mobile, the visible cap is inset inside the touch row so
small portrait rows do not squash the 62px desktop cavity into a dark pill.
Only size and placement change. This keeps portrait, landscape and desktop
visually part of the same manufactured object.

## Landscape mobile reference (September 9, 2026)

Touch-first landscape devices use eight supplied photographic plates in
`assets/src/chassis-frame-landscape-{5x4,4x3,3x2,16x10,16x9,20x9,21x9,3x1}.webp`.
They retain their authored 1402 × 1122 through 2172 × 724 dimensions, so common
phone and small-tablet ratios select a near-exact chassis instead of materially
cropping a generic plate. Only the exterior transparency from generation is
filled from adjacent cream material; the artist-cut CRT aperture and its
antialiasing remain transparent. The user's `goal.png` is the composition
reference: a generous CRT on the left, a quiet two-column bank of keys on the
right, then actions, optical controls and power.

The closest photographic aspect is selected without forcing the 16:9 plate
onto panoramic phones. The dedicated 3:1 plate handles 915 × 300-class browser
chrome cases. Its rounded exterior corners are allowed to be transparent: the
asset pipeline identifies the largest enclosed transparent component as the CRT
opening, so edge transparency can never be mistaken for the glass aperture.
Every plate is fitted uniformly, never stretched, and may expand
toward a cover fit only while the complete measured CRT moulding and cream
screen surround remain inside the viewport. Any crop is therefore limited to
expendable exterior cream material. A remaining strip is continued from the
exact cream edge material. This keeps extreme ratios visually full without
sacrificing the screen bevel.
`tools/build_chassis.py` measures each actual WebP aperture, outer black
moulding, and the softer right edge of the cream CRT recess into
`assets/build/meta.json` → `ASSET_META.landscape_chassis` → the
`--landscape-ap-*` / screen-safe / edge properties in
`src/landscape-mobile.js`. Source replacement therefore updates the aperture,
control safe-zone, and material continuation together.

Runtime CSS remains the token owner. `src/landscape-mobile.css` owns the
landscape geometry and `--landscape-key-surface` (`#dcd2c1`), feeding the
existing shared key's cavity, rim, face, legend and LED. Standard landscapes
retain 44 CSS px touch areas with slimmer inset faces; the extreme 3:1 regime
compacts those targets only as much as required to keep all hardware inside the
authored CRT surround. The green-guide composition in
`goal.png` establishes a nominal 28.5% viewport-wide control deck, but its
horizontal position is not a fixed percentage. Up to 21:9 the deck remains
centred between the measured outer CRT recess and the visible safe right edge.
Beyond 21:9, `goal2.png` establishes a slightly wider rail that still remains
centred in the measured cream bay between the CRT surround and the visible
right edge. Its width interpolates continuously toward the 3:1 composition
instead of switching at one device resolution. Near-square landscapes can
still shrink the deck rather than touching the screen surround.
The same measured CRT surround also bounds the control deck vertically. From
21:9 toward 3:1, the invisible key targets and tier rhythm compact continuously
until the first visible key and POWER both remain inside the photographed cream
bevel. The visible key faces and their typography slim continuously toward 3:1
while preserving the larger underlying hit targets; this remains a panoramic
geometry rule, not a 915 × 300 viewport exception.
Navigation/action/display/power tiers keep explicit whitespace boundaries.
Separators sit only inside free whitespace; the POWER separator is placed above
its label and is omitted on extremely short viewports when no collision-free
rule can fit. Identity stays on the CRT. Desktop and portrait keep their
existing compositions.

The landscape optical-control tier has two vertical dividers, each centred in
the grid gap between CRT / FULL SCREEN / VOLUME. The volume slider keeps its
own longer track, but its movable thumb uses the same physical height as the CRT
and FULL SCREEN switch thumbs at every landscape size.

Fullscreen starts at viewport origin on every aspect. Decorative desktop
offsets never apply to it. The document and terminal reserve the actual
softkey height, including wrapped 44px touch keys and safe-area padding, even
when that exceeds 35% of a short viewport. Returning to landscape publishes
the final reader metrics before restoring reading progress.

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
  The active GPU's texture, renderbuffer and viewport limits can lower this
  cap; allocation failure falls back to the live 2D source, never a black screen.
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
  Window resizing and orientation changes restore the last raster progress
  after publishing the final DOM geometry, including CRT OFF and 2D fallback.
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
