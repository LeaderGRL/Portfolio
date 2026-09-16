# CRT Cursor Absorption — Implementation Specification

- **Status:** Ready for implementation
- **Date:** 2026-09-16
- **Branch:** `prototype/crt-cursor-visuals`
- **Source decision:** `docs/adr/0001-crt-cursor-absorption.md`
- **Domain glossary:** `CONTEXT.md`

## 1. Summary

The JG-1500 keeps the native operating-system cursor over the physical chassis. When a fine pointer enters the powered CRT's real aperture, the display progressively captures it through a narrow Magnetic Zone, temporarily replacing the native cursor with a deformable SVG. The SVG stretches, rotates with movement, phosphorizes, appears to pass through the glass, then hands off atomically to a GPU-rendered CRT Cursor.

Inside the CRT, the pointer remains an arrow, is rendered as part of the electronic signal, receives the same tube optics as the content, and stays exactly aligned with the browser interaction hotspot. Leaving the tube performs a quieter inverse Release.

The feature must not dirty or re-upload the document/terminal source texture on pointer movement.

## 2. Goals

1. Make the CRT feel like a physical electronic surface rather than a flat web viewport.
2. Keep the chassis interaction completely conventional with the native cursor.
3. Make the transition into the CRT expressive, elastic and premium without affecting click accuracy.
4. Render the inside cursor through the existing WebGL CRT pipeline so curvature, scanlines, grille, bloom and other optical treatment remain coherent.
5. Preserve performance by keeping pointer animation independent from source raster invalidation.
6. Preserve accessibility, external iframe usability, power-state semantics and existing navigation behavior.

## 3. Non-goals

- Replacing the native cursor over the whole portfolio.
- Adding a persistent cursor trail.
- Creating a hand, caret, reticle or other contextual cursor shapes.
- Moving the real browser hotspot toward interactive elements.
- Applying a full-screen jelly/vortex deformation.
- Rebuilding the current CRT renderer or display-source architecture.
- Forcing custom pointer rendering inside cross-origin documents that the parent cannot control.

## 4. Existing architecture constraints

The implementation must integrate with the current system instead of creating a second display path.

- `App` owns the single `CRT` instance and application state.
- `RenderController` drives the frame loop and calls `app.crt.render(state, sourceDirty)`.
- `CRT.render()` uploads the source texture only when `sourceDirty || !sourceUploaded`.
- The current WebGL pipeline uses a persistence pass followed by the final CRT composite pass.
- The visible display may contain parent-controlled raster content and parent-visible cross-origin integration layers.
- `state.power`, `state.powerTarget`, `state.crt`, `state.crtTarget`, `state.degauss`, `state.static`, `state.warm` and `state.time` already define CRT runtime state.

The cursor implementation must preserve these responsibilities.

## 5. Eligibility

### FR-001 — Pointer capability

The cinematic cursor behavior is enabled only for a hover-capable fine pointer.

Minimum eligibility:

```text
(hover: hover) and (pointer: fine)
```

Touch interaction must never hide the native/touch interaction model or create a synthetic cursor.

### FR-002 — Power requirement

Absorption and the CRT Cursor exist only while the CRT is powered.

`powerTarget <= 0` is authoritative and immediately cancels any cursor cinematic or electronic cursor state.

### FR-003 — Reduced motion

When `prefers-reduced-motion: reduce` is active:

- retain the logical native-cursor / CRT-cursor distinction;
- skip stretch, suction, glass deformation, recoil and recomposition overshoot;
- perform the ownership switch directly and quietly at the aperture boundary.

## 6. Canonical states

The feature must use an explicit state machine rather than independent CSS booleans.

```text
NATIVE_OUTSIDE
    |
    | enters Magnetic Zone
    v
ABSORBING
    |              \
    | Snap          \ reverses before Snap
    v                v
CRT_ACTIVE       NATIVE_OUTSIDE
    |
    | crosses exit threshold
    v
RELEASING
    |
    | release complete
    v
NATIVE_OUTSIDE

CRT_ACTIVE / ABSORBING / RELEASING
    |
    | cross-origin pointer ownership
    v
NATIVE_EXTERNAL
    |
    | parent regains pointer while still inside CRT
    v
CRT_ACTIVE

Any state
    |
    | CRT power off
    v
NATIVE_OUTSIDE
```

`NATIVE_EXTERNAL` is a technical ownership fallback, not a physical screen transition. It must not replay Absorption or Release.

## 7. Pointer model

### FR-010 — Exact hotspot

The browser interaction coordinate is always the source of truth.

- The visible arrow tip represents the real pointer position.
- Rotation, stretch, compression, refraction and optical distortion may affect the arrow body but must not create a perceived offset at the tip.
- Click dispatch remains native browser behavior.
- No synthetic click forwarding is required for normal portfolio content.

### FR-011 — Motion sample

Track at minimum:

- current client-space pointer position;
- previous pointer position;
- filtered speed;
- movement direction;
- last stable angle;
- active pointer type;
- whether the pointer is over a parent-controlled interactive target;
- whether a cross-origin integration currently owns interaction.

Direction must only update the stored angle when movement magnitude exceeds a small anti-jitter threshold. At rest, preserve the last stable angle.

### FR-012 — Body inertia

The tip remains exact while the visible arrow body may exhibit controlled lag/stretch on abrupt direction changes. This inertia must be visual only and must not alter hit testing.

## 8. CRT aperture geometry

### FR-020 — Real aperture boundary

Do not use the rectangular `#tube` bounds as the final capture test.

Create one canonical `TubeAperture` geometry helper capable of returning, for a client-space point:

```text
signedDistancePx
nearestBoundaryPoint
inwardNormal
normalizedTubeUv
```

The function must follow the visible squircle/tube aperture closely enough that entry appears to happen on the glass edge at desktop, fullscreen and supported responsive layouts.

A calibrated superellipse/rounded-aperture model is acceptable if it matches the authored glass asset; the geometry must be centralized and testable rather than duplicated in CSS/JS branches.

### FR-021 — Magnetic Zone

The Magnetic Zone occupies approximately **12–20 px** around the inside edge of the real aperture.

The exact tuned value may vary slightly with rendered scale, but the perceived depth should remain consistent across desktop resolutions.

### FR-022 — Hysteresis

Entry and exit use different signed-distance thresholds.

The state must remain stable when the pointer oscillates around the edge. There must be no repeated native/SVG/GPU flicker from sub-pixel motion or small hand tremors.

## 9. Absorption sequence

### FR-030 — Native-to-SVG takeover

On first entry into the Magnetic Zone:

1. capture the native pointer position and current movement vector;
2. create/show the canonical SVG arrow at the exact same hotspot;
3. hide the native cursor for the controlled CRT region;
4. enter `ABSORBING`;
5. begin magnetic, visual and audio preparation.

There must be no visible positional jump during takeover.

### FR-031 — Canonical SVG

Use one canonical arrow geometry for both DOM/SVG and GPU rendering.

Visual structure:

- `outer`: phosphor-green silhouette;
- `inner`: smaller warm mint/white core.

The arrow must remain clearly recognizable as a normal pointer, be compact, and stay close to the perceived size of the system cursor.

The geometry should be original but may use the Curzr reference as movement/proportion inspiration.

### FR-032 — Initial appearance

At the first capture frame, the SVG should visually approximate the native cursor rather than appearing fully phosphorized instantly.

### FR-033 — Magnetic force

Magnetic influence is a non-linear ease-in based primarily on penetration through the Magnetic Zone.

Conceptually:

```text
captureProgress = saturate(remap(distance, zoneStart, snapThreshold))
magneticStrength = easeIn(captureProgress)
```

Do not make the force linear.

### FR-034 — Trajectory and stretch

During `ABSORBING`:

- the tip is visually captured first;
- the body stretches behind it;
- movement follows the real pointer trajectory with a slight inward correction from the local aperture normal;
- the arrow may curve slightly;
- the body shows marked but premium elasticity;
- cartoon exaggeration is allowed only in a controlled amount.

### FR-035 — Rotation

Trajectory-based rotation begins immediately on entry into the Magnetic Zone.

Rotation follows the movement direction rather than the CRT centre or surface normal.

### FR-036 — Speed modulation

Pointer speed may shorten/sharpen or lengthen/soften the cinematic within bounded limits.

Target total absorption duration: approximately **180–240 ms**.

Speed must not produce radically different timing or skip the readable stages.

### FR-037 — Reversibility

If the user reverses direction before Snap:

- Absorption must reverse continuously;
- stretch relaxes rather than teleporting;
- local glass/signal deformation relaxes;
- the native cursor returns at the exact hotspot;
- no Snap audio is played;
- state returns to `NATIVE_OUTSIDE`.

### FR-038 — Clicks during absorption

Clicking during `ABSORBING` behaves normally.

The animation must not delay, swallow, redirect or force completion of the transition.

## 10. Phosphorization

### FR-040 — Conversion curve

The native-looking SVG progressively becomes the CRT phosphor arrow as magnetic strength increases.

Phosphorization is synchronized with the same eased capture progress used by suction.

Near the start of the Magnetic Zone the cursor remains close to system appearance. Near Snap it is predominantly the green + mint CRT treatment.

## 11. Glass and signal reaction

### FR-050 — Local-only deformation

Absorption creates a local reaction centred at the capture point.

The reaction combines:

- subtle local signal displacement/refraction;
- local scanline curvature;
- local highlight/shadow cues suggesting the glass is being pulled inward;
- a small local phosphor response.

The rest of the display remains stable.

### FR-051 — Readability

Text, images and controls near the reaction may move by a few pixels but must remain readable and clickable.

### FR-052 — Glass recoil

After Snap, the local reaction slightly overshoots neutral and performs a short damped return to rest.

Do not create a full-screen bounce.

## 12. Snap and handoff

### FR-060 — Snap

Snap is the decisive point where the SVG is pulled through the glass and becomes the GPU cursor.

Immediately before handoff:

- perform a brief squash;
- the tip appears to cross behind the glass first;
- the already-submerged portion receives subtle refraction/attenuation suggesting glass thickness.

### FR-061 — Atomic ownership switch

The DOM/SVG cursor and GPU cursor must never appear as two independent pointers for a visible frame.

At Snap:

1. GPU cursor state is prepared for the current exact hotspot, angle and size;
2. GPU visibility becomes active;
3. DOM/SVG capture representation is removed/hidden in the same animation frame.

No crossfade is required.

### FR-062 — Recomposition

The initial GPU cursor may use a very small compression/overshoot before settling.

This must remain shorter and smaller than the main Absorption gesture.

## 13. GPU rendering architecture

### FR-070 — No source invalidation

Pointer movement must **not** set `app.dirty`, force document repainting, or cause `gl.texImage2D(... this.source)` uploads.

The existing invariant must remain true:

```text
source texture upload only when sourceDirty || !sourceUploaded
```

### FR-071 — Cursor bypasses phosphor persistence

The CRT Cursor must not be composited into the persistence pass because the accepted design explicitly has no cursor trail.

The persistence pass continues to contain only the current raster source and its decay history.

### FR-072 — Cursor is part of the final electronic signal

Extend the final CRT composite so its sampled signal conceptually becomes:

```text
signal(suv) = persistedSource(suv) + cursorEmission(suv)
```

The cursor emission must be present before the optical effects that should affect the cursor, including at minimum:

- barrel/tube geometry;
- chromatic treatment;
- edge defocus;
- horizontal overshoot;
- bloom;
- scanlines;
- aperture grille;
- noise/warmth treatment.

This preserves Optical Coupling while avoiding persistence trails.

### FR-073 — Shared tube mapping

The final shader must use one shared tube-mapping function for both source sampling and cursor anchor mapping.

The cursor anchor starts as the actual output-space pointer UV. The same mapping used for the displayed signal must be applied to that anchor so the arrow tip remains visually aligned with the real pointer even near curved edges.

Do not maintain a separate approximate curvature formula for the cursor.

### FR-074 — GPU cursor data

The render path must accept cursor runtime data without source raster updates.

Minimum logical fields:

```text
visible
outputUv
angle
sizePx
compression
hoverStrength
clickImpulse
recomposeStrength
```

Additional glass-reaction uniforms may include:

```text
reactionUv
reactionStrength
reactionDirection
recoilStrength
```

Uniform names are implementation-defined; the data contract is not.

### FR-075 — GPU shape source

The GPU representation must derive from the same canonical two-layer arrow geometry as the SVG phase.

Preferred implementation:

- rasterize/upload the canonical cursor mask once at initialization or use an equivalent immutable GPU representation;
- encode outer/inner coverage separately;
- update only uniforms on pointer movement.

Do not rebuild/upload a cursor texture per frame.

### FR-076 — CRT toggle

`state.crtTarget` / CRT-effect toggle does not disable the cursor ownership model or Absorption.

When analog CRT treatment is visually disabled, the electronic cursor remains but naturally receives the reduced treatment dictated by the existing CRT state.

## 14. Active CRT Cursor behavior

### FR-080 — Orientation

While moving, orientation follows the filtered movement direction.

At low speed:

- keep the last stable angle;
- do not oscillate;
- do not return to a default direction.

### FR-081 — Idle

There is no autonomous idle pulse, breathing animation or position jitter.

### FR-082 — Brightness

Cursor brightness remains constant relative to its own state. It does not sample the background to auto-adjust luminance.

### FR-083 — No trail

No persistent motion trail, afterimage chain or ghost cursor is added.

Normal whole-screen CRT optics may affect the instantaneous cursor image, but the cursor itself must not participate in phosphor persistence.

## 15. Interactive targets

### FR-090 — Target classification

Parent-controlled elements that are genuinely actionable should be classified for Interactive Lock, including applicable:

- links;
- buttons;
- softkeys;
- project/article selectable regions;
- narration controls;
- local 3D input proxies;
- other elements explicitly marked as interactive by existing application semantics.

The feature should rely on semantic/actionable DOM state rather than visual class names alone where possible.

### FR-091 — Interactive Lock

When the hotspot is over an actionable target:

- stabilize arrow orientation moderately;
- apply slight body compression;
- increase phosphor intensity subtly;
- do not move the hotspot;
- do not aim the arrow at the target centre.

### FR-092 — Shape remains arrow

The cursor never morphs into a hand or caret inside the CRT.

### FR-093 — Click feedback

On a genuine interactive activation:

- brief cursor contraction;
- phosphor impulse;
- micro local glass compression/flash;
- subtle electronic click sound.

Empty-space clicks do not trigger the interaction sound.

## 16. Page/content transitions

### FR-100 — Tube ownership

The CRT Cursor belongs to the physical tube, not the current page/source.

When navigation changes `route`, `item`, terminal content, article content, or display source while the pointer remains inside the CRT:

- keep the same cursor state and position;
- do not replay Absorption;
- do not temporarily hide the cursor;
- do not reset orientation unnecessarily.

## 17. Release

### FR-110 — Exit threshold

Use the hysteresis exit threshold from the canonical aperture geometry rather than the same threshold as capture.

### FR-111 — Quieter inverse

Release is intentionally less spectacular than Absorption.

It includes:

- small inverse retraction;
- progressive loss of phosphor treatment;
- subtle glass crossing/refraction;
- native cursor restoration at the exact hotspot.

Do not replay the full stretch/recoil sequence in reverse.

### FR-112 — Atomic GPU-to-native handoff

The GPU cursor must disappear as the native cursor becomes available at the same visible hotspot, without a prolonged double cursor.

## 18. Power transitions

### FR-120 — Power off during Absorption

If `powerTarget` becomes off during `ABSORBING`:

- cancel the cinematic immediately;
- clear local reaction state;
- restore native cursor at the real hotspot;
- suppress Snap sound;
- transition to `NATIVE_OUTSIDE`.

### FR-121 — Power off while active

If power turns off while `CRT_ACTIVE` or `RELEASING`:

- hide GPU cursor immediately as part of the power-state transition;
- restore native cursor;
- do not leave any phosphor pointer visible on a powered-off CRT.

## 19. Cross-origin and external content

### FR-130 — Parent-controlled overlays

For parent-controlled DOM overlays and local integrations, keep the CRT Cursor active and continue normal interaction.

### FR-131 — Cross-origin fallback

When a cross-origin iframe owns the pointer and parent pointer tracking is no longer reliable:

- hide/suspend the GPU cursor before stale positioning becomes visible;
- allow the iframe/native cursor to operate normally;
- enter `NATIVE_EXTERNAL`.

### FR-132 — Return from external ownership

When the parent regains pointer ownership while the pointer is still within the CRT aperture:

- restore `CRT_ACTIVE` directly at the current real hotspot;
- do not replay Absorption or Release;
- preserve/derive a stable movement angle from the first valid parent samples.

## 20. Audio

### FR-140 — Snap sound

Play a very short, subtle electronic micro-sound at successful Snap only.

It must follow the existing global audio volume/mute state completely.

### FR-141 — Click sound

Play the cursor click sound only when a genuine interactive action is activated.

Do not add audio to empty-space pointerdown events.

## 21. CSS / DOM layering

The DOM capture cursor and local reaction visuals must sit in the physical CRT stack without blocking content interaction.

Required behavior:

- cursor/reaction visual nodes use `pointer-events: none`;
- the native cursor is hidden only while the feature owns pointer representation;
- existing `.display-surface`, inline integration, glass shade and gloss interaction order remains functional;
- glass reaction visual treatment must not create a new interaction layer above buttons/iframes.

The final z-index choice should preserve the illusion that the cursor passes through the glass at Snap rather than remaining permanently painted on top of the glass.

## 22. Suggested module boundaries

These names are recommendations, not mandatory filenames.

### `crt-cursor-controller.js`

Owns:

- state machine;
- pointer samples;
- power/reduced-motion eligibility;
- interactive target classification;
- iframe ownership transitions;
- audio triggers;
- DOM/GPU handoff orchestration.

### `crt-cursor-geometry.js`

Owns:

- aperture signed-distance evaluation;
- nearest edge / inward normal;
- Magnetic Zone and hysteresis thresholds;
- client/tube/output UV conversion.

Pure functions should be preferred so geometry can be unit-tested without WebGL.

### `crt-cursor-view.js`

Owns:

- canonical SVG capture representation;
- native-looking → phosphor visual interpolation;
- elastic stretch/squash;
- local glass reaction overlay;
- DOM cleanup.

### `CRT` extension

Owns:

- immutable GPU cursor shape resource;
- cursor/reaction uniforms;
- final-composite cursor emission;
- no cursor involvement in the persistence pass.

### `RenderController` integration

Owns only frame orchestration:

- advance cursor controller/view state;
- pass current cursor GPU state to CRT renderer;
- do not mark source dirty merely because the cursor moved.

## 23. Removal of throwaway prototype

The production implementation supersedes the current development-only prototype.

Before the feature is considered complete:

- remove `src/crt-cursor.prototype.js`;
- remove `src/crt-cursor.prototype.css`;
- remove the dev-only dynamic import from `src/main.js`;
- remove prototype variant HUD/switcher/query-string behavior;
- remove any trail-specific prototype code.

Do not evolve the throwaway variant switcher into production architecture.

## 24. Performance requirements

### NFR-001 — Source upload stability

A pointer-only motion sequence over the CRT must not increase source texture upload count.

### NFR-002 — Frame work

Normal pointer motion should require only:

- small JS state updates;
- uniform updates / existing frame render;
- lightweight DOM transform updates only while Absorption/Release is active.

### NFR-003 — Allocation discipline

Do not allocate new arrays, SVG nodes, canvas textures or WebGL resources on every `pointermove` or animation frame.

### NFR-004 — No layout-thrash loop

Avoid repeated forced layout reads/writes inside the pointer event itself.

Tube metrics may be cached and invalidated on resize/fullscreen/layout changes. Per-frame reads must be justified and measured.

### NFR-005 — Existing render cadence

The feature must reuse the existing animation frame loop or a coordinated animation frame, not create competing indefinite render loops that duplicate CRT drawing.

## 25. Accessibility requirements

### NFR-010 — Reduced motion

Reduced-motion behavior must be testable and must remove the cinematic portions described in FR-003.

### NFR-011 — Native interaction semantics

Custom visuals may not remove keyboard focus, native click semantics, accessible names or existing screen-reader behavior.

### NFR-012 — System cursor scale

Where browser/platform information permits, preserve the perceived scale of the system pointer. Otherwise use a conservative default near the standard pointer size; do not upscale for spectacle.

## 26. Test plan

### Unit tests

Create deterministic tests for:

1. aperture signed distance at centre, edges, corners and outside points;
2. inward normal direction;
3. Magnetic Zone progress;
4. entry/exit hysteresis;
5. reversal before Snap;
6. direction filtering and last-angle preservation;
7. speed-to-duration clamping;
8. state-machine transitions;
9. power-off cancellation;
10. reduced-motion direct transition;
11. external ownership fallback/resume.

### Runtime / smoke tests

Add checks that:

1. production entry point no longer imports the throwaway prototype;
2. required cursor modules/assets are bundled;
3. CRT exposes cursor state without changing source texture ownership;
4. cursor uniforms/resources initialize once;
5. WebGL failure/fallback does not leave `cursor:none` stuck on the page.

### E2E tests

Using Playwright desktop fine-pointer projects:

1. chassis shows native pointer ownership and no cursor overlay;
2. entering Magnetic Zone starts SVG phase before full aperture entry;
3. reversing exits cleanly without Snap;
4. full entry ends in GPU cursor ownership;
5. pointer tip remains aligned near centre and all four curved edges;
6. hovering actionable controls activates Interactive Lock without positional snapping;
7. clicks during Absorption still activate the real target;
8. page navigation while inside does not replay Absorption;
9. power off restores native cursor;
10. reduced motion removes the cinematic;
11. cross-origin activation switches to native fallback and returns directly to CRT cursor;
12. rapid edge oscillation does not flicker between representations.

### GPU/performance regression test

Instrument or spy on source uploads during a pointer-only test:

1. render a stable source;
2. move the pointer repeatedly inside the CRT for multiple frames;
3. assert that source `texImage2D` upload count does not increase due to cursor movement;
4. assert that real source changes still upload normally.

### Visual regression coverage

Capture at minimum:

- absorption mid-stretch;
- pre-Snap squash;
- active CRT Cursor at centre;
- active cursor near each curved corner/edge;
- Interactive Lock state;
- click impulse;
- release frame;
- CRT effect off but cursor interaction active;
- reduced-motion active state.

Visual snapshots must use deterministic cursor test hooks rather than real-time timing races.

## 27. Acceptance criteria

The feature is accepted only when all of the following are true.

### AC-001
The physical chassis uses the native OS cursor and no decorative replacement.

### AC-002
A powered CRT begins capture in a 12–20 px perceived Magnetic Zone matching the real tube contour rather than the rectangular element box.

### AC-003
The native-to-SVG takeover occurs without a visible position jump.

### AC-004
Absorption is reversible before Snap and border oscillation does not flicker.

### AC-005
The arrow tip remains aligned with the real click hotspot throughout SVG and GPU phases.

### AC-006
Successful Absorption lasts approximately 180–240 ms under ordinary movement and changes only within bounded limits with pointer speed.

### AC-007
The cursor progressively converts from system-like appearance to green phosphor + mint core during capture.

### AC-008
The local signal/glass reaction remains localized and readable.

### AC-009
Snap performs an atomic SVG→GPU switch with no visible duplicate cursor frame.

### AC-010
The GPU cursor is affected by the same CRT optical mapping/effects as display content while avoiding phosphor persistence trails.

### AC-011
Pointer-only movement does not dirty/repaint the source or trigger source texture re-upload.

### AC-012
The active cursor rotates with movement, preserves its last angle at rest, remains approximately system-cursor sized, has no idle animation and has no trail.

### AC-013
Interactive targets use moderate orientation lock + subtle compression/phosphor intensification without moving the hotspot or morphing into a hand.

### AC-014
Clicks during Absorption and while active retain normal browser interaction semantics.

### AC-015
Navigation/content changes inside the tube keep the CRT Cursor continuous.

### AC-016
Release is visibly quieter than entry and restores the native cursor at the exact hotspot.

### AC-017
CRT visual-effect OFF keeps the physical cursor interaction; CRT power OFF forces native cursor only.

### AC-018
Reduced motion preserves the logical cursor ownership switch while removing stretch, glass deformation and recoil.

### AC-019
Cross-origin iframe interaction remains usable through native fallback and does not replay physical boundary cinematics when pointer ownership returns.

### AC-020
The throwaway prototype files/imports are removed before merge.

### AC-021
Existing quality, runtime, content, E2E and visual-regression suites remain green, with new cursor-specific coverage added.

## 28. Implementation order

Recommended sequence:

1. Introduce pure aperture geometry + state-machine tests.
2. Introduce canonical SVG asset and DOM capture view with exact hotspot.
3. Implement Absorption/Release, hysteresis and reduced-motion behavior without GPU handoff yet.
4. Add immutable GPU cursor resource + runtime uniform contract.
5. Inject cursor emission into the final CRT composite while keeping it out of persistence.
6. Implement atomic SVG↔GPU handoff and Optical Coupling.
7. Add glass/signal reaction and recoil.
8. Add Interactive Lock/click impulse/audio.
9. Add power-state and cross-origin ownership handling.
10. Remove throwaway prototype.
11. Add full E2E/performance/visual regression coverage and tune values without changing the accepted interaction model.

## 29. Tuning parameters allowed during implementation

The following values may be tuned without reopening the ADR as long as the accepted behavior remains recognizable:

- exact Magnetic Zone width within the accepted 12–20 px target;
- easing coefficients;
- anti-jitter movement threshold;
- rotation smoothing;
- stretch amount;
- squash amount;
- exact 180–240 ms duration mapping;
- glass displacement amplitude;
- recoil damping;
- phosphor intensity;
- Interactive Lock strength within the accepted medium/subtle range;
- click impulse duration;
- audio sample/gain envelope.

Any change to cursor identity, hotspot behavior, trail policy, GPU-vs-native ownership, release philosophy, cross-origin fallback, power semantics or reduced-motion philosophy requires an ADR update rather than tuning.
