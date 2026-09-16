# Portfolio Interaction Context

This context defines the visual interaction language of the JG-1500 portfolio, especially how the pointer transitions between the physical chassis and the CRT display.

## Language

**Chassis Cursor**:
The operating system cursor used while the pointer is over the physical computer chassis or when the CRT is powered off.
_Avoid_: Custom chassis cursor, decorative cursor

**CRT Cursor**:
The electronic pointer visible after the cursor has been absorbed into the powered CRT. It remains clearly arrow-shaped while taking on the display's phosphor identity.
_Avoid_: Reticle, probe cursor, trail cursor

**Absorption**:
The transition in which the powered CRT appears to pull the Chassis Cursor through the glass and convert it into the CRT Cursor.
_Avoid_: Fade, teleport, cursor swap

**Magnetic Zone**:
The narrow region following the real contour of the CRT glass where Absorption begins progressively before the final conversion.
_Avoid_: Rectangular trigger zone, hover zone

**Phosphorization**:
The visual conversion during Absorption where the cursor begins by matching the Chassis Cursor and progressively takes on the CRT Cursor's green phosphor body and warm mint core before the Snap.
_Avoid_: Instant recolor, skin swap

**Snap**:
The decisive instant at the end of Absorption where the stretched cursor retracts into the screen and becomes the CRT Cursor.
_Avoid_: Crossfade, dissolve

**Glass Reaction**:
The local physical-looking deformation of the CRT surface and nearby displayed signal caused by Absorption or a pointer click.
_Avoid_: Full-screen distortion, vortex

**Glass Recoil**:
The small damped rebound of the local CRT surface immediately after an Absorption Snap, returning the Glass Reaction to rest without a visible pop.
_Avoid_: Screen bounce, full-screen wobble

**Optical Coupling**:
The rule that the CRT Cursor is part of the displayed signal and therefore inherits the same tube curvature and edge distortion as the rest of the CRT image.
_Avoid_: Flat overlay cursor, rigid screen-space cursor

**Release**:
The quieter inverse transition used when the CRT Cursor leaves the screen and returns to the Chassis Cursor.
_Avoid_: Reverse absorption, ejection

**Hotspot**:
The exact pointer location represented by the tip of the arrow. Visual deformation must never make the interaction point feel displaced.
_Avoid_: Cursor center, visual center

**Interactive Lock**:
The subtle stabilization of the CRT Cursor's orientation when its Hotspot is over an interactive target, without moving the Hotspot toward the target.
_Avoid_: Magnetic snapping, auto-aim, target attraction
