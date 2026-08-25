---
title: PROJECT ECHO : NEON WAVE
sub: Rhythm game built for a custom physical arcade cabinet
status: UNITY · ARCADE · IOT
year: 2023
stack: [Unity, C#, Arduino, IoT, Hardware]
theme: synthwave
link: https://www.youtube.com/watch?v=gchRNrRPOwI
---

::hero{eyebrow="ARCADE RHYTHM GAME / PHYSICAL SYSTEM" title="PROJECT ECHO : NEON WAVE" subtitle="A rhythm game designed together with its own cabinet, controls, level tooling and visual identity." height=226}

## THE EXPERIENCE

Project Echo: Neon Wave was designed as a complete arcade experience rather than only a game executable. The software, physical cabinet, rotary controls, level editor and visual language were developed as parts of the same system.

The core loop asks the player to destroy notes in rhythm while handling long notes, directional movement and rotary-controlled sliders. Camera motion and visual feedback reinforce the musical structure instead of existing only as decoration.

::embed{provider=youtube id=gchRNrRPOwI title="Project Echo: Neon Wave gameplay" height=216}

## THE MACHINE

The project eventually became a real custom arcade cabinet. An existing wooden cabinet was measured, adapted and redesigned around the game. The control panel had to accommodate traditional arcade inputs as well as rotary encoders used by the slider mechanic.

The 3D cabinet below is the original project model hosted on Sketchfab. It uses the same generic integration block that any future portfolio project can reuse.

::embed{provider=sketchfab uid=d1fa122dc2d4447a949b151b83e7df02 title="Project Echo arcade cabinet" height=236}

## INPUT SYSTEM

The game combines conventional arcade buttons with rotary encoders. The physical input design and the gameplay mechanic were developed together: turning a real control moves the corresponding slider in the game, making the cabinet part of the mechanic rather than a shell around it.

::note
SYSTEM DESIGN — SOFTWARE, HARDWARE AND GAMEPLAY WERE ITERATED AS ONE INPUT LOOP.
::

## LEVEL TOOLING

A dedicated level editor was created to place notes against audio, iterate on timing and produce playable charts. This tooling became important because content iteration speed directly affected the quality of the rhythm design.

The editor evolved alongside the game instead of being treated as a disposable internal utility. That experience strongly influenced how I think about production tools today: reducing iteration cost is often as valuable as optimizing runtime code.

## VISUAL DIRECTION

The project went through multiple synthwave background iterations, menu experiments and character concepts before converging on its final identity. Echo, the mascot, was explored through clothing, hair, face, weapon and even an abandoned 3D figurine attempt.

The important lesson was not simply producing more assets, but learning to compare iterations against the actual constraints of an arcade screen: motion readability, contrast, note visibility and the amount of visual noise behind gameplay.

## DEVELOPMENT TIMELINE

::timeline
2021-10 | Project starts and first gameplay prototypes
2021-11 | Note destruction and early rhythm loop
2021-12 | Menu and level selection experiments
2022-03 | Level editor and camera systems
2022-06 | Visual direction and gameplay iteration
2022-11 | Cabinet measurements and hardware planning
2023-02 | Rotary encoders, particles and control integration
2023-04 | Final cabinet integration and presentation
::

## WHAT THIS PROJECT TAUGHT ME

PENW forced me to think beyond the boundary of the game engine. A bug could come from Unity code, an input device, physical mounting, a level authoring workflow or simply poor visual feedback. Solving those problems required treating the entire installation as one system.

That systems view — tools, runtime, hardware, UX and iteration cost — is the part of the project that still influences my engineering work the most.
