---
title: CROSSATRO
sub: A French crossword database generator
status: SHIPPED
year: 2024
stack: [Python, Gemini API]
---

A generation pipeline that builds and validates a French crossword clue
database, then packs it into a grid solver.

The interesting problem was not generation but verification: a model will
happily produce a clue that is plausible, idiomatic, and wrong.
