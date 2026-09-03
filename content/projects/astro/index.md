---
title: ASTRO
sub: A 2–4 player party game where cooperation lasts exactly as long as it is useful
status: UNREAL ENGINE · GAME DESIGN · CAMERA PROGRAMMING
stack: [Unreal Engine, C++, Blueprints, Game Design, Gameplay Programming, Multiplayer]
theme: synthwave
link: https://github.com/LeaderGRL/A_back
---

::facts{columns=2 label="PROJECT SNAPSHOT"}
FORMAT | LOCAL PARTY GAME
PLAYERS | 2–4
ENGINE | UNREAL ENGINE
BORN AT | GAME CRÉALAB
MY ROLE | GAME DESIGNER
ENGINEERING CONTRIBUTION | CAMERA SYSTEM
::

## ASTRONAUTS, EGGS AND TEMPORARY FRIENDSHIP

ASTRO started during **Game CréaLab** with a fairly reasonable party-game question: what happens if players need each other, but still really want to win?

The answer became a colorful 2–4 player game starring animal astronauts — the **Astronimals** — stranded on an alien planet and collecting eggs while gadgets, hazards and the other players keep the plan from staying sensible for very long.

During the collection phase, everybody is chasing their own score. Then the boss arrives and suddenly the person you were annoying thirty seconds ago becomes extremely useful. Once the danger is gone, friendship expires and the scoreboard gets the final word.

::media{src="gameplay.webp" label="ASTRO / PLAYABLE BUILD" alt="ASTRO playable build with two Astronimals" fit=contain background=off height=300}

## THE GAME IN MOTION

The playable build says more in a few seconds than a page of feature bullets ever could: shared movement, eggs, gadgets, boss pressure and several players trying to understand the same screen at the same time.

::video{src="/media/Astro/gameplay.mp4" alt="Full ASTRO gameplay capture from the playable build"}

The full capture is kept local to the portfolio. It only starts loading when playback is requested, so a four-minute gameplay video does not get to ambush the initial page load.

## GAME CRÉALAB

ASTRO was shaped inside **Game CréaLab**, with a small multidisciplinary team working through the game together rather than throwing a finished design document over a wall and hoping for the best.

::media{src="game-crealab.webp" label="ASTRO × GAME CRÉALAB" alt="ASTRO project visual made for Game CréaLab" fit=contain background=off height=250}

That mattered because the game depended on things that are hard to judge in isolation. A mechanic could sound good on paper and immediately become unreadable with four players. A camera setting could feel comfortable with two people and become a hostage situation with four. A boss could encourage cooperation right up until nobody understood what was happening on screen.

So we built, played, argued politely, changed things, played again and repeated the process.

## FINDING THE ACTUAL GAME

The early design work was deliberately messy. We explored golden eggs, surprise events, power-ups falling from the sky, weather that could push players around, different scoring rules, more ways to interfere with each other and several versions of the cooperation layer.

::media{src="design-board.webp" label="GAME DESIGN / EARLY ITERATION" alt="ASTRO game design board with mechanics and iteration notes" fit=contain height=280}

One recurring idea was **surprise**: not randomness for its own sake, but events that force the group to react. An alien dropping in where an egg was expected is useful because everybody can see the situation change. A random punishment with no readable cause is mostly useful for starting an argument with the game.

The semi-cooperative premise changed too. We did not keep a mechanic simply because it looked good in the pitch. If forced cooperation made the game less fun, it was reduced or moved to moments where it actually created something between players.

::pipeline{label="THE MATCH, MORE OR LESS"}
COLLECT | GET EGGS, BUILD A LEAD, PRETEND TO HAVE A PLAN
CONTEST | OTHER PLAYERS BECOME THE PLAN'S MAIN TECHNICAL ISSUE
SURPRISE | EVENTS AND GADGETS BREAK ROUTINES
BOSS | EVERYBODY DISCOVERS TEAMWORK AT THE SAME TIME
RESULT | THE SCOREBOARD ENDS THE TRUCE
::

## FROM SKETCHES TO ASTRONIMALS

The characters went through the same process. We wanted silhouettes that stayed readable from the top-down camera, enough personality to sell the party-game tone, and designs that could survive being quite small on screen.

::media{src="characters.webp" label="CHARACTER EXPLORATION" alt="ASTRO Astronimal character concepts" fit=contain background=off height=270}

The result is intentionally playful rather than subtle. This is also a game that considered a banana as a perfectly valid piece of equipment, so restraint had already left the production fairly early.

## MY ROLE — GAME DESIGN + CAMERA

My official role on ASTRO was **Game Designer**, with an additional programming contribution around the camera. That overlap ended up being useful because some of the most interesting problems were exactly where design and implementation collided.

On the design side, I worked on the semi-cooperative structure, rules, surprise mechanics, scoring ideas and playtest iteration. The team regularly proposed solutions to design problems; I sorted and combined those proposals before we decided what was worth testing.

My main programming contribution was the **camera**, including its gameplay behavior and work around boss / camera transitions. That was a good problem to own because a local multiplayer camera is secretly a game rule wearing a rendering hat.

::media{src="camera-work.webp" label="CAMERA WORK / PRODUCTION" alt="ASTRO development session while working on the game" fit=contain height=280}

Four local players do not politely remain at the ideal distance from each other. We had to think about group framing, camera distance, movement, what happens when players spread out, and how boss phases can demand a different view. We also explored adaptive solutions such as separating the view when players move too far apart and bringing it back together when the group reunites.

That created a useful loop: change the design, feel the camera problem, change the implementation, playtest it, then discover a new design problem. Very efficient at generating both progress and TODOs.

## ENGINEERING THE PHASE CHANGES

ASTRO changes its rules during a match, so phase management could easily have turned into a collection of booleans with increasingly emotional names.

The Unreal project instead contains a dedicated game-flow state machine. Each state owns an `Enter`, `Manage` and `Exit` lifecycle, while a central manager performs transitions and rebinds delegates. The state requests the transition; the manager keeps ownership of the active phase.

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

That separation is useful for ASTRO because collection, boss encounters and results are genuinely different modes of play. Making those transitions explicit is much easier to reason about than asking six unrelated systems whether the boss is "sort of happening right now".

## AUDIO WITHOUT BLUEPRINT SPAGHETTI

The audio workflow used reusable data assets instead of wiring every sound independently. Gameplay assets map string keys to an `Audio Data` structure; shared Blueprint helpers can play the entry directly or spawn an `Audio Component` when a looping sound needs to be stopped later.

Animation notifies use the same data-asset + key contract. That kept sound replacement cheap for the sound designer and avoided duplicating the same playback logic across gameplay graphs.

And because **DOGMA** produced actual music for the project, it would be a little rude to reduce it to five-second previews.

## SOUNDTRACK

These are the **complete tracks**, not excerpts. They are stored as web-optimized MP3 files and use metadata-only preload; the audio payload starts when you press play rather than when the project page opens.

::audio{src="/media/Astro/menu.mp3" label="MENU" credit="DOGMA · ASTRO SOUNDTRACK · FULL TRACK"}

::audio{src="/media/Astro/in-game.mp3" label="IN GAME" credit="DOGMA · ASTRO SOUNDTRACK · FULL TRACK"}

::audio{src="/media/Astro/volcano.mp3" label="VOLCANO MAP" credit="DOGMA · ASTRO SOUNDTRACK · FULL TRACK"}

::audio{src="/media/Astro/victory.mp3" label="VICTORY JINGLE" credit="DOGMA · ASTRO SOUNDTRACK · FULL TRACK"}

## THE PEOPLE BEHIND THE ASTRONIMALS

ASTRO was a team project, and that is part of the story rather than a credit roll hidden at the bottom. A lot of the useful iteration happened with several disciplines in the same room: design could see implementation constraints immediately, programming could ask for clearer rules, and art could tell us when a "small change" was absolutely not a small change.

::gallery{columns=2 fit=contain}
team-01.webp | BUILDING THE GAME TOGETHER
team-03.webp | PLAYTEST / PRODUCTION
team.webp | TEAM WORK SESSION
team-trip.webp | ON THE WAY TO GAME CAMP
::

::media{src="camera-work.webp" label="DEVELOPMENT SESSION" alt="ASTRO development session with the team working on the game" fit=contain height=260}

The core team was **Pauline Mercat** (Producer), **Zoé Guignabaudet** (Art Director), **Alexandre Gaulé** (3D Artist), **Eliott Guignabaudet** (Gameplay Programmer), **DOGMA** (Sound Designer), and me on **Game Design**, with camera programming as an additional contribution.

## WHAT I KEPT FROM ASTRO

ASTRO taught me that party-game design is mostly about controlling understandable chaos. The mechanic itself can be tiny; what matters is what it makes several people do to each other when the screen gets busy.

It also made the designer-programmer overlap very concrete for me. Camera framing, player freedom, boss readability and game rules were not separate tasks. They kept pushing on each other, which meant I could move from a playtest observation to a design change and then directly into the implementation needed to test it.

That loop is still one of my favorite ways to work: **build something, put it in front of players, discover exactly how wrong the elegant theory was, and make the next version better.**
