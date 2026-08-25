---
title: FROGBYTE
sub: Engineering a data-oriented foundation in Rust
status: ACTIVE RESEARCH
year: 2025
stack: [Rust, SIMD, Criterion]
link: https://github.com/jordangrilly/frogbyte
---

::figure{cols=ENTITY,POSITION,VELOCITY}
id, parent, tag, flags, layer, health, team, state, ...
x, y, z, rotation, scale, bounds, chunk, ...
vx, vy, vz, speed, accel, drag, max_speed, ...
::

An entity-component-system engine written from scratch, built around the
memory layout rather than around the object model. Components live in
structure-of-arrays storage so a system iterating one field touches only
that field's cache lines.

The scheduler builds a dependency graph from each system's declared reads
and writes, detects conflicts, and runs everything else in parallel.

## WHY IT MATTERS

Benchmarked against Bevy with Criterion across entity counts from 1k to 1M.
The gap widens with scale, which is the whole point: the win is in cache
behaviour, and cache behaviour only shows up once the working set stops
fitting in L2.

::image{src=frogbyte-bench.png alt="Iteration time vs entity count"}

The parallel scheduler was the hard part. Detecting that two systems conflict
is easy; proving that they do not, cheaply enough to be worth doing every
frame, is not.

## WHAT I LEARNED

Writing the benchmark honestly mattered more than writing the engine. It is
very easy to build a microbenchmark that measures your own assumptions.
