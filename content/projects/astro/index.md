---
title: ASTRO
sub: A competitive local party game that started with eggs, a chest and permission to throw your friends into space
status: PAUSED · GAME JAM → GAME CRÉALAB 2024
year: 2024
stack: [Unreal Engine, C++, Blueprints, Game Design, Programming, Local Multiplayer]
theme: synthwave
link: https://github.com/LeaderGRL/A_back
---

::facts{columns=2 label="PROJECT SNAPSHOT"}
FORMAT | COMPETITIVE LOCAL PARTY GAME
PLAYERS | 2–4
ENGINE | UNREAL ENGINE
ORIGIN | CONFITURE DE JEUX × YNOV 2024
GAME CRÉALAB | 4 PROJECTS SELECTED FROM 38
RESIDENCY | PÔLE PIXEL · VILLEURBANNE
MY ROLE | GAME DESIGNER + PROGRAMMER
STATUS | PAUSED
::

## ONE WEEKEND, THREE RULES

ASTRO started during the **Confiture de Jeux × Ynov 2024** game jam, held from March 8 to March 10, 2024 around the theme **"Attention aux apparences"**.

By Sunday, the rules could be explained in three lines.

Pick up an egg. Bring it back to your chest. Push anyone trying to do the same thing.

That was essentially the game.

::media{src="gameplay.webp" label="ASTRO / ORIGINAL CORE LOOP" alt="ASTRO local multiplayer gameplay with animal astronauts competing for eggs" fit=contain background=off height=300}

Players could knock each other away from an egg, interrupt a return to the chest, or simply send somebody over the edge of the map and let gravity finish the discussion.

We had no boss structure, no elaborate metagame and, after one weekend, not much reason to pretend otherwise. The target was simpler: make one competitive interaction work with several people on the same screen.

The [original jam build](https://awelyaa.itch.io/astro) is still public on itch.io. It shows ASTRO at the end of that weekend: the core loop already works, while the rest still has all the rough edges you would expect from a game jam.

And it worked well enough that we did not want to leave it in the usual post-jam folder graveyard.

## WHY WE KEPT WORKING ON IT

We kept working on ASTRO for two reasons: **the game had potential, and the team still wanted to be in the same room after the jam**.

The first gave us something worth improving. The second turned out to be just as useful.

After the jam, we did not try to replace the core loop with a more complicated pitch. ASTRO remained a game about collecting eggs before the other players. Development mostly meant taking that simple prototype and making it feel like an actual game: better presentation, cleaner feedback, stronger production values and enough structure to support additional modes later.

The egg survived every redesign. An alien joined the problem, boss encounters appeared in the plans, but the basic question stayed the same: who gets the egg home without being launched off the map?

## SELECTED FOR GAME CRÉALAB

A few months later, ASTRO was selected for **Game Créalab Lyon 2024**.

The residency ran from September 16 to September 28 at **Pôle Pixel in Villeurbanne**. Only **4 projects were selected from 38 applications** for that edition. The programme provided dedicated development time, financial support, daily coaching and access to industry professionals around the selected projects.

::media{src="game-crealab.webp" label="ASTRO × GAME CRÉALAB LYON 2024" alt="ASTRO project visual used during Game Créalab Lyon 2024" fit=contain background=off height=260}

Those two weeks were not a feature sprint. Production was mixed with daily coaching, professional speakers and masterclasses covering game design, artistic direction, technical questions, positioning and how to explain the project to people who had not spent the previous months staring at it.

::media{src="camera-work.webp" label="WORK SESSION / GAME CRÉALAB" alt="ASTRO production work during the Game Créalab residency" fit=contain height=270}

The residency also included two publisher work sessions. **Yves Le Yaouanq from Focus Entertainment** and **Simon Bachelier from Firesquid** reviewed the selected projects' artistic propositions and market positioning.

The [official Game Créalab page](https://gamecrealab.com/residence/lyon-2024/) still lists ASTRO among the four selected projects. The CNC's 2024 FAJV results also list **Game Créalab 2024** among the supported events.

During the jam, the important question was whether the game was fun by Sunday. At Game Créalab, we also had to answer what happened after Sunday.

## KEEPING THE CORE SIMPLE

The strongest part of ASTRO was already present in the jam build: several players competing for a small number of obvious objectives, with direct ways to interfere with each other.

That simplicity gave us a useful design constraint after the jam. New ideas had to improve the match rather than merely make the feature list longer.

::media{src="design-board.webp" label="GAME DESIGN / EXPLORATION" alt="ASTRO game design board with mechanics, questions and iteration notes" fit=contain height=285}

We explored more ideas than we kept. The board grew much faster than the game, which was probably for the best.

Every new idea had to earn its place: did it create a better match, or just a longer feature list?

The direction that survived stayed close to the original prototype: **eggs, an alien, competitive interactions and planned game modes involving bosses**.

## EXPANDING WITHOUT REPLACING THE JAM GAME

Post-jam production also gave us room to explore larger environments and additional modes. The volcano blockout came out of that phase.

::media{src="volcano-blockout.webp" label="VOLCANO MAP / PRODUCTION BLOCKOUT" alt="ASTRO volcano map blockout explored for later game modes" fit=contain height=275}

The volcano never became a finished mode. It remained a production blockout for exploring more authored spaces and boss-oriented variations around the same competitive foundation.

Grey boxes are much easier to throw away than finished art.

## THE ASTRONIMALS

The visual identity grew considerably after the jam. The animal astronauts became the **Astronimals**, with exaggerated silhouettes and colours that remain readable from the shared game camera.

::media{src="characters.webp" label="ASTRONIMAL CHARACTER EXPLORATION" alt="ASTRO character concepts for the animal astronauts" fit=contain background=off height=275}

That readability matters more than it might seem in a screenshot. ASTRO is played locally by up to four people, so characters, eggs, the environment and whatever is currently trying to ruin your route all have to remain understandable at the same time.

A beautiful character that becomes a twelve-pixel mystery during an actual match has technically succeeded at being beautiful and failed at being useful.

## MY ROLE

I worked on ASTRO as both a **Game Designer and Programmer**.

Game Design took most of my time. I also programmed several gameplay mechanics during production, which meant design discussions could move from "would this be fun?" to "let's try it" fairly quickly.

That overlap was useful. When a rule changed, I had a better idea of its implementation cost. When something felt wrong in the build, I could look at both the code and the rule instead of assuming one of them was innocent.

ASTRO was still a team project. The code, art, audio, design and production grew through work from the whole team, not one role in isolation.

## FROM PROTOTYPE TO PRODUCTION

The codebase grew with the project. What was enough for a weekend prototype had to survive months of iteration without turning every change into archaeology.

The Unreal project moved toward a modular game structure, reusable game-flow code and data-driven audio tools. The goal was not to make the architecture impressive; it was to make the next change cheaper than the previous one.

Most players will never notice any of this. They will notice if the round flow breaks while somebody is carrying an egg, which is a much stronger motivation.

## THE TEAM

One of the reasons ASTRO continued after the jam was simply that the team had good chemistry. That sounds less impressive than a technical architecture diagram, but for a project built outside full-time production hours it turned out to be fairly important infrastructure.

::gallery{columns=2 fit=contain}
team-01.webp | PRODUCTION
team-03.webp | WORK SESSION
team.webp | TEAM
team-trip.webp | GAME CAMP
::

The team brought together production, Game Design, programming, 3D, environment art, animation, UI and sound. **DOGMA** handled sound design and music for the project.

ASTRO also gave us opportunities to present the project outside the team, get professional feedback and meet people from the industry through Game Créalab. That was a meaningful step up from the environment in which the first version had been made a few months earlier.

## CURRENT STATUS

ASTRO is currently **paused**.

There is no dramatic postmortem behind that status. As everyone's professional schedules changed, keeping the whole team available at the same time became increasingly difficult, and development eventually stopped being practical.

In the end, scheduling became the boss we did not beat.
