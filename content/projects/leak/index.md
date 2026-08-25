---
title: LEAK
sub: First-person horror built around adaptive pressure, exploration and survival
status: UNREAL ENGINE · HORROR · AI
stack: [Unreal Engine, AI, Game Design, Horror]
year: 2023
theme: horror
link: https://www.youtube.com/watch?v=_FgVGmmpo1c
---

::facts{columns=2 label="PROJECT SNAPSHOT"}
GENRE | HORROR / SCIENCE-FICTION
ENGINE | UNREAL ENGINE
PERSPECTIVE | FIRST PERSON / BODY CAM
CORE LOOP | EXPLORE + SURVIVE + DECRYPT
THREAT | ADAPTIVE CREATURE
AI MODEL | DIRECTOR AI + CREATURE AI
SETTING | ISOLATED FRENCH MANOR
STATUS | PROTOTYPE / DEVELOPMENT
::

## THE EXPERIENCE

LEAK is a first-person horror project set inside an isolated French manor used for clandestine scientific experiments. The player explores the site, recovers evidence and encrypted files, and tries to understand what happened while a creature turns movement through the manor into a constant risk.

The design treats the player as prey rather than as a conventional combatant. Progress depends on observation, navigation, puzzle solving and escaping pressure instead of simply defeating the threat.

::embed{provider=youtube id=_FgVGmmpo1c label="PROJECT PRESENTATION" title="LEAK project presentation"}

## GAMEPLAY LOOP

Files and clues create a reason to move through dangerous spaces. Recovering information is not enough: encrypted data must be brought back to computers in the manor and decrypted through puzzles, creating deliberate return trips while the creature remains active.

::pipeline{label="SURVIVAL LOOP"}
EXPLORE | MOVE THROUGH THE MANOR
RECOVER | FIND CLUES, FILES AND SD CARDS
REACH TERMINAL | RETURN TO A COMPUTER
DECRYPT | SOLVE THE INFORMATION PUZZLE
PROGRESS | UNLOCK NEW STORY INFORMATION
SURVIVE | EVADE THE CREATURE AND REPEAT
::

## ADAPTIVE AI

The creature is intended to be the center of the experience rather than a scripted obstacle. The AI architecture separates global pressure from local creature behavior, taking inspiration from the two-level structure used by systemic horror games.

::system{columns=2 label="AI SYSTEM"}
DIRECTOR AI | MONITORS RUN STATE, PACING AND PLAYER PRESSURE
CREATURE AI | OWNS PERCEPTION, MOVEMENT AND LOCAL DECISIONS
PERCEPTION | HEARING, SIGHT AND RECENT PLAYER EVIDENCE
SEARCH STATE | INVESTIGATES LAST-KNOWN AREAS WITHOUT PERFECT KNOWLEDGE
PRESSURE MODEL | CONTROLS WHEN THE EXPERIENCE SHOULD RELAX OR ESCALATE
PLAYER COUNTERPLAY | HIDING, DIVERSION, ROUTE CHANGES AND ESCAPE WINDOWS
::

::note
THE DIRECTOR CAN SHAPE PRESSURE WITHOUT GIVING THE CREATURE PERFECT INFORMATION. THE CREATURE STILL HAS TO SEARCH LOCALLY AND CAN LOSE THE PLAYER.
::

## BODY CAM / PLAYER SYSTEMS

The presentation aims for a body-camera feeling inspired by realistic first-person footage. Camera treatment, darkness, flashlight use, interaction systems and inventory all support the feeling of being physically present in an unsafe space.

::facts{columns=2 label="PLAYER SYSTEMS"}
CAMERA | BODY-CAM PRESENTATION
NAVIGATION | DARK ENVIRONMENTS + FLASHLIGHT
INTERACTION | WORLD OBJECT INTERACTION SYSTEM
INVENTORY | ITEM STORAGE
PUZZLES | ENCRYPTED FILE DECRYPTION
HORROR GOAL | STRESS + ANXIETY THROUGH PRESSURE
::

## CHARACTER ART / SKULL

The project also included optimized character-art studies. The Skull asset was prepared in different polygon budgets for cinematic and in-game use, with texture work split according to the intended quality level.

::facts{columns=2 label="SKULL OPTIMIZATION"}
CINEMATIC | ~150K POLYGONS
GAME | ~60K POLYGONS
TEXTURES | 6 TEXTURE SHEETS
TARGET | QUALITY SCALED BY USAGE
::

::embed{provider=youtube id=Myl4n_aTp5g label="SKULL OPTIMIZATION" title="LEAK Skull optimization"}

::embed{provider=sketchfab uid=9e3a24e3e08840d69fc031b9c1a0e55d label="SKULL 3D" title="LEAK Skull 3D model"}

## DESIGN PROCESS

Game-design decisions were centralized in shared documents and Miro boards. The goal was to formalize the experience, mechanics and team decisions instead of letting implementation details become the design by accident.

::embed{provider=miro src="https://miro.com/app/live-embed/uXjVNbgQeC8=/?moveToViewport=-43102,-63386,183701,88262&embedId=970581881101" label="GAME DESIGN BOARD" title="LEAK game design Miro board" height=230}

## DEVELOPMENT TIMELINE

::timeline
2023-01 | Environment and manor production
2023-06 | Character art
2023-08 | Project-management structure
2023-09 | Game-design formalization
2023-10 | Player mechanics
2023-11 | Interaction system and flashlight
2023-11 | File-decryption puzzles
2023-12 | Inventory system
20XX | Body-cam presentation exploration
::

## ENGINEERING TAKEAWAY

LEAK is useful as a systems project because the horror experience depends on several layers cooperating: AI pressure, creature perception, player information, environment readability, interaction rules and pacing. The interesting engineering problem is not any single subsystem in isolation, but how those systems shape what the player believes the creature knows.
