---
title: ASTRO
sub: A 2–4 player party game built around readable chaos, shifting alliances and a cooperative boss fight
status: UNREAL ENGINE · GAME DESIGN · PROGRAMMING
stack: [Unreal Engine, C++, Blueprints, Game Design, Gameplay Programming, Multiplayer, Audio]
theme: synthwave
link: https://github.com/LeaderGRL/A_back
---

::facts{columns=2 label="PROJECT SNAPSHOT"}
FORMAT | LOCAL PARTY GAME
PLAYERS | 2–4
ENGINE | UNREAL ENGINE
CORE STRUCTURE | COMPETE → COOPERATE → COMPARE SCORES
JORDAN GRILLY | GAME DESIGN + PROGRAMMING
PROGRAMMING FOCUS | CAMERA + PHASE TRANSITIONS
PRODUCTION | MULTIDISCIPLINARY TEAM
AUDIO | DOGMA / SOUND DESIGN
SOURCE | PUBLIC GAME REPOSITORY
::

## THE GAME

ASTRO is a colorful 2–4 player party game about creating tension between individual success and collective survival. The first part of a match lets players compete for resources and advantages; the pressure then changes when everyone has to face the same boss together. Cooperation becomes necessary, but the final comparison still gives every player a reason to protect their own score.

The design target was not complexity for its own sake. The project repeatedly comes back to three constraints: rules that can be understood quickly, enough uncertainty to create social reactions, and systems that remain readable when several players act at once.

::hero{media="gameplay.webp" eyebrow="ASTRO / PLAYABLE BUILD" title="COMPETE. ADAPT. SURVIVE TOGETHER." subtitle="A party-game loop designed around temporary cooperation without removing individual ambition." height=242 alt="ASTRO gameplay showing the colorful multiplayer game arena"}

## MY ROLE — DESIGN + PROGRAMMING

I worked on ASTRO as both a **Game Designer and Programmer**. That overlap was useful because several design problems were inseparable from implementation: how far players can move away from each other, what the shared camera should prioritize, how a boss phase changes framing, and how quickly playtest feedback can become a concrete revision.

Production notes explicitly assigned me the **camera** work as preproduction moved into development. I also worked with Eliott on the boss / camera transition, while continuing to own design synthesis: the team proposed solutions to identified design problems, I sorted and assembled those proposals, and disagreements were resolved collectively.

::system{columns=2 label="MY CONTRIBUTION"}
GAME DESIGN | SEMI-COOPERATIVE STRUCTURE, RULES AND PLAYTEST ITERATION
DESIGN SYNTHESIS | SORTING + ASSEMBLING TEAM PROPOSALS BEFORE DECISIONS
CAMERA PROGRAMMING | SHARED CAMERA, FRAMING, MOVEMENT AND ITERATION
BOSS TRANSITION | BOSS / CAMERA TRANSITION WORK WITH ELIOTT
CAMERA DESIGN | TOP-DOWN READABILITY + PHASE-SPECIFIC REFRAMING
FEEDBACK LOOP | TURN PLAYER OBSERVATIONS INTO DESIGN + IMPLEMENTATION TASKS
::

The interesting part of this double role was the iteration loop rather than the title itself: **define an intended player experience → implement the system that constrains it → playtest → adjust both the rule and the code**.

## DESIGN QUESTION

The central question was simple: **how do we make players need each other without removing the pleasure of trying to beat each other?**

A fully competitive game made every interaction easy to understand, but the social arc stayed flat. A fully cooperative game created a common objective, but reduced the tension produced by personal scoring. ASTRO therefore explored a structure where the relationship between players changes during the same match.

::pipeline{label="MATCH TENSION"}
COLLECT | PLAYERS BUILD THEIR OWN ADVANTAGE
CONTEST | MOVEMENT AND RESOURCES CREATE DIRECT COMPETITION
SURPRISE | EVENTS AND POWER-UPS DISRUPT A SOLVED ROUTE
BOSS | THE GROUP NOW SHARES A SURVIVAL PROBLEM
COOPERATE | INDIVIDUAL PLAYERS HAVE TO SUPPORT THE TEAM
RESULT | PERSONAL PERFORMANCE STILL MATTERS AT THE END
::

The documents also show that this premise was challenged rather than protected at all costs. Mandatory cooperation was debated and at one point deliberately reduced when it no longer seemed necessary to preserve the game's identity. That is an important part of the process: the USP was treated as a hypothesis to test, not a feature that had to survive because it had been written first.

## FROM IDEAS TO RULES

The design process was intentionally broad before it became selective. Working documents explored a golden egg, surprise mechanics, power-ups, weather events, scoring variants, multiplayer interactions and animation feedback. These were not treated as a checklist of features to ship. They were ways to test what actually strengthened the social loop.

::media{src="design-board.webp" label="GAME DESIGN REFLECTION" alt="ASTRO game design reflection board with gameplay ideas and iteration notes" height=264}

The useful question for every idea became: **does this create a decision or a reaction between players?** A mechanic that only added content but did not change a player's choice, timing or relationship to the others was a candidate for simplification or removal.

That filter also helped with scope. Party games are especially vulnerable to accumulating isolated mini-features; ASTRO's design work instead tried to keep additions attached to a small number of readable verbs and shared situations.

## READABLE CHAOS

Surprise was important, but randomness alone is not a design solution. An event has to be legible enough for players to understand why the match changed and what they can do next. The same applies to power-ups: the strongest social moments come from effects players can anticipate, react to and blame on each other in a playful way.

::system{columns=2 label="DESIGN PRINCIPLES"}
FAST READ | THE RULE SHOULD BE UNDERSTANDABLE WHILE PLAYING
VISIBLE CAUSE | PLAYERS SHOULD KNOW WHAT CHANGED THE SITUATION
COUNTERPLAY | A SURPRISE SHOULD CREATE A RESPONSE, NOT ONLY A PUNISHMENT
SOCIAL VALUE | SYSTEMS SHOULD CREATE HELP, RIVALRY OR NEGOTIATION
COMEBACK SPACE | THE MATCH SHOULD NOT FEEL DECIDED TOO EARLY
SCOPE VALUE | EVERY FEATURE MUST EARN ITS PRODUCTION COST
::

## WORLD AND BLOCKOUT

Environment production followed the same readability constraint. The volcano map blockout is useful because it shows the level before visual polish: routes, distances and encounter space can be evaluated before art makes the scene expensive to change.

::media{src="volcano-blockout.webp" label="VOLCANO MAP BLOCKOUT" alt="ASTRO volcano level blockout used to evaluate multiplayer routes and spacing" height=250}

For a multiplayer party game, this stage is not only level art preparation. Camera framing, player density, collision, traversal time and the amount of simultaneous information all affect whether the rules remain understandable.

## PROGRAMMING: CAMERA AS A GAMEPLAY SYSTEM

The camera was not just presentation work. In a local multiplayer game it determines how much freedom players have, when the group feels physically connected and how much information can remain readable on one screen.

The camera design used a **top-down 3/4 view** as the main shared perspective. Design documents then explored adaptive behavior for cases where the normal framing stops being sufficient: dynamic split-screen when local players move too far apart, reunification when they come back together, and temporary reframing for boss phases whose mechanics need a different spatial read.

::pipeline{label="CAMERA / DESIGN LOOP"}
DESIGN INTENT | KEEP 2–4 PLAYERS READABLE WITHOUT OVER-CONSTRAINING MOVEMENT
SHARED CAMERA | FRAME THE GROUP IN THE DEFAULT TOP-DOWN 3/4 VIEW
EDGE CASE | PLAYERS SEPARATE OR A BOSS PHASE CHANGES THE SPATIAL RULES
ADAPT | CHANGE FRAMING / TRANSITION BEHAVIOR FOR THE CURRENT SITUATION
PLAYTEST | WATCH FOR CAMERA DISTANCE, MOVEMENT AND READABILITY PROBLEMS
ITERATE | FEED RESULTS BACK INTO CAMERA PARAMETERS + GAME DESIGN
::

The production archive contains repeated camera feedback — camera distance, movement, boss transitions and the desired feeling of the framing — rather than treating the first implementation as finished. That is representative of my role on the project: implementation and Game Design were part of the same iteration cycle.

## PROJECT ARCHITECTURE: GAME FLOW AS STATES

The public Unreal project separates the core game, menu and state-machine code into distinct modules. The game-flow layer uses explicit state actors rather than scattering phase changes across unrelated gameplay classes.

::system{columns=2 label="GAME FLOW ARCHITECTURE"}
STATE OBJECT | EACH GAME PHASE OWNS ITS ENTER / MANAGE / EXIT LIFECYCLE
STATE MANAGER | HOLDS THE CURRENT STATE AND DRIVES ITS UPDATE
NEXT STATE | A STATE MAY DECLARE AN EXPLICIT SUCCESSOR
DELEGATES | STATES REQUEST TRANSITIONS WITHOUT OWNING THE MANAGER
BLUEPRINT BRIDGE | DYNAMIC MULTICAST DELEGATES KEEP FLOW USABLE FROM UE TOOLS
MODULE BOUNDARY | STATE MACHINE IS SEPARATED FROM ASTRO AND MENU MODULES
::

The `GameFlowStateManager` initializes the default state, calls its `Enter`, updates the current state's `Manage` function and performs an `Exit → switch → Enter` sequence on transition. Delegates are rebound when the state changes, which keeps the transition request on the state side while centralizing ownership of the active phase.

```cpp
void AGameFlowStateManager::SwitchState(AGameFlowState* SwitchingState)
{
    if (CurrentState)
    {
        CurrentState->Exit();
        CurrentState->SwitchNextStateDelegate.RemoveDynamic(this, &AGameFlowStateManager::SwitchNextState);
        CurrentState->SwitchStateDelegate.RemoveDynamic(this, &AGameFlowStateManager::SwitchState);
    }

    CurrentState = SwitchingState;
    CurrentState->SwitchNextStateDelegate.AddDynamic(this, &AGameFlowStateManager::SwitchNextState);
    CurrentState->SwitchStateDelegate.AddDynamic(this, &AGameFlowStateManager::SwitchState);
    CurrentState->Enter();
}
```

That architecture is particularly appropriate for ASTRO because the design itself changes mode during a match. Collection, transitions, boss phases and results can remain explicit states instead of becoming a growing set of booleans spread through gameplay code.

## ENGINEERING: DATA-DRIVEN AUDIO

Audio integration was also designed around reusable data rather than one-off Blueprint graphs. Each gameplay data asset can expose a map from a string key to an `Audio Data` structure. Shared Function Library helpers then resolve that key and either play the sound directly or spawn an `Audio Component` when the caller needs a persistent reference for looping and stopping.

::pipeline{label="AUDIO DATA FLOW"}
DATA ASSET | GAMEPLAY OBJECT OWNS A MAP OF NAMED AUDIO ENTRIES
AUDIO DATA | ENTRY STORES THE PARAMETERS REQUIRED TO PLAY THE SOUND
FUNCTION LIBRARY | COMMON PLAY / SPAWN FUNCTIONS REMOVE DUPLICATED BLUEPRINT LOGIC
AUDIO COMPONENT | SPAWN PATH RETURNS A HANDLE FOR LOOPED OR STOPPABLE AUDIO
ANIM NOTIFY | ANIMATION EVENTS REUSE THE SAME DATA ASSET + KEY CONTRACT
ITERATE | SOUND CAN CHANGE IN DATA WITHOUT REWIRING EVERY CALL SITE
::

This is a small system, but it is a useful engineering decision: designers and sound production can change assets and parameters without rewriting the gameplay path that asks for a sound.

## SOUNDTRACK

The soundtrack supports different layers of the experience rather than using one continuous musical mood. The portfolio uses short web previews for the longer tracks so the project page stays lightweight; the victory jingle is included in full.

::audio{src="/media/Astro/menu-preview.mp3" label="MENU" credit="DOGMA · ASTRO SOUNDTRACK · 5 S WEB PREVIEW"}

::audio{src="/media/Astro/in-game-preview.mp3" label="IN GAME" credit="DOGMA · ASTRO SOUNDTRACK · 5 S WEB PREVIEW"}

::audio{src="/media/Astro/volcano-preview.mp3" label="MAP VOLCANO" credit="DOGMA · ASTRO SOUNDTRACK · 5 S WEB PREVIEW"}

::audio{src="/media/Astro/victory-jingle.mp3" label="VICTORY JINGLE" credit="DOGMA · ASTRO SOUNDTRACK · COMPLETE JINGLE"}

## THE TEAM

ASTRO was built as a multidisciplinary project, so design decisions had immediate consequences for production. Rules had to survive contact with animation, environment constraints, programming, interface readability and sound rather than existing only in a design document.

::media{src="team.webp" label="TEAM / WORK SESSION" alt="ASTRO development team working together during production" height=248}

::facts{columns=2 label="CREDITS"}
PAULINE MERCAT | PRODUCER
ZOÉ GUIGNABAUDET | ART DIRECTOR
ALEXANDRE GAULÉ | 3D ARTIST
JORDAN GRILLY | GAME DESIGNER + PROGRAMMER
ELIOTT GUIGNABAUDET | GAMEPLAY PROGRAMMER
DOGMA | SOUND DESIGNER
::

The value of that setup was the feedback loop. A feature could be interesting on paper and still be wrong if it required too much art, produced unreadable multiplayer feedback, complicated implementation disproportionately or did not justify new audio and animation work.

## PRODUCTION TAKEAWAY

ASTRO is a good example of design as constraint management rather than idea accumulation. The early reflection material contains many possible mechanics; the project becomes more coherent when those ideas are judged against player readability, social value and production cost.

My designer-programmer role added another constraint to that loop: a design direction also had to survive implementation. Camera work made that very concrete. Framing, player freedom, boss readability and transitions were not separate design and code problems; changing one immediately changed the others.

The broader engineering architecture follows the same principle. Explicit game-flow states reduce phase-management ambiguity, while data-driven audio reduces repeated integration work. Both systems make iteration cheaper — which matters because a party game's quality is discovered by repeatedly putting rules in front of several players and watching where the intended social behavior actually appears.

::note
ASTRO'S CORE LESSON — A PARTY GAME DOES NOT NEED THE MOST MECHANICS. IT NEEDS A SMALL SET OF RULES THAT KEEP CHANGING WHAT PLAYERS WANT FROM EACH OTHER — AND IMPLEMENTATION THAT CAN KEEP UP WITH THOSE CHANGES.
::
