---
title: CROSSATRO
sub: A crossword roguelite built around procedural grids, scoring builds and collectible floppies
status: PROTOTYPE / DEVELOPMENT ENDED
year: 2025–2026
stack: [Unity, C#, Procedural Generation, Event-Driven Systems, Game Design]
link: https://github.com/LeaderGRL/Crossatro
---

Crossatro started as a small game-jam prototype around language and eventually became a much more interesting systems problem: **how do you make a crossword support the same kind of build decisions as a roguelite?**

The answer was not to make the clues harder. It was to make every solved word feed a larger economy of score, currency and modifiers, then let collectible floppy disks change how those words are valued.

That gave the project two useful layers. The crossword provides readable, deterministic decisions. The roguelite systems make the value of those decisions change from run to run.

Crossatro is no longer in active production. What remains is a playable Unity prototype and a fairly developed systems foundation around procedural grids, scoring, turns, enemies, a shop and an event-driven floppy-effect architecture.

::video{src="/media/crossatro/demo.mp4" alt="Crossatro prototype gameplay showing the crossword board, scoring, turns and shop"}

## FROM GAME JAM TO ROGUELITE

The first version of Crossatro was built during a game jam around the theme of language. The basic loop was already there: generate crossword structures, let the player solve words and turn correct answers into score.

When I returned to the project, the problem was that a correct word was mostly just a correct word. Once the clue had been solved, there was very little left to think about.

The roguelite layer was my way of changing that. A word could now be easy but strategically poor, difficult but extremely profitable, or valuable only because the current build happened to reward its letters, length or timing.

The project stopped being only about **finding the answer** and became more about **deciding which correct answer matters right now**.

::facts{columns=2 label="PROJECT FOUNDATION"}
GENRE | CROSSWORD ROGUELITE / PUZZLE
ENGINE | UNITY
LANGUAGE | C#
ROLE | SOLO GAME PROGRAMMER / DESIGNER
CORE LOOP | SELECT + SOLVE + SCORE + BUILD
RUN SYSTEMS | TURNS + HEALTH + ENEMIES + CURRENCY
BUILD SYSTEM | FIVE-SLOT FLOPPY DECK
STATE | PLAYABLE PROTOTYPE / DEVELOPMENT ENDED
::

## THE PLAYABLE CORE

The board is generated from a word database rather than authored as a fixed crossword. The generation pipeline separates **word placement** from **board presentation**: placement logic produces intersecting words, then the grid generator materializes those positions as tiles and binds the result to the playable board.

That separation mattered because the board is not only a visual crossword. It is also the shared surface used by input, scoring, turn flow, special tiles and later effects.

::pipeline{label="GRID PIPELINE"}
DATABASE | SUPPLIES WORDS, CLUES AND DIFFICULTY DATA
PLACEMENT | BUILDS INTERSECTING HORIZONTAL / VERTICAL WORDS
GRID | CONVERTS WORD POSITIONS INTO PLAYABLE TILE LOCATIONS
BOARD | OWNS SELECTION, TILE STATE AND PLAYER INTERACTION
VALIDATION | RESOLVES THE WORD AND FEEDS THE REST OF THE RUN
::

The player selects a word through the grid, reads its clue, enters an answer and validates it. Intersections make the board progressively easier to read because a solved word contributes letters to several future decisions at once.

::media{src="/media/crossatro/game-ui-validated.webp" label="PLAYABLE PROTOTYPE / CROSSWORD GRID, RUN HUD AND VALIDATED WORD STATE" fit=contain height=300 background=off gap=12}

The isometric presentation was useful here. Tiles have enough physical presence to communicate selection, validation and special states without reducing the crossword to a spreadsheet of letters.

## SCORING SHOULD EXPLAIN THE BUILD

The score system was designed so modifiers could intervene at several levels instead of every floppy becoming another hard-coded exception.

A completed word produces a scoring result, and the active floppy deck can modify that result before it is committed. The deck also exposes a preview path so the game can evaluate the effect of modifiers without permanently mutating the run state.

That distinction sounds small, but it is important for a build-driven game: the player needs to understand **why** a word is valuable before committing to it.

The architecture also supports per-letter contributions. A floppy can inspect a particular character, its position inside the word and the current scoring context, then add flat points, multipliers or other effects in a way the scoring presentation can attribute back to that floppy.

::system{columns=2 label="SCORING / BUILD CONTRACT"}
BASE WORD | LETTER VALUES + WORD CONTEXT PRODUCE THE STARTING RESULT
FLOPPY DECK | UP TO FIVE ACTIVE PASSIVE MODIFIERS
PER-LETTER PASS | EFFECTS CAN REACT TO INDIVIDUAL CHARACTERS
WORD PASS | EFFECTS CAN MODIFY THE COMPLETED WORD AS A WHOLE
PREVIEW | SAME MODIFIERS CAN BE EVALUATED WITHOUT SIDE EFFECTS
EVENTS | WORD / LETTER / TURN EVENTS CAN TRIGGER NON-SCORE EFFECTS
::

The important result is not a particular formula. It is that scoring remains a pipeline rather than a pile of special cases.

## THE SHOP IS WHERE A RUN BECOMES A BUILD

Between gameplay phases, the shop generates floppy offers from a catalog. Each floppy is data-driven: name, description, prefab, cost, rarity and effect are stored together, while the shop handles offers, purchases and rerolls.

The implemented rarity model has four levels — Common, Rare, Epic and Legendary — and the shop economy is deliberately coupled to the rest of the run. Buying a passive floppy attempts to place it in the five-slot deck; one-shot effects can execute immediately; rerolling costs currency and becomes more expensive each time.

::media{src="/media/crossatro/game-ui-shop.webp" label="PLAYABLE PROTOTYPE / FLOPPY SHOP AND BUILD SELECTION" fit=contain height=300 background=off gap=12}

The deck itself is event-driven. Active floppies can listen to gameplay events such as completed words, failed words, typed letters, phase changes, health changes or enemy deaths. That makes new effects easier to compose because the scoring controller, board and shop do not need to know the identity of every modifier in the game.

Several concrete effects exist in the project as separate implementations — including score modifiers, combo-oriented effects, economy effects, healing and word-specific rules. The interesting part is not the quantity. It is that they all plug into the same contract.

A good floppy therefore changes what the player notices on the board. If a build rewards a specific letter pattern, a word that looked mediocre one run can become the obvious target in the next.

## FLOPPIES AS SOFTWARE OBJECTS

The floppy disks also needed more identity than small icons in a HUD. The visual research treats them like **collectible pieces of obsolete software**: technical labels, printed illustrations, manufacturing details and physical packaging all become part of the rarity language.

The two images below intentionally show the **same Grep floppy** in two presentations. The loose disk is the standard object; the translucent blister is the rarer version. Rarity is therefore communicated through the physical treatment of the object, not only through a colored border or a text label.

::gallery{columns=2 fit=contain label="SAME FLOPPY / DIFFERENT RARITY PRESENTATION"}
/media/crossatro/floppy-alt.webp | Grep / standard loose floppy
/media/crossatro/floppy-blister.webp | Grep / rarer blister-pack presentation
::

That direction is one of the parts of Crossatro I would keep even outside this project. A modifier is easier to remember when it has a material identity. The player is not equipping “effect #12”; they are putting a strange piece of software into a five-slot machine.

The Figma research pushed that idea across several designs, including processor patches, manga-like illustrations, Japanese typography and fake technical specifications. The collectible language borrows some readability from trading cards without turning the objects into literal cards.

## VISUAL RESEARCH

The interface went through several directions before the prototype settled into its current form. Early menu studies explored brighter arcade framing, card-driven navigation and more explicit game-mode presentation.

::gallery{columns=3 fit=contain label="EARLY MENU / UI RESEARCH"}
/media/crossatro/menu-research-01.webp | Early menu composition
/media/crossatro/menu-research-02.webp | Alternate navigation treatment
/media/crossatro/menu-research-03.webp | Card-driven mode selection experiment
::

Those explorations were useful even though they were not the final interface. They helped define the visual hierarchy of the project and, more importantly, exposed what did **not** belong in the playable version.

The implemented prototype ended up much more restrained: dark background, blue/red system framing, small operating-system-like windows and an isometric board that remains the visual focus.

## THE METROIDBRAINIA DIRECTION

A later design pass explored adding a hidden MetroidBrainia layer around the roguelite. The idea was that apparently ordinary interface feedback could acquire a second meaning: letter validation could be read as binary, floppy artwork could hide information, and the player identity **CW-7321** could turn the surrounding software into part of an escape-game mystery.

That direction remained largely **design work rather than an implemented game layer**, so I do not treat it as a shipped feature of Crossatro. It is still relevant because it influenced some of the later visual research and the way the fictional software objects were presented, but the playable project is fundamentally the crossword / scoring / build prototype described above.

If I returned to the concept, the important constraint would remain the same: secrets should reuse systems the player already understands instead of opening a separate lore menu.

## WHAT I WOULD KEEP FROM THE PROJECT

Crossatro is no longer in production, but it left behind several ideas I still find useful.

The procedural crossword generator gives a deterministic puzzle enough variation to support repeated runs. The scoring pipeline turns a correct answer into something modifiers can reason about. The floppy deck uses events and shared effect contexts instead of wiring every item directly into every gameplay system. The shop turns those pieces into an economy with actual opportunity cost.

Most importantly, the project taught me that a roguelite modifier is interesting when it changes **how the player reads the board**, not only the number displayed after solving it.

Crossatro started as a word game.

The useful engineering work was building the machinery that made the same words mean different things from one run to the next.
