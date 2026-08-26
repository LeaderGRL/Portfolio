---
title: PROJECT ECHO : NEON WAVE
sub: Rhythm game built for a custom physical arcade cabinet
status: UNITY · ARCADE · IOT
year: 2023
stack: [Unity, C#, Arduino, IoT, Hardware]
theme: synthwave
link: /media/penw/D%C3%A9monstration%20Project%20Echo%20_%20Neon%20Wave.mp4
---

::facts{columns=2 label="PROJECT SNAPSHOT"}
GENRE | RHYTHM GAME / ARCADE
ENGINE | UNITY
ROLE | PROJECT LEAD + GAMEPLAY
PLATFORM | CUSTOM ARCADE CABINET
INPUT | BUTTONS + ROTARY ENCODERS
TOOLING | WEB LEVEL EDITOR
SYSTEMS | UNITY + IOT + HARDWARE
PERIOD | 2021 — 2023
::

## THE EXPERIENCE

Project Echo: Neon Wave was designed as a complete arcade experience rather than only a game executable. The software, physical cabinet, rotary controls, level editor and visual language were developed as parts of the same system.

The core loop asks the player to destroy notes in rhythm while handling long notes, directional movement and rotary-controlled sliders. Camera motion and visual feedback reinforce the musical structure instead of existing only as decoration.

::video{src="/media/penw/Démonstration Project Echo _ Neon Wave.mp4" alt="Project Echo: Neon Wave gameplay demo"}

::gallery{columns=2}
/media/penw/level-select.webp | Dynamic level selection and scoreboard
/media/penw/gameplay-camera.webp | Rotary input also drives the radial camera response
::

## THE MACHINE

The project eventually became a real custom arcade cabinet. An existing wooden cabinet was measured, adapted and redesigned around the game. The recovered structure used 19 mm MDF, and the control panel had to be rebuilt around the mechanics rather than forcing the game into an existing layout.

::gallery{columns=2 fit=contain}
/media/penw/cabinet-photo.webp | Recovered wooden cabinet used as the physical starting point
/media/penw/cabinet-plan.webp | Measurements used to redesign the machine around the game
::

::facts{columns=2 label="CABINET SYSTEM"}
STRUCTURE | RECOVERED 19 MM MDF CABINET
CONTROLS | CUBIC BUTTONS + ROTARY ENCODERS
COMPUTE | RASPBERRY PI + ARDUINO
AUDIO | SPEAKER + AMPLIFIER
PANEL | CUSTOM MEASURED CONTROL SURFACE
DISPLAY | GAME + CABINET DESIGNED TOGETHER
::

The cabinet below is rendered locally with Three.js from the original project geometry. Its visible pixels stay inside the document framebuffer, so rotation and lighting pass through the same CRT shader as the text and local media around it.

::model3d{src=/media/penw/arcade-cabinet.glb label="ARCADE CABINET / LOCAL THREE.JS" autospin=0.06 exposure=1.12 shadow=off}

The original control surface did not match the mechanics, so measurements became a new panel designed around the actual buttons and rotary encoders rather than around the shape of the recovered cabinet.

::compare{before=/media/penw/control-panel-plan.webp after=/media/penw/control-panel-design.webp beforeLabel="MEASUREMENTS" afterLabel="NEW CONTROL PANEL" fit=contain}

::gallery{columns=2 fit=contain}
/media/penw/control-panel-detail.webp | Control layout and dimensions
/media/penw/cabinet-wrap.webp | Visual wrap explored for the physical cabinet
::

## INPUT SYSTEM

The game combines conventional arcade buttons with rotary encoders. The physical input design and the gameplay mechanic were developed together: turning a real control moves the corresponding slider in the game, making the cabinet part of the mechanic rather than a shell around it.

::pipeline{label="PHYSICAL INPUT LOOP"}
PHYSICAL CONTROL | ARCADE BUTTONS + ROTARY ENCODERS
INPUT BRIDGE | HARDWARE SIGNAL / IOT LAYER
UNITY INPUT | GAMEPLAY STATE + NOTE LOGIC
PLAYER FEEDBACK | SLIDER MOVEMENT + CAMERA RESPONSE
::

::note
SYSTEM DESIGN — SOFTWARE, HARDWARE AND GAMEPLAY WERE ITERATED AS ONE INPUT LOOP.
::

## LEVEL TOOLING

A dedicated web level editor was created to import music, inspect its audio structure and place notes against the timeline. This tooling became important because content iteration speed directly affected the quality of the rhythm design.

::media{src=/media/penw/level-editor.webp label="JAVASCRIPT LEVEL EDITOR / WAVEFORM + NOTE AUTHORING" fit=contain height=286 background=off}

::facts{columns=2 label="AUTHORING TOOL"}
INPUT | IMPORT A MUSIC TRACK
ANALYSIS | READ THE AUDIO WAVEFORM
AUTHORING | PLACE NOTES AGAINST MUSICAL PEAKS
OUTPUT | BUILD PLAYABLE LEVEL DATA
::

The editor evolved alongside the game instead of being treated as a disposable internal utility. That experience strongly influenced how I think about production tools today: reducing iteration cost is often as valuable as optimizing runtime code.

## VISUAL DIRECTION

The visual identity was iterated against the constraints of an arcade screen: note readability, motion, contrast and the amount of background noise all mattered more than how impressive a still image looked in isolation.

::media{src=/media/penw/background-prototype.webp label="3D GAMEPLAY BACKGROUND PROTOTYPE / REJECTED FOR EXCESSIVE VISUAL NOISE" fit=cover height=260}

The rejected 3D background above was useful precisely because it exposed the wrong trade-off. It looked richer as a standalone scene, but competed too strongly with notes and timing information during actual play.

::media{src=/media/penw/logo-design.webp label="PROJECT ECHO / SYNTHWAVE IDENTITY" fit=contain height=220}

Echo, the project mascot, went through multiple visual experiments as the identity matured. The character work was exploratory rather than a separate production pipeline: it helped establish the tone of the machine and its surrounding presentation.

::gallery{columns=2 fit=contain}
/media/penw/echo-concept.webp | Echo character concept exploration
/media/penw/echo-3d.webp | Abandoned 3D mascot experiment
::

## DEVELOPMENT TIMELINE

::timeline
2021 Q4 | Core rhythm prototype and first playable note systems
2022 Q1 | Menu, mascot direction, camera systems and early authoring tools
2022 Q2 | Long notes, control-panel redesign and physical-input planning
2022 Q4 | Cabinet hardware tests and major level-editor iteration
2023 Q1 | Background, UI, particles and control-integration polish
2023 Q2 | Final cabinet integration and project presentation
::

## WHAT THIS PROJECT TAUGHT ME

PENW forced me to think beyond the boundary of the game engine. A bug could come from Unity code, an input device, physical mounting, a level authoring workflow or simply poor visual feedback. Solving those problems required treating the entire installation as one system.

That systems view — tools, runtime, hardware, UX and iteration cost — is the part of the project that still influences my engineering work the most.
