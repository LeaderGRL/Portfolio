---
title: LEAK
sub: Systemic first-person horror built around adaptive pressure, information and escape
status: UNREAL ENGINE · HORROR · AI
year: 2023
stack: [Unreal Engine, AI, Game Design, Horror]
theme: horror
link: /media/Leak/Leak.mp4
---

::facts{columns=2 label="PROJECT SNAPSHOT"}
GENRE | HORROR / SCIENCE-FICTION
ENGINE | UNREAL ENGINE
PERSPECTIVE | FIRST PERSON / BODY CAM
PLAYER ROLE | FRENCH SPECIAL FORCES
CORE LOOP | EXPLORE + RECOVER + DECRYPT + SURVIVE
THREAT | ADAPTIVE CREATURE
AI MODEL | DIRECTOR AI + CREATURE AI
SETTING | ISOLATED FRENCH MANOR
::

## THE EXPERIENCE

LEAK is a first-person horror project set inside an isolated French manor used for clandestine scientific experiments. The player enters as a member of French special forces, recovers evidence left around the site and tries to understand what happened while a creature turns every route through the manor into a risk.

The horror is built around vulnerability rather than combat dominance. The player is treated as prey: observation, route choice, noise management, distraction and escape are more important than defeating the threat directly.

::video{src="/media/Leak/Leak.mp4" alt="LEAK project presentation and gameplay"}

## NARRATIVE PRESSURE

The experiments at the manor are tied to a scientist trying to save his daughter from an incurable illness. His attempt succeeds only in the worst possible sense: the experiments make her effectively immortal while transforming her into the creature that now inhabits the site.

That premise supports the mechanical structure. Evidence is not only collectible lore: encrypted files and SD cards create reasons to enter unsafe rooms, return to terminals and remain exposed long enough to decrypt information.

## SURVIVAL LOOP

::pipeline{label="INFORMATION / SURVIVAL LOOP"}
EXPLORE | MOVE THROUGH THE MANOR AND READ THE ENVIRONMENT
RECOVER | FIND CLUES, FILES AND SD CARDS
RETURN | REACH A COMPUTER WHILE THE CREATURE REMAINS ACTIVE
DECRYPT | SOLVE THE INFORMATION PUZZLE
LEARN | UNLOCK NEW STORY INFORMATION
ADAPT | CHANGE ROUTES, DISTRACT THE CREATURE AND SURVIVE
::

The loop deliberately creates return trips. Finding a file is only the beginning; extracting useful information requires the player to expose themselves again while the AI continues to create pressure.

::video{src="/media/Leak/Leak - Hiding system demo V1.mp4" alt="LEAK hiding system demonstration"}

## ADAPTIVE AI

LEAK separates global dramatic pressure from the creature's local knowledge. The architecture was inspired by the two-level AI structure associated with systemic horror games such as *Alien: Isolation*: one system can shape the encounter globally without giving the physical creature perfect information.

::system{columns=2 label="AI ARCHITECTURE"}
DIRECTOR AI | MACRO SYSTEM THAT TRACKS PLAYER STATE AND GLOBAL PRESSURE
CREATURE AI | MICRO SYSTEM THAT OWNS LOCAL PERCEPTION AND ACTIONS
UTILITY AI | DIRECTOR SCORES POSSIBLE RESPONSES FROM CONTEXT
BEHAVIOR TREE | CREATURE ORGANIZES SEARCH, INVESTIGATION AND PURSUIT
PERCEPTION | SENSORS REACT TO PLAYER MOVEMENT, NOISE AND EVIDENCE
INFORMATION GAP | CREATURE MUST STILL SEARCH AND CAN LOSE THE PLAYER
::

### DIRECTOR AI

The Director has privileged knowledge of the run and can periodically influence where the creature should apply pressure. Its job is not to teleport an omniscient enemy onto the player; it evaluates the situation using Utility AI and nudges the experience toward useful levels of tension.

::facts{columns=2 label="DIRECTOR RESPONSIBILITIES"}
KNOWLEDGE | GLOBAL PLAYER / RUN INFORMATION
DECISION MODEL | UTILITY AI
GOAL | MANAGE PACING AND PRESSURE
OUTPUT | SUGGEST AREAS / RESPONSES TO THE CREATURE
CONSTRAINT | DOES NOT REPLACE LOCAL SEARCH
HORROR VALUE | ESCALATE WITHOUT MAKING FAILURE FEEL SCRIPTED
::

### CREATURE AI

The Creature AI is the embodied threat. It uses its own sensors and Behavior Tree to investigate, search and pursue. The distinction matters because the player can meaningfully hide, change route or create misleading evidence instead of fighting against perfect information.

::system{columns=2 label="CREATURE COUNTERPLAY"}
HEARING | RUNNING AND THROWN OBJECTS CREATE INFORMATION
SIGHT | LOCAL VISUAL PERCEPTION CAN CONFIRM THE PLAYER
SEARCH | INVESTIGATE LAST-KNOWN OR SUGGESTED AREAS
DISTRACTION | THROWN OBJECTS CAN PULL ATTENTION ELSEWHERE
ESCAPE | BREAK CONTACT AND FORCE THE CREATURE TO SEARCH AGAIN
UNCERTAINTY | PLAYER CAN NEVER ASSUME THE CREATURE KNOWS EVERYTHING
::

::note
HORROR RULE — THE DIRECTOR MAY KNOW MORE THAN THE CREATURE. THE CREATURE STILL HAS TO EARN LOCAL KNOWLEDGE THROUGH PERCEPTION.
::

## PLAYER PRESSURE SYSTEMS

Movement creates a continuous trade-off. Walking is safer but slower; running spends stamina and generates more noise. Objects can be collected and thrown to create distractions, turning environmental interaction into a way to manipulate the creature's information.

::system{columns=2 label="PLAYER SYSTEMS"}
MOVEMENT | WALK QUIETLY OR RUN WITH STAMINA / NOISE CONSEQUENCES
DISTRACTION | PICK UP AND THROW OBJECTS TO CREATE SOUND
INTERACTION | SHARED WORLD INTERACTION CONTRACT FOR THE TEAM
INVENTORY | INVISIBLE STORAGE FOR AMMO, SD CARDS, STACKABLE AND UNIQUE ITEMS
FLASHLIGHT | WEAPON-MOUNTED LIGHT FOR DARK NAVIGATION
BODY CAM | FISHEYE VIEW, CAMERA SWAY AND WEAPON SWAY
::

::video{src="/media/Leak/Leak _ Character demo V1.mp4" alt="LEAK character and player-system demonstration"}

The flashlight was also explored as a possible danger indicator: its behavior could become less stable as the creature gets closer, communicating threat without adding a conventional HUD meter.

## BODY CAM

The camera direction aims for the physical imperfection of body-camera footage rather than a clean game camera. A wide fisheye-like lens, eye/chest positioning, walking sway and weapon sway were used to make movement feel embodied and slightly unstable.

The important design constraint is that the visual effect must reinforce vulnerability and spatial uncertainty. The body-cam look is useful only if interaction, navigation and threat readability still work underneath it.

## DECRYPTION PUZZLE

The encrypted-file mechanic was designed as a diegetic computer interaction. One explored direction was to let the player adjust an audio frequency/effect in real time until a damaged or encrypted recording becomes understandable.

::pipeline{label="DECRYPTION FLOW"}
RECOVER DATA | FIND AN ENCRYPTED FILE OR SD CARD
REACH COMPUTER | EXPOSE THE PLAYER AT A FIXED TERMINAL
TUNE SIGNAL | ADJUST AUDIO PROCESSING / FREQUENCY PARAMETERS
DECRYPT | RECONSTRUCT THE INFORMATION
PROGRESS | TURN THE RESULT INTO NEW NARRATIVE KNOWLEDGE
::

This became a technical challenge because the interaction combined diegetic Unreal UI with real-time audio processing. Research included dynamically manipulating bitcrush/distortion-style effects rather than reducing the puzzle to a conventional menu.

## ENVIRONMENT PRODUCTION

The manor was chosen because it could feel prestigious, enormous, abandoned and claustrophobic at the same time. Scope and available production time influenced the floor plan, and some environment work began before the detailed game design was fully formalized. That exposed a production lesson: spaces created for abandoned mechanics later had to be revised rather than treated as sunk design constraints.

::facts{columns=2 label="MANOR PRODUCTION"}
LOCATION | ISOLATED FRENCH MANOR
MOOD | MAJESTIC + ABANDONED + HOSTILE
PLANNING | FLOOR PLAN SCALED TO TIME AND TEAM CAPACITY
ITERATION | EARLY ENVIRONMENT WORK WAS REVISED WITH GAME DESIGN
PRODUCED AREAS | GROUND FLOOR, KITCHEN, BATHROOM, BEDROOM
SPECIAL SPACE | INTERROGATION ROOM
::

## CHARACTER ART / SKULL

The Skull study demonstrates a different optimization problem from the AI/gameplay systems. Separate polygon budgets were prepared for cinematic and game use rather than treating the highest-detail asset as the universal target.

::facts{columns=2 label="SKULL OPTIMIZATION"}
CINEMATIC | ~150K POLYGONS
GAME | ~60K POLYGONS
TEXTURES | 6 TEXTURE SHEETS
STRATEGY | QUALITY SCALED BY ACTUAL USAGE
::

::embed{provider=youtube id=Myl4n_aTp5g label="SKULL OPTIMIZATION" title="LEAK Skull optimization"}

::embed{provider=sketchfab uid=9e3a24e3e08840d69fc031b9c1a0e55d label="SKULL 3D" title="LEAK Skull 3D model"}

## DESIGN / TEAM PROCESS

The project was split between development and Game Art responsibilities. On the development side, work was organized in approximately ten-day sprints: progress, blockers, delays and next tasks were reviewed as a team rather than allowing implementation to drift independently from the game design.

Game-design decisions were centralized in shared documents and Miro. That formalization mattered because parts of the environment had already demonstrated the cost of building production content before mechanics and constraints were aligned.

::embed{provider=miro src="https://miro.com/app/live-embed/uXjVNbgQeC8=/?moveToViewport=-43102,-63386,183701,88262&embedId=970581881101" label="GAME DESIGN BOARD" title="LEAK game design Miro board" height=230}

## DEVELOPMENT TIMELINE

::timeline
2023-01 | Environment and manor production
2023-06 | Character Art and optimization studies
2023-08 | Project-management structure and development process
2023-09 | Game-design formalization
2023-10 | Player movement and pressure mechanics
2023-11 | Universal interaction, flashlight and decryption-puzzle work
2023-12 | Inventory system
20XX | Body-cam presentation exploration
::

## ENGINEERING TAKEAWAY

LEAK is interesting as a systems project because fear does not come from a single AI class or visual effect. Pressure emerges from the relationship between Director knowledge, creature perception, player noise, return trips, environment readability and the player's uncertainty about what the threat knows.

The key engineering lesson is therefore information ownership. The Director, creature and player intentionally operate with different knowledge. Preserving those boundaries makes hiding, distraction and escape understandable systems instead of scripted horror decoration.
