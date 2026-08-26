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

The important part is the return trip. Finding information is only the beginning; extracting it forces the player back through spaces that may no longer be safe. Progress therefore creates exposure instead of simply rewarding exploration from a menu.

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

Its responsibilities are deliberately narrow:

- observe global player and run information;
- score possible responses through Utility AI;
- influence pacing and suggest useful areas of pressure;
- preserve the creature's need to search locally.

That separation is what keeps escalation from feeling like the game is cheating. The Director may understand the dramatic state of the run, but the creature still needs evidence before it can act with confidence.

### CREATURE AI

The Creature AI is the embodied threat. Its Behavior Tree coordinates investigation, search and pursuit using information obtained from its own perception rather than inheriting the Director's complete knowledge.

Running creates louder evidence. Thrown objects can pull attention away from the player. Breaking line of sight can force a search around the last useful information instead of producing an automatic pursuit through walls.

- **hearing** reacts to movement and deliberate distractions;
- **sight** confirms the player only when local perception allows it;
- **search** explores last-known or suggested areas;
- **escape** matters because the creature can genuinely lose certainty.

::note
HORROR RULE — THE DIRECTOR MAY KNOW MORE THAN THE CREATURE. THE CREATURE STILL HAS TO EARN LOCAL KNOWLEDGE THROUGH PERCEPTION.
::

## PLAYER PRESSURE SYSTEMS

Movement creates a continuous trade-off. Walking is safer but slower; running spends stamina and produces more noise. Environmental objects can be collected and thrown, turning ordinary interaction into a way to manipulate what the creature believes about the player's position.

Several supporting systems reinforce that same pressure without needing a conventional HUD-heavy presentation:

- a shared world-interaction contract used across gameplay objects;
- invisible inventory storage for ammunition, SD cards, stackable items and unique objects;
- a weapon-mounted flashlight for navigation through dark spaces;
- fisheye body-cam presentation with camera and weapon sway.

::video{src="/media/Leak/Leak _ Character demo V1.mp4" alt="LEAK character and player-system demonstration"}

The flashlight was also explored as a danger indicator. Instead of adding another meter to the screen, its behavior could become less stable as the creature gets closer, making the environment itself communicate pressure.

## BODY CAM

The camera direction aims for the physical imperfection of body-camera footage rather than a clean game camera. A wide fisheye-like lens, eye/chest positioning, walking sway and weapon sway were used to make movement feel embodied and slightly unstable.

The visual effect only works if it supports the game underneath it. Interaction, navigation and threat readability still need to remain understandable, so the body-cam treatment is constrained by gameplay rather than treated as a post-process showcase.

## DECRYPTION PUZZLE

The encrypted-file mechanic was designed as a diegetic computer interaction. One explored direction was to let the player adjust an audio frequency or effect in real time until a damaged recording becomes understandable.

::pipeline{label="DECRYPTION FLOW"}
RECOVER DATA | FIND AN ENCRYPTED FILE OR SD CARD
REACH COMPUTER | EXPOSE THE PLAYER AT A FIXED TERMINAL
TUNE SIGNAL | ADJUST AUDIO PROCESSING / FREQUENCY PARAMETERS
DECRYPT | RECONSTRUCT THE INFORMATION
PROGRESS | TURN THE RESULT INTO NEW NARRATIVE KNOWLEDGE
::

This became a technical challenge because the interaction combined diegetic Unreal UI with real-time audio processing. Research included dynamically manipulating bitcrush/distortion-style effects rather than reducing the puzzle to a conventional menu.

## ENVIRONMENT PRODUCTION

The manor was chosen because it could feel prestigious, enormous, abandoned and claustrophobic at the same time. Scope and available production time influenced the floor plan, and some environment work began before the detailed game design was fully formalized.

That exposed a production lesson early: spaces built around abandoned mechanics eventually had to be revised. The ground floor, kitchen, bathroom, bedroom and interrogation room were therefore not just art-production tasks; their usefulness depended on how the final systems asked the player to move through them.

The result changed the way we treated environment scope. A room had to justify itself through navigation, pressure, information or interaction rather than existing because it had already been produced.

## CHARACTER ART / SKULL

The Skull study demonstrates a different optimization problem from the AI and gameplay work. Separate budgets were prepared for the asset's actual use instead of treating the highest-detail version as the universal target.

The cinematic version was around **150K polygons**, while the game version targeted roughly **60K**, with six texture sheets supporting the final material work. The interesting decision was not simply reducing polygons; it was deciding where that detail still mattered once the asset moved from close-up presentation to real-time use.

::embed{provider=youtube id=Myl4n_aTp5g label="SKULL OPTIMIZATION" title="LEAK Skull optimization"}

::embed{provider=sketchfab uid=9e3a24e3e08840d69fc031b9c1a0e55d label="SKULL 3D" title="LEAK Skull 3D model"}

## DESIGN / TEAM PROCESS

The project was split between development and Game Art responsibilities. On the development side, work was organized in approximately ten-day sprints. Progress, blockers, delays and next tasks were reviewed as a team rather than allowing implementation to drift independently from the game design.

Game-design decisions were centralized in shared documents and Miro. That formalization mattered because the environment had already demonstrated the cost of producing content before mechanics and constraints were aligned.

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
