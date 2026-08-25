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
- Portable/mobile: user-supplied `assets/src/chassis-moulding-mobile.png` at
  941 × 1672.
  It is used as a full-bleed portrait plate without stretching; its black
  opening becomes a transparent aperture for the live CRT.

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
its broad shoulder follows the top and left glass edges instead of collapsing
to a point or floating over terminal content.

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
glass occupies 26.1424–73.7513% horizontally and 17.823–46.5909% vertically.
The photographic frame ends before the navigation begins, leaving a deliberate
65px design-space gap and preventing the keys from touching the moulding.

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
- Desktop CRT-effects and volume controls remain large enough to read as
  deliberate physical hardware. Compact/mobile uses the supplied cream plate
  full bleed, with no outer device surround or viewport bars.
- CRT scanlines stay sub-pixel-thin and restrained. Long-form article content
  receives the same glass, fine scanline, grille and CRT toggle treatment as
  the terminal canvas.
