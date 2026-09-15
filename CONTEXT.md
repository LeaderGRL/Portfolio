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

**Snap**:
The decisive instant at the end of Absorption where the stretched cursor retracts into the screen and becomes the CRT Cursor.
_Avoid_: Crossfade, dissolve

**Glass Reaction**:
The local physical-looking deformation of the CRT surface and nearby displayed signal caused by Absorption or a pointer click.
_Avoid_: Full-screen distortion, vortex

**Release**:
The quieter inverse transition used when the CRT Cursor leaves the screen and returns to the Chassis Cursor.
_Avoid_: Reverse absorption, ejection

**Hotspot**:
The exact pointer location represented by the tip of the arrow. Visual deformation must never make the interaction point feel displaced.
_Avoid_: Cursor center, visual center
