---
title: 3D PARALLAX CARDS
sub: AI imagery, depth layers and Rive
year: 2025
---

A convincing interactive card does not require a complete 3D pipeline. A
single illustration, separated into depth layers and rigged in Rive, can create
enough relative motion to sell volume while staying lightweight.

::image{src=medium/parallax-cards-rive/01.webp alt="Parallax card concept" rows=9}

## 1 · GENERATE THE ART

Start with a prompt that fixes composition, focal subject, palette, camera,
negative space, and the intended card ratio. The crucial requirement is clear
depth separation: background, central subject, and foreground must remain easy
to isolate.

::image{src=medium/parallax-cards-rive/02.webp alt="Generated abstract background" rows=10}

::image{src=medium/parallax-cards-rive/03.webp alt="Generated card foreground" rows=10}

::image{src=medium/parallax-cards-rive/04.webp alt="Composed card artwork" rows=10}

## 2 · PREPARE DEPTH LAYERS

Remove the subject from the background with an image editor or segmentation
tool. Export every plane as a transparent PNG at the same canvas size. Matching
origins prevent jumps when the layers are recombined.

- Back plate: slow movement and the smallest apparent depth.
- Mid layer: gradients, atmosphere, or secondary shapes.
- Foreground subject: opposite or stronger travel.
- Type and UI: usually restrained to protect readability.

::image{src=medium/parallax-cards-rive/05.webp alt="Artwork separated into depth planes" rows=9}

::image{src=medium/parallax-cards-rive/06.webp alt="Transparent foreground layer" rows=9}

## 3 · BUILD THE CARD IN RIVE

Import the layers, preserve their shared bounds, then add the crop radius and
gradient overlay. Keep the overlay with the card so the lower text area remains
stable during motion.

::image{src=medium/parallax-cards-rive/07.webp alt="Layer setup inside Rive" rows=9}

::image{src=medium/parallax-cards-rive/08.webp alt="Card mask and gradient" rows=9}

## 4 · RIG THE CONTROLLER

Place control bones at the four corners and one at the center. Group each corner
bone so the group becomes its pivot. Rotate pivot and bone in opposite
directions; the paired transforms turn controller travel into predictable X and
Y displacement.

- Top left: group -90 degrees, bone +90 degrees.
- Top right: group +90 degrees, bone -90 degrees.
- Bottom left: group +90 degrees, bone -90 degrees.
- Bottom right: group -90 degrees, bone +90 degrees.

::image{src=medium/parallax-cards-rive/09.webp alt="Corner bone placement" rows=9}

::image{src=medium/parallax-cards-rive/10.webp alt="Opposed pivot and bone rotations" rows=9}

Add constraints from the central controller to the corner bones. Bind the card
and gradient to the rig, then bind the foreground with negative or stronger
influence. Relative motion is the illusion: layers should disagree slightly,
never drift apart.

::image{src=medium/parallax-cards-rive/11.webp alt="Rive parallax constraints" rows=9}

::image{src=medium/parallax-cards-rive/12.webp alt="Card surface bound to bones" rows=9}

::image{src=medium/parallax-cards-rive/13.webp alt="Foreground depth response" rows=9}

## 5 · POLISH THE RESPONSE

Map pointer input to the controller, clamp the range, and ease the return to
center. Small amplitudes feel physical; large ones reveal the trick. Test the
four corners, center, rapid direction changes, and reduced-motion behavior.

::image{src=medium/parallax-cards-rive/14.webp alt="Final interactive parallax card" rows=10}

The result is a reusable asset: generated art supplies the visual richness,
layer preparation defines depth, and Rive turns that structure into a compact
interactive state machine suitable for a game UI or website.

