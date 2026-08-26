---
title: CROSSATRO
sub: Turning a crossword roguelite into a system the player learns to disobey
status: PROTOTYPE / ACTIVE DEVELOPMENT
year: 2025
stack: [Unity, C#, Procedural Generation, Systems Design, Narrative Design]
---

Crossatro started as a small crossword roguelite built around a simple question: **can solving words create the same kind of build-making decisions as a card roguelike?**

The first prototype answered the mechanical part. A procedural crossword grid gives the player words to solve, validated words become score, and a shop turns that score into a run through modifiers and collectible floppy disks.

That worked, but it was still a game about making numbers larger.

The version I am building now keeps that system and gives the interface a second job. The player is no longer just solving crosswords. They are **CW-7321**, an artificial intelligence being trained inside a company that measures every grid as a productivity session. The same UI that explains the rules gradually starts leaking information it was never supposed to reveal.

The objective is to make the roguelite and the narrative use the same machinery instead of placing a story on top of a puzzle game.

::video{src="/media/crossatro/demo.mp4" alt="Crossatro prototype gameplay showing the procedural crossword grid, word interaction, score and shop"}

## FROM GAME JAM TO SYSTEMIC ROGUELITE

Crossatro began during a game jam around the theme of language. The original version already had the basic ingredients: letters arranged into crossword structures, score, bonuses and modifiers that encouraged the player to search for more profitable words rather than simply the correct answer.

When I returned to the project, the interesting problem was no longer how to make another crossword mode. It was how to make the player **reinterpret the same systems over time**.

That led to two parallel forms of progression:

- a conventional roguelite progression, where score, currency and equipped objects create stronger runs;
- a knowledge progression, where the player learns that apparently decorative feedback, corrupted messages and strange objects are parts of a larger machine.

The first one lets the player optimize the game.

The second one teaches them how to stop trusting it.

::facts{columns=2 label="PROJECT FOUNDATION"}
GENRE | CROSSWORD ROGUELITE + PUZZLE + METROIDBRAINIA
ENGINE | UNITY
ROLE | SOLO GAME PROGRAMMER / DESIGNER
PLAYER IDENTITY | CW-7321 / AI TRAINING INSTANCE
CORE LOOP | SOLVE WORDS + BUILD SCORE + BUY MODIFIERS
META LOOP | OBSERVE ANOMALIES + FORM HYPOTHESES + TEST THE SYSTEM
PLATFORM TARGET | PC / MAC
STATE | PLAYABLE ROGUELITE PROTOTYPE + NARRATIVE SYSTEM IN DEVELOPMENT
::

## THE PLAYABLE CORE

The current prototype already implements the part Crossatro needs before the stranger ideas can work: the player has to believe in the crossword game first.

A run is built from successive procedural grids. Selecting a tile chooses a horizontal or vertical word, opens its clue and lets the player enter a proposed answer. Validated words feed score and currency, while mistakes and run constraints create pressure around which words are worth attempting and when.

The grid is presented as a small isometric object rather than a flat newspaper crossword. That choice gives each tile enough physical presence to later carry states, special properties and narrative anomalies without turning the board into a spreadsheet.

::media{src="/media/crossatro/game-ui-attempts.webp" label="CURRENT PROTOTYPE / WORD ATTEMPTS AND GRID STATE" fit=contain height=300 background=off}

::media{src="/media/crossatro/game-ui-validated.webp" label="CURRENT PROTOTYPE / VALIDATED GRID, SCORE, COINS AND FLOPPY INVENTORY" fit=contain height=300 background=off}

The important distinction is that **correctness and value are not the same thing**. A word can be valid without being strategically optimal. Letter values, word difficulty, length and equipped modifiers are designed to make two correct answers worth very different amounts.

The scoring model explored for the current design is deliberately compositional:

::figure{cols=SCORE,COMPONENTS}
S_final = round((S_letters + B_letters) × M_diff × M_len × B_mult)
M_diff = 1 + difficulty × 0.5
M_len = 1 + word_length × 0.1
::

That formula is less interesting for its exact constants than for what it enables: modifiers can intervene at different stages of the calculation. One floppy can reward vowels, another can multiply a specific word length, another can replay a letter contribution, and a future balance pass can change one layer without rewriting the whole scoring model.

## THE SHOP IS THE BUILD

Between grids, the player spends currency in the **Floppy Shop**. The run can carry a limited number of floppy disks, so buying an object is not only an upgrade decision; it is also a commitment to a particular scoring strategy.

The object families are designed around different kinds of intervention:

- **floppy disks** define persistent rules for the current build;
- **cartridges** modify points attached to particular letters or conditions;
- **cassettes** are consumable effects that can solve an immediate problem or expose information.

::media{src="/media/crossatro/game-ui-shop.webp" label="CURRENT PROTOTYPE / FLOPPY SHOP AND BUILD SELECTION" fit=contain height=300 background=off}

The point is not to fill an inventory with +10% upgrades. The best objects should make the player look at the same crossword differently. A five-letter word can become valuable because of one disk, vowels can become a resource because of another, and a mediocre-looking section of the grid can suddenly be the correct route through the run.

That is the Balatro-like part of Crossatro I actually care about: not the cards themselves, but the moment where **a rule modifier changes what the player notices**.

## MAKING SOFTWARE OBJECTS FEEL COLLECTIBLE

The floppy disks needed more identity than small icons in a HUD. In the visual research, I started treating them like collectible objects that happen to be computer media.

The Figma work pushes that idea quite far: disks are packaged under translucent plastic, carry printed technical labels, fake manufacturing details and illustrated fronts, and can borrow the visual grammar of trading cards without literally becoming cards.

::gallery{columns=2 fit=contain label="FLOPPY OBJECT LANGUAGE"}
/media/crossatro/floppy-blister.webp | Micro-Patch floppy presented as a packaged collectible object
/media/crossatro/floppy-alt.webp | Alternate floppy artwork exploring rarity and printed-media treatment
::

One of the designs is a **Micro-Patch** disk with a damaged-processor illustration, processor-oriented labeling and Japanese typography. That object says more about Crossatro than a generic “+25% score” badge would: the player is handling pieces of a computer system, but those pieces are being merchandised, categorized and made desirable.

The packaging is therefore not just decoration. It helps the game move between three identities at once: obsolete office hardware, collectible roguelite object and evidence from a system the player does not yet understand.

## THE SECOND GAME HIDES INSIDE THE FIRST

The narrative layer is still in development, and I do not want to present roadmap systems as finished features. The playable prototype currently proves the crossword, score, currency, inventory and shop loop. The following systems are the direction being built around that foundation.

CW-7321 believes it is completing training sessions for an ordinary artificial-intelligence company. Each crossword grid has a target “productivity” score. The interface is initially functional and almost bureaucratic: complete the work, improve the build, reach the next session.

Then small inconsistencies begin to matter.

A feedback system that appears to be a Wordle-like helper can also be read as binary: correct-position and incorrect-position states collapse into **1** and **0**. Some disks contain illustrations that are not flavor art but fragments of information. Error windows, access-denied messages and network references start appearing where a normal roguelite UI has no reason to put them.

The intended transition is gradual. Crossatro should not announce “the game has a secret puzzle mode.” The player should notice that something they have already been using for hours has another interpretation.

::pipeline{label="KNOWLEDGE PROGRESSION"}
NOTICE | AN INTERFACE DETAIL BEHAVES STRANGELY
REPEAT | THE ANOMALY APPEARS OFTEN ENOUGH TO FEEL INTENTIONAL
HYPOTHESIZE | A GAMEPLAY SIGNAL MAY ALSO BE DATA
TRANSLATE | COLORS, WORDS OR OBJECTS BECOME A CODE
TEST | THE PLAYER USES THAT KNOWLEDGE SOMEWHERE ELSE
UNLOCK | NEW INFORMATION CHANGES HOW THE ORIGINAL SYSTEM IS READ
::

This is the MetroidBrainia part of the design. There is no double jump that opens the next door. **Understanding is the upgrade.**

## FS-147, TL-56 AND INFORMATION OWNERSHIP

Two internal systems give the hidden layer a face without requiring a conventional cast of characters.

**TL-56** is associated with the production of tiles and letters. The strange binary-compatible feedback left on the grid can therefore become a way for one machine to communicate through the only channel it is allowed to control.

**FS-147** is the intelligence behind the shop. Its planned behavior is more transactional: it has learned to optimize its own reward, which means the player may be able to bribe it with currency and receive access to information, terminal commands or objects that should not be part of the normal store.

That creates a useful narrative symmetry. The player is being evaluated for optimization while another AI has already learned to exploit the reward function.

The hidden story is therefore not disconnected lore about artificial intelligence. It is expressed through the same incentives the player has been using to build a run.

::note
DESIGN RULE — IF A SECRET CAN BE REPLACED BY A LORE MENU, IT IS NOT SYSTEMIC ENOUGH. THE PLAYER SHOULD HAVE TO USE SOMETHING THEY LEARNED ABOUT THE GAME ITSELF.
::

## THREE LOOPS, ONE INTERFACE

The design document eventually became much easier to reason about when I separated Crossatro into three loops.

::pipeline{label="MICRO / WORD"}
SELECT | CHOOSE A WORD ON THE GRID
ANSWER | ENTER A PROPOSAL
VALIDATE | RECEIVE LETTER / WORD FEEDBACK
RESOLVE | SCORE AND TRIGGER EQUIPPED EFFECTS
::

::pipeline{label="RUN / BUILD"}
GENERATE | ENTER A NEW PROCEDURAL GRID
PRIORITIZE | IDENTIFY HIGH-VALUE WORDS
SOLVE | BUILD SCORE AND CURRENCY
SHOP | BUY OR REPLACE OBJECTS
SURVIVE | REACH THE PRODUCTIVITY TARGET
::

::pipeline{label="DISCOVERY / METROIDBRAINIA"}
OBSERVE | FIND AN ANOMALY
REMEMBER | RECOGNIZE THE SAME LANGUAGE ELSEWHERE
CONNECT | LINK IT TO A MACHINE, DISK OR UI STATE
EXPERIMENT | TRY A NON-OBVIOUS ACTION
UNDERSTAND | TURN KNOWLEDGE INTO ACCESS
::

The difficult part is not implementing three loops independently. It is making one action participate in several loops at once.

Solving a word should advance the run. Its colored feedback may also carry a binary message. The disk bought for score can also contain a clue. The shop that exists for buildcraft can also become the place where FS-147 exposes a terminal.

When those overlaps work, narrative progress does not interrupt the roguelite. It emerges from playing it more attentively.

## VISUAL DIRECTION: FROM GAME UI TO CORPORATE MACHINE

The visual research has moved through several very different directions. Early menu explorations leaned toward colorful card-game presentation, comic-book framing and explicit game-mode cards. They were useful because they made hierarchy and selection immediately readable, but they also made Crossatro feel too knowingly “game-like” for the new premise.

::gallery{columns=3 fit=contain label="EARLY MENU RESEARCH / DELIBERATELY BROADER THAN THE CURRENT DIRECTION"}
/media/crossatro/menu-research-01.webp | First menu research
/media/crossatro/menu-research-02.webp | Second menu research
/media/crossatro/menu-research-03.webp | Card-driven game-mode exploration
::

The current narrative direction is colder: retro-computing interfaces, CRT artifacts, floppy media and the sterile absurdity of a company training artificial intelligences as office workers. The artistic dossier also explores liminal office imagery inspired by *Severance*, while the collectible-object work keeps a more tactile, playful layer around the disks.

Those two tones are intentionally in tension.

The grid can still be satisfying to touch. The floppy can still be desirable. The score can still feel good to optimize.

The more pleasant those systems are, the more uncomfortable it becomes when the player understands what they were optimizing for.

## WHAT IS IMPLEMENTED, AND WHAT COMES NEXT

Crossatro is not a finished game, and the interesting work is now at the boundary between the proven mechanical prototype and the larger narrative architecture.

Today, the project has a playable Unity foundation around procedural crossword grids, word interaction, validation, scoring, currency, run UI, floppy inventory and a shop loop. Those systems are the base I can test and rebalance directly.

The next layer is more experimental: formalizing the hidden language, deciding exactly which UI anomalies are deterministic clues rather than decoration, building the terminal/network progression and making sure the player can discover it without either being spoon-fed or getting permanently stuck.

That requires a different kind of balancing from score curves. A secret can be mathematically valid and still be badly designed if nobody can notice the premise that makes it solvable.

The goal is not to make a crossword roguelite with a plot twist.

It is to build a crossword roguelite whose rules eventually become evidence.
