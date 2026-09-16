# ADR-0001 — CRT Cursor Absorption Interaction

- **Status:** Accepted
- **Date:** 2026-09-16
- **Branch:** `prototype/crt-cursor-visuals`
- **Scope:** Desktop fine-pointer interaction on the JG-1500 chassis and powered CRT

## Context

The JG-1500 portfolio deliberately treats the CRT as a physical object rather than a flat website viewport. A generic custom cursor would weaken that illusion, while keeping the native cursor unchanged over the display would miss an opportunity to make the CRT feel like an active electronic surface.

The interaction therefore needs two distinct pointer identities:

- the normal operating-system cursor over the physical chassis;
- an electronic arrow that becomes part of the CRT signal once the pointer is absorbed through the glass.

The transition must feel physical, elastic and memorable without reducing click accuracy, interfering with navigation, forcing source-texture uploads on every pointer move, or breaking external embedded content.

This ADR records the complete grill session that established the interaction.

## Decision

The JG-1500 uses a **native Chassis Cursor** outside the powered CRT and a **CRT Cursor** inside it.

When the pointer enters a narrow **Magnetic Zone** following the real tube contour, the native cursor is replaced at the exact same hotspot by a deformable SVG arrow. The CRT progressively pulls that SVG through the glass. The cursor stretches, rotates with the real movement trajectory, phosphorizes, locally deforms the glass and displayed signal, then performs a short squash at the **Snap**. At that exact instant, ownership transfers from the DOM/SVG representation to the GPU-rendered CRT Cursor in the real display pipeline.

The reverse **Release** is deliberately quieter than the entry.

The effect is visual only: the real pointer hotspot remains exact at all times and user interaction is never delayed, redirected or magnetically moved.

## Canonical interaction

### Outside the CRT

- Use the operating-system cursor.
- Do not add a decorative chassis cursor.
- Do not add a trail.
- If the CRT is powered off, always use the native cursor.

### Magnetic capture

- The Magnetic Zone follows the actual squircle/tube contour and local normals, not the rectangular DOM bounds.
- Target capture depth: roughly **12–20 px**.
- Attraction uses a non-linear **ease-in** curve: almost imperceptible near the outer edge, increasingly strong toward the Snap.
- Entry and exit thresholds use invisible **hysteresis** to prevent rapid oscillation at the border.
- As soon as the pointer enters the Magnetic Zone, the native cursor is hidden and replaced by the SVG at the same hotspot.
- The SVG initially resembles the system pointer and progressively phosphorizes as the attraction becomes stronger.
- Rotation starts immediately when magnetic capture starts and follows the real movement direction.
- Reversing before the Snap releases the field elastically and restores the native cursor naturally.

### Absorption

- Duration is short but expressive: approximately **180–240 ms**, with bounded speed modulation.
- The tip is grabbed first.
- The body stretches with lag, slight curvature and controlled cartoon elasticity.
- The real hotspot remains locked to the arrow tip.
- Pointer speed influences timing and deformation within a controlled range.
- The displayed signal and the glass react locally around the suction point.
- The effect remains readable; there is no full-screen vortex or jelly deformation.
- The cursor can still click normally during the entire transition.

### Snap and GPU handoff

- Immediately before handoff, the SVG performs a very brief squash.
- The pointer appears to pass very briefly behind the glass rather than simply disappearing on its surface.
- The already-submerged part gets subtle refraction/attenuation to imply glass thickness.
- The SVG-to-GPU handoff happens at the Snap in the same frame, with no visible crossfade.
- The newly reconstructed CRT Cursor gets a small recomposition overshoot.
- The local glass deformation performs a small damped recoil before returning to rest.

### CRT Cursor

- Remains unmistakably arrow-shaped.
- Uses a Curzr-inspired but original sculpted silhouette.
- Uses two perfectly coupled visual layers:
  - phosphor-green `outer` silhouette;
  - warm mint/white luminous `inner` core.
- Both layers deform together.
- Size stays approximately comparable to the system cursor rather than becoming a large decorative pointer.
- Rotation follows movement direction.
- At very low speed or rest, preserve the last valid orientation; do not jitter and do not auto-return to a default angle.
- The tip/hotspot remains exact while the body may show slight controlled inertia/stretch on abrupt directional changes.
- Brightness is constant and does not adapt to the content behind it.
- There is no idle animation and no trail.
- The cursor is optically coupled to the CRT signal, including tube curvature and edge distortion.

### Interactive targets

- The pointer remains an arrow on buttons, links and other targets; it never morphs into a hand.
- Interactive targets use a medium, elegant **Interactive Lock**: the body orientation stabilizes subtly without moving or auto-aiming the hotspot.
- Hover feedback is a slight compression plus phosphor intensification.
- Clicking a genuine interactive target adds:
  - SVG contraction;
  - phosphor impulse;
  - micro local glass compression/flash;
  - a subtle interaction sound.
- Empty-space clicks do not produce the interaction sound.

### Release

- Exit is quieter than entry.
- The CRT Cursor loses phosphor treatment as it approaches the edge.
- It passes back through the glass with a subtler version of the refraction used at entry.
- It returns to the native system cursor at the exact hotspot.
- Do not replay the full spectacular absorption in reverse.

### CRT state and accessibility

- Turning the CRT visual-effect toggle off does **not** disable Absorption; the physical monitor interaction remains active.
- With the CRT powered off, use the native cursor only.
- Under `prefers-reduced-motion`, retain the logical native-to-electronic pointer handoff but remove the cinematic absorption, stretch, glass deformation and recoil.

### External integrations

- Use the GPU CRT Cursor wherever the portfolio controls pointer rendering.
- When a cross-origin iframe or external integration owns the pointer and the parent cannot reliably track it, fall back to the native cursor.
- Crossing that technical ownership boundary while still physically inside the CRT must **not** replay Absorption or Release; it is an implementation fallback, not a physical screen-boundary event.
- When control returns to the portfolio while the pointer is still inside the CRT, restore the CRT Cursor directly at the real hotspot.

### Audio

- The Absorption Snap gets a very short, subtle electronic micro-sound.
- It must not sound arcade-like.
- It follows the global JG-1500 volume and mute state completely.
- Volume `0` means silence.
- Click audio occurs only for genuine interactive actions.

## Final choices completed after the grill

The user delegated the remaining decisions to the implementation/design pass. They are resolved as follows.

### Power cut during capture or while inside the CRT

A CRT power-off is authoritative. Any in-progress Absorption is cancelled immediately and the native cursor is restored at the exact hotspot. If the cursor is already GPU-rendered, ownership returns to the native cursor in the same power-state transition. Do not leave an electronic cursor visible on a powered-off screen and do not introduce a delayed interaction lockout.

### Cross-origin pointer ownership

A cross-origin iframe is treated as a technical rendering boundary, not a physical CRT boundary. Native fallback is allowed only while required. Re-entering portfolio-controlled rendering while still inside the tube restores the CRT Cursor directly without replaying the cinematic.

### Final SVG proportions

Use a compact, two-layer arrow inspired by the movement language of Curzr but not copied. Preserve a clear pointer tip, a slightly sculpted/dynamic body and enough internal area for the mint core. Size should track the perceived scale of a normal system cursor rather than being hard-designed as an oversized portfolio effect. Accessibility cursor scaling should be respected where practical instead of assuming one universal decorative size.

## Complete grill record

The entries below preserve the numbered questions and accepted answers from the design session.

| # | Question / decision frontier | Accepted answer |
|---|---|---|
| Q1 | What should the cursor become inside the CRT? | **B** — Keep a recognizable arrow, reconstructed as a sophisticated electronic SVG inspired by Curzr. |
| Q2 | How should the arrow orient while moving? | **B** — Free Curzr-like rotation driven by the pointer movement direction. |
| Q3 | What visual material should define the CRT Cursor? | **B** — Solid premium phosphor: filled silhouette, controlled glow and luminous core rather than a thin outline/gimmick. |
| Q4 | What should the chassis-to-CRT transition fundamentally be? | **E (custom)** — The CRT absorbs the cursor: suction, slightly cartoon/elastic deformation, then retraction into the display. |
| Q5 | How elastic should the absorption be? | **B** — Marked elasticity: tip grabbed first, body stretches behind it, then snaps inward. |
| Q6 | Should the glass itself react? | **B** — Local glass reaction with refraction/scanline/halo deformation near the entry point and a small rebound. |
| Q7 | How should the reconstructed cursor appear after the Snap? | **B** — Small recomposition rebound: briefly compressed phosphor arrow, slight overshoot, then stabilization. |
| Q8 | How should exit compare with entry? | **C** — Quieter release: inverse retraction, phosphor extinction, glass relaxation, then system cursor. |
| Q9 | Should the cursor leave a trail inside the CRT? | **A** — No trail. |
| Q10 | When should absorption start? | **B** — Start in a magnetic band before full entry, with progressive attraction and final Snap. |
| Q11 | How should the CRT Cursor react to interactive elements? | **B** — Subtle premium response rather than a strong morph: controlled shape/intensity change and slight lock. |
| Q12 | What visual feedback should a click have? | **C** — SVG contraction + phosphor impulse + micro local glass compression/flash. |
| Q13 | Should pointer speed affect absorption? | **C** — Yes, within a controlled bounded range. |
| Q14 | What phosphor palette should the arrow use? | **B** — Green phosphor body with a warm white/mint luminous core. |
| Q15 | Where is the interaction hotspot? | **B** — Exactly at the arrow tip. |
| Q16 | How large should the CRT Cursor be? | **A** — Approximately the same perceived size as the system cursor. |
| Q17 | What direction should the suction follow? | **C** — Follow the real pointer trajectory with a slight inward correction. |
| Q18 | How much movement inertia should the arrow body have? | **B** — Small controlled body lag/stretch while the tip stays perfectly aligned with the real pointer. |
| Q19 | Should the final cursor actually enter the CRT rendering pipeline? | **B** — Yes. Use DOM/SVG for the elastic transition, then real GPU CRT rendering inside the display. |
| Q20 | When should SVG ownership transfer to the GPU? | **B** — Exactly at the Snap. |
| Q21 | What happens when the CRT visual-effect toggle is disabled? | **A** — Absorption remains active; it belongs to the physical monitor interaction. |
| Q22 | How should embedded/external content be handled? | **C** — GPU cursor wherever controlled; native fallback only where technically required, such as cross-origin iframes. |
| Q23 | What should reduced-motion mode do? | **B** — Preserve the logical native→electronic transition but remove the cinematic motion/deformation. |
| Q24 | What happens when the CRT is powered off? | **A** — Native cursor only; no Absorption and no electronic cursor. |
| Q25 | What shape should the Magnetic Zone follow? | **C** — The real tube/squircle geometry and its local normals, not a rectangular screen box. |
| Q26 | What happens if the user reverses before the Snap? | **B** — Fully reversible elasticity: SVG/glass relax naturally and the magnetic field releases. |
| Q27 | How long should absorption take? | **B** — Short but expressive, roughly **180–240 ms**, slightly speed-modulated. |
| Q28 | Can visual suction move the actual click point? | **B** — No. Stretch/curve the visual body while the Hotspot remains exact. |
| Q29 | Should the displayed signal react too? | **B** — Yes, subtle local deformation of content/scanlines near the suction point with a small rebound. |
| Q30 | What silhouette should the SVG use? | **B** — Original Curzr-inspired sculpted arrow with dynamic proportions, outer body and luminous core. |
| Q31 | What happens to orientation when movement stops? | **A** — Preserve the last valid orientation. |
| Q32 | Should cursor brightness adapt to the background? | **A** — No. Keep phosphor brightness constant. |
| Q33 | Should interactive targets influence orientation? | **B** — Slight visual Interactive Lock with the Hotspot unchanged. |
| Q34 | How strong should Interactive Lock be? | **B** — Medium and elegant. |
| Q35 | What is the hover response on an interactive target? | **C** — Slight compression plus phosphor intensification. |
| Q36 | How cartoon-like should the elasticity be? | **B** — Subtle cartoon: pronounced enough to read, but still premium rather than toy-like. |
| Q37 | What should the absorption sound like? | **B** — Very short, subtle electronic micro-sound; not arcade-like. |
| Q38 | How does absorption audio relate to the volume control? | **A** — Fully follows global volume and mute. |
| Q39 | When should click audio play? | **C** — Only for genuine interactive actions, never empty-space clicks. |
| Q40 | How should the SVG be layered? | **A** — Two layers: phosphor `outer` and luminous `inner`. |
| Q41 | Should the two layers deform independently? | **A** — No. They deform perfectly together. |
| Q42 | What happens immediately before the GPU handoff? | **B** — Very brief SVG squash before the Snap, without an extra flash effect. |
| Q43 | What should the glass do immediately after complete absorption? | **B** — Small damped Glass Recoil, with a tiny overshoot back toward rest. |
| Q44 | When should trajectory-based rotation begin? | **A** — Immediately on entry into the Magnetic Zone. |
| Q45 | How should rapid border oscillation be stabilized? | **B** — Invisible hysteresis with distinct entry/exit thresholds. |
| Q46 | How wide should the Magnetic Zone be? | **B** — Medium, approximately **12–20 px**. |
| Q47 | How should magnetic force increase through the zone? | **B** — Non-linear ease-in: weak at first, rapidly stronger near the Snap. |
| Q48 | What happens if the user clicks during absorption? | **A** — The click remains completely normal; the effect never blocks or delays interaction. |
| Q49 | What happens to the CRT Cursor during page/content transitions inside the screen? | **A** — It remains continuous at the same physical position; it belongs to the tube, not the page. |
| Q50 | Should an idle CRT Cursor animate while stationary? | **A** — No. Keep it perfectly stable. |
| Q51 | Should tube curvature deform the CRT Cursor? | **A** — Yes. It is optically coupled to the same CRT curvature/distortion as the displayed signal. |
| Q52 | Should the cursor change into a hand/caret on contextual targets? | **A** — No. Always remain an arrow; interaction is communicated through lock/compression/phosphor response. |
| Q53 | When should the native cursor be replaced by the deformable SVG? | **A** — Immediately on entry into the Magnetic Zone, at the exact same Hotspot. |
| Q54 | What should the SVG look like at the first instant of replacement? | **A** — Initially resemble the system cursor, then progressively phosphorize during absorption. |
| Q55 | How should phosphorization progress? | **A** — Synchronize it with magnetic force: weak at first, increasingly electronic toward the Snap. |
| Q56 | Should the cursor appear to pass behind the glass at the Snap? | **A** — Yes, very briefly, with the tip crossing first before GPU reconstruction. |
| Q57 | Should glass thickness be perceptible during that crossing? | **A** — Yes, subtly, through brief refraction/attenuation. |
| Q58 | Should Release also contain a glass-crossing cue? | **A** — Yes, but more discreet than entry. This question duplicated the already established quieter-Release rule and does not introduce a new domain decision. |

## Technical constraints implied by the decision

These are implementation constraints, not new visual decisions.

1. **Pointer movement must not invalidate/re-raster the main source texture every frame.** The CRT cursor should be composed with GPU uniforms, geometry or a dedicated GPU path so normal mouse movement does not force document/source uploads.
2. **Hotspot correctness is non-negotiable.** Visual stretching, rotation, optical distortion and body inertia may never displace the actual interaction coordinate.
3. **The SVG→GPU switch must be visually atomic.** Avoid a visible dual cursor or a multi-frame crossfade at the Snap.
4. **Border tests must use the real tube shape.** Rectangular `mouseenter`/`mouseleave` alone cannot define the interaction.
5. **Cross-origin iframes must remain usable.** Native fallback is preferable to attempting to fake pointer ownership the browser does not expose.
6. **Accessibility wins over spectacle.** Reduced-motion removes the cinematic while preserving pointer clarity and correct interaction.
7. **The physical power state wins over cursor effects.** A powered-off CRT cannot retain an electronic cursor.

## Consequences

### Positive

- The CRT behaves like a physical/electronic object rather than a styled div.
- The cursor effect reinforces the portfolio identity without contaminating the chassis with a gimmicky custom cursor.
- The most spectacular animation is concentrated at a meaningful physical boundary.
- Click accuracy and normal pointer semantics remain intact.
- The GPU phase naturally inherits the real CRT shader treatment.
- The system has explicit fallbacks for reduced motion, power-off state and cross-origin content.

### Costs

- The interaction requires coordinated DOM/SVG and GPU state.
- Accurate tube-boundary distance/normal evaluation is needed for the Magnetic Zone.
- The handoff, hysteresis and iframe fallback need dedicated regression tests.
- Fine tuning is required to keep the cartoon elasticity expressive without making the portfolio feel toy-like.

## Rejected directions

- Custom decorative cursor across the whole chassis.
- Large Awwwards-style circles/blobs.
- Reticle/probe cursor language.
- Persistent cursor trails.
- Full-screen glass wobble or vortex effects.
- Auto-aim or movement of the real hotspot toward interactive targets.
- Contextual hand cursor morphing inside the CRT.
- Disabling the physical Absorption interaction merely because the analog CRT-effect toggle is off.
- Replaying the complete absorption cinematic for cross-origin ownership changes.

## Validation criteria

The decision is correctly implemented when all of the following hold:

- The chassis uses the native OS cursor.
- Entering the powered CRT visibly begins capture before full entry, following the real tube contour.
- Reversing near the border cleanly cancels capture without flicker.
- The exact click point always matches the visible arrow tip.
- Pointer movement does not continuously dirty the main rasterized source.
- The Snap produces no duplicate cursor frame.
- Inside the CRT, the cursor receives the same optical CRT treatment as the signal.
- Interactive hover/click feedback is subtle and does not move the hotspot.
- Page transitions do not reset/reabsorb the cursor while it remains inside the tube.
- Reduced-motion removes the cinematic.
- CRT power-off restores the native cursor immediately.
- Cross-origin iframe interaction remains usable through native fallback.
