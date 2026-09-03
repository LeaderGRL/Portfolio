---
title: ASTRO
sub: A competitive local party game about stealing alien eggs before something much larger notices
status: UNREAL ENGINE · GAME DESIGN · LOCAL MULTIPLAYER
stack: [Unreal Engine, C++, Blueprints, Game Design, Local Multiplayer, Audio]
theme: synthwave
link: https://github.com/LeaderGRL/A_back
---

::facts{columns=2 label="PROJECT SNAPSHOT"}
ORIGIN | CONFITURE DE JEUX × YNOV 2024
JAM | 8–10 MARCH 2024
THEME | ATTENTION AUX APPARENCES
FORMAT | COMPETITIVE LOCAL PARTY GAME
PLAYERS | 2–4
ENGINE | UNREAL ENGINE
MY ROLE | GAME DESIGNER
NEXT STEP | GAME CRÉALAB LYON 2024
::

## IT STARTED AS A GAME JAM

ASTRO began during the **Confiture de Jeux × Ynov 2024** game jam. The event ran over one weekend, from March 8 to March 10, with the theme **"Attention aux apparences"**.

The jam version already had the part of ASTRO that matters most: a very small ruleset that becomes noisy as soon as several people share the same screen.

You play an animal astronaut on an alien planet. Eggs are scattered around the arena. Pick them up, bring them back to your chest, and reach the target before the other players do.

::media{src="gameplay.webp" label="ASTRO / GAME JAM BUILD" alt="ASTRO local multiplayer gameplay with Astronimals collecting eggs" fit=contain background=off height=300}

Movement is simple, there is a dash, and players can push each other around. The result is less about learning a long list of mechanics and more about what happens when several players want the same thing at the same time.

The alien and later boss encounters add another source of pressure to that race. They are **not a cooperation phase**: ASTRO remains competitive.

## FROM A WEEKEND PROTOTYPE TO A PROJECT

A jam is very good at answering one question: **does the basic loop work at all?** It is much less useful for answering the next fifty questions that appear once you decide to keep the project alive.

ASTRO continued after the jam instead of being left as a weekend prototype. The public itch.io build still describes the same competitive core: collect eggs, return them to your chest, use movement and timing to get ahead, and deal with whatever interrupts the hunt.

That continuity matters. The project did not need a completely different premise after the jam; it needed time to find which parts of the original idea deserved more depth and which ones were only interesting on a whiteboard.

## GAME CRÉALAB LYON 2024

A few months later, ASTRO was selected for **Game Créalab Lyon 2024**, a two-week game-concept residency held at Pôle Pixel in Villeurbanne.

Only **4 projects were selected from 38 applications** for that edition. Each selected team received a €2,500 grant for the residency and worked through a programme built around concept development, writing, game design, artistic direction, technical questions, market positioning, coaching and professional feedback.

::media{src="game-crealab.webp" label="ASTRO × GAME CRÉALAB" alt="ASTRO visual used during Game Créalab Lyon 2024" fit=contain background=off height=250}

The residency itself was supported through the CNC's video-game funding ecosystem. The CNC's 2024 commission results list **Game Créalab 2024** among the projects receiving support under *aide aux manifestations*.

For ASTRO, the useful part was the extra development time and external scrutiny: the jam prototype now had to be explained, challenged and presented as an actual game project rather than simply as something that successfully survived a Sunday deadline.

## DESIGNING A COMPETITIVE LOOP

The public pitch is straightforward: **collect more alien eggs than the other players**.

That simplicity is useful because every extra system has to justify what it adds to the match. The design work around ASTRO explored different ways of creating surprise and changing the rhythm of the egg hunt, but those documents are design history — not a list of features that all ended up in the game.

::media{src="design-board.webp" label="GAME DESIGN / EXPLORATION" alt="ASTRO game design board containing mechanics and iteration notes" fit=contain height=280}

One of the clearest ideas in the early notes is the use of **surprise** to keep the match from becoming completely solved. An alien can disturb an expected egg pickup; other ideas were tested on paper before being kept, changed or discarded.

That distinction is important for this page: prototypes, discarded ideas and current mechanics are not the same thing. The portfolio should show the reasoning process without pretending every Post-it became a shipped feature.

## THE ASTRONIMALS

The characters were designed to stay readable from a top-down multiplayer camera while still giving the game a strong visual identity.

::media{src="characters.webp" label="ASTRONIMAL CHARACTER EXPLORATION" alt="ASTRO character concepts for the animal astronauts" fit=contain background=off height=270}

The exaggerated shapes and colors make sense for the camera distance and for a game where several characters, eggs and hazards can occupy the same view at once. Readability here is not just an art problem; it directly affects how quickly a player understands what happened.

## ENGINEERING THE GAME FLOW

The current Unreal repository separates the main game, menu and state-machine code into different modules. The game-flow layer uses explicit state actors with `Enter`, `Manage` and `Exit` lifecycle functions, while a manager owns the active state and performs transitions.

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

This is a good fit for a game whose match is made of clearly different moments. The state manager keeps transition ownership in one place instead of turning game flow into a collection of unrelated flags spread across gameplay classes.

It is also the kind of engineering detail worth showing in a portfolio because it answers a concrete question: **how is the game structured so that its phases can change without every system needing to know everything?**

## DATA-DRIVEN AUDIO

The project also contains a reusable audio workflow based on Data Assets. Gameplay data maps string keys to an `Audio Data` structure, and shared Blueprint helpers can either play the sound directly or return an `Audio Component` when the caller needs control over a looping or stoppable sound.

Animation notifies reuse the same data-asset-and-key contract. That keeps the call sites small and makes sound changes possible without rebuilding the same Blueprint logic in every gameplay object.

## SOUNDTRACK

DOGMA handled sound design for ASTRO. The portfolio currently exposes lightweight web previews while the full production tracks are prepared for streaming delivery.

::audio{src="/media/Astro/menu-preview.mp3" label="MENU" credit="DOGMA · ASTRO SOUNDTRACK · WEB PREVIEW"}

::audio{src="/media/Astro/in-game-preview.mp3" label="IN GAME" credit="DOGMA · ASTRO SOUNDTRACK · WEB PREVIEW"}

::audio{src="/media/Astro/volcano-preview.mp3" label="VOLCANO MAP" credit="DOGMA · ASTRO SOUNDTRACK · WEB PREVIEW"}

::audio{src="/media/Astro/victory-jingle.mp3" label="VICTORY JINGLE" credit="DOGMA · ASTRO SOUNDTRACK"}

## THE TEAM

The public jam page credits the team as:

::facts{columns=2 label="CREDITS"}
PAULINE MERCAT | PRODUCER · CHARACTER ARTIST · ANIMATOR
ALEXANDRE GAULÉ | TECH ARTIST
ELIOTT GUIGNABAUDET | GAME PROGRAMMER
JORDAN GRILLY | GAME DESIGNER
ZOÉ GUIGNABAUDET | ENVIRONMENT ARTIST · UI ARTIST
DOGMA | SOUND DESIGNER
::

::gallery{columns=2 fit=contain}
team-01.webp | PRODUCTION
team-03.webp | WORK SESSION
team.webp | TEAM
team-trip.webp | GAME CAMP
::

## WHAT THIS PAGE SHOULD EXPLAIN

ASTRO is interesting because its history is visible: a competitive local-multiplayer idea built during a jam, kept alive after the deadline, then selected for a professional concept-development residency.

The next version of this case study should go deeper into **what I personally designed, what changed after playtests, and which technical systems I personally implemented**. Those details should come from the production history, not from guesses made after reading the repository.
