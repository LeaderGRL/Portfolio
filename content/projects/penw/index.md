---
title: PROJECT ECHO : NEON WAVE
sub: Rhythm game built for a custom physical arcade cabinet
status: UNITY · ARCADE · IOT
year: 2023
stack: [Unity, C#, Arduino, IoT, Hardware]
theme: synthwave
link: https://www.youtube.com/watch?v=gchRNrRPOwI
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

::embed{provider=youtube id=gchRNrRPOwI label="GAMEPLAY DEMO" title="Project Echo: Neon Wave gameplay"}

## THE MACHINE

The project eventually became a real custom arcade cabinet. An existing wooden cabinet was measured, adapted and redesigned around the game. The recovered structure used 19 mm MDF, and the control panel had to be rebuilt around the mechanics rather than forcing the game into an existing layout.

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

::pipeline{label="AUTHORING LOOP"}
AUDIO | IMPORT TRACK + READ TIMING
CHART AUTHORING | PLACE NOTES AGAINST THE MUSIC
LEVEL DATA | SAVE THE PLAYABLE SEQUENCE
UNITY PLAYTEST | TEST RHYTHM, FEEDBACK AND DIFFICULTY
::

The editor evolved alongside the game instead of being treated as a disposable internal utility. That experience strongly influenced how I think about production tools today: reducing iteration cost is often as valuable as optimizing runtime code.

## VISUAL DIRECTION

The project went through multiple synthwave background iterations, menu experiments and character concepts before converging on its final identity. Echo, the mascot, was explored through clothing, hair, face, weapon and even an abandoned 3D figurine attempt.

The important lesson was not simply producing more assets, but learning to compare iterations against the actual constraints of an arcade screen: motion readability, contrast, note visibility and the amount of visual noise behind gameplay.

## DEVELOPMENT TIMELINE

::timeline
2021-10 | Project starts and first gameplay prototypes
2021-11 | Note destruction and early rhythm loop
2021-12 | Menu and level selection experiments
2022-01 | Echo mascot exploration
2022-03 | Level editor and camera systems
2022-04 | Long notes and 3D mascot experiment
2022-05 | New control-panel design
2022-11 | Hardware testing and cabinet work
2022-12 | Level-editor redesign
2023-01 | Background and visual asset iterations
2023-02 | Buttons, particles and control integration
2023-04 | Final cabinet integration and presentation
::

## WHAT THIS PROJECT TAUGHT ME

PENW forced me to think beyond the boundary of the game engine. A bug could come from Unity code, an input device, physical mounting, a level authoring workflow or simply poor visual feedback. Solving those problems required treating the entire installation as one system.

That systems view — tools, runtime, hardware, UX and iteration cost — is the part of the project that still influences my engineering work the most.
