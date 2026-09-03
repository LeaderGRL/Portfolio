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

The first version was deliberately small.

Pick up an egg. Bring it back to your chest. Push anyone trying to do the same thing.

That was essentially the game.

::media{src="gameplay.webp" label="ASTRO / ORIGINAL CORE LOOP" alt="ASTRO local multiplayer gameplay with animal astronauts competing for eggs" fit=contain background=off height=300}

Players could knock each other away from an egg, interrupt a return to the chest, or simply send somebody over the edge of the map and let gravity finish the discussion.

There was no boss structure, no long list of modes and no elaborate metagame behind it. The jam prototype was about making one competitive interaction work with several people on the same screen.

The [original jam build](https://awelyaa.itch.io/astro) is still public. I like keeping it accessible because it shows the game before later production work had time to make everything look more intentional than it actually was after one weekend.

And it worked well enough that we did not want to leave it in the usual post-jam folder graveyard.

## WHY WE KEPT WORKING ON IT

We continued ASTRO for two fairly practical reasons: **the game had potential, and the team worked well together**.

The first one gave us a project worth improving. The second one made improving it realistic.

After the jam, we did not try to replace the core loop with a more complicated pitch. ASTRO remained a game about collecting eggs before the other players. Development mostly meant taking that simple prototype and making it feel like an actual game: better presentation, cleaner feedback, stronger production values and enough structure to support additional modes later.

The current direction still keeps eggs at the centre. An alien became part of the game, and other modes were planned around boss encounters, but those additions extend the original idea rather than replacing it.

That distinction matters to me. A prototype does not become more serious simply because its design document gets thicker.

## SELECTED FOR GAME CRÉALAB

A few months later, ASTRO was selected for **Game Créalab Lyon 2024**.

The residency ran from September 16 to September 28 at **Pôle Pixel in Villeurbanne**. Only **4 projects were selected from 38 applications** for that edition, with each project receiving a **€2,500 grant** and two weeks of dedicated development time.

::media{src="game-crealab.webp" label="ASTRO × GAME CRÉALAB LYON 2024" alt="ASTRO project visual used during Game Créalab Lyon 2024" fit=contain background=off height=260}

The programme was not about sitting in a room and adding features for fifteen days. We worked on the concept with daily coaching, professional speakers and masterclasses covering game design, artistic direction, technical questions, positioning and how to present the project outside the team.

The residency also included two publisher work sessions. **Yves Le Yaouanq from Focus Entertainment** and **Simon Bachelier from Firesquid** reviewed the selected projects' artistic propositions and market positioning.

The [official Game Créalab page](https://gamecrealab.com/residence/lyon-2024/) still lists ASTRO among the four selected projects. The CNC's 2024 FAJV results also list **Game Créalab 2024** among the supported events.

That changed the context around ASTRO. During the jam, the important question was whether the game was fun by Sunday. At Game Créalab, we also had to explain why the concept deserved to exist after Sunday.

## KEEPING THE CORE SIMPLE

The strongest part of ASTRO was already present in the jam build: several players competing for a small number of obvious objectives, with direct ways to interfere with each other.

That simplicity gave us a useful design constraint after the jam. New ideas had to improve the match rather than merely make the feature list longer.

::media{src="design-board.webp" label="GAME DESIGN / EXPLORATION" alt="ASTRO game design board with mechanics, questions and iteration notes" fit=contain height=285}

We explored more ideas than we kept. That is normal design work, but it is easy to misrepresent it afterward. A whiteboard full of mechanics is not a screenshot of the final game.

The finished direction stayed much closer to the original prototype than some of those explorations suggest: **eggs, an alien, competitive interactions and planned game modes involving bosses**.

The useful work was deciding what deserved to survive the prototype stage.

## THE ASTRONIMALS

The visual identity grew considerably after the jam. The animal astronauts became the **Astronimals**, with exaggerated silhouettes and colours that remain readable from the shared game camera.

::media{src="characters.webp" label="ASTRONIMAL CHARACTER EXPLORATION" alt="ASTRO character concepts for the animal astronauts" fit=contain background=off height=275}

That readability matters more than it might seem in a screenshot. ASTRO is played locally by up to four people, so characters, eggs, the environment and whatever is currently trying to ruin your route all have to remain understandable at the same time.

A beautiful character that becomes a twelve-pixel mystery during an actual match has technically succeeded at being beautiful and failed at being useful.

## MY ROLE

I worked on ASTRO as both a **Game Designer and Programmer**.

Game Design was my main responsibility, and it is the part of the project I want this case study to focus on. I also programmed several gameplay mechanics during production, but turning every Blueprint or small system into a portfolio achievement would make the page less useful, not more.

The interesting part is the overlap between both roles. When a rule changed, I could understand its implementation cost. When something felt wrong in the build, I could approach it as a design problem rather than assuming that another layer of code would somehow make it fun.

I would rather keep this section precise than invent ownership over systems simply because they exist in the repository.

## FROM PROTOTYPE TO PRODUCTION

The project grew from a game-jam build into a much more polished Unreal project without abandoning its original loop.

The repository contains a modular game structure, reusable game-flow code and data-driven audio tools, alongside the gameplay and content produced by the team. Those systems are part of ASTRO's production architecture; they are not all presented here as my personal work.

That distinction is important in a team project. A portfolio should explain what the software became without quietly changing "we built" into "I built" halfway through the paragraph.

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

The project still has planned directions, including additional modes and boss encounters, but I prefer to call those plans what they are instead of presenting a roadmap as shipped content.

What remains valuable to me is the path the project already completed: a tiny competitive game-jam loop, a team that decided it was worth continuing, and a project strong enough to be selected as one of four teams for Game Créalab Lyon.

ASTRO did not need to become a different game to justify continuing.

It needed the original game to become a better one.
