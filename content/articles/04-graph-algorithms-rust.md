---
title: GRAPH ALGORITHMS · RUST
sub: Theory, bitsets, SIMD and Rayon
year: 2025
---

Graphs appear anywhere relationships matter: navigation, social networks,
build systems, and ECS schedulers. In my engine, nodes are systems and directed
edges encode execution dependencies. Fast graph operations determine how much
parallel work a frame can expose.

::image{src=medium/graph-algorithms-rust/01.webp alt="Directed graph and its squared graph" rows=9}

## REPRESENTATION FIRST

An adjacency list stores only existing edges and is ideal for sparse graphs. An
adjacency matrix makes edge lookup constant-time and maps naturally to dense
operations. The right representation depends on graph density and on the
questions asked repeatedly.

Graph square G² connects u to v whenever a path of at most two edges exists.
With a matrix, the direct implementation is three nested loops: for every
source, destination, and intermediate node, test whether both edges exist.
That O(V³) form is easy to verify and a useful baseline.

::image{src=medium/graph-algorithms-rust/02.webp alt="Adjacency matrix representation" rows=9}

## REMOVE USELESS WORK

The first optimization is an early exit. Once one intermediate node proves a
two-hop path, no further search is needed for that pair. It preserves the worst
case, yet helps many real graphs.

The larger change is packing each matrix row into bits. A 64-bit word represents
64 possible edges. Squaring becomes a sequence of masks and OR operations
instead of scalar tests. Memory shrinks and each instruction does more work.

::image{src=medium/graph-algorithms-rust/03.webp alt="Bitwise graph row encoding" rows=9}

## SIMD

Bitsets make vectorization natural. AVX registers can combine several u64 words
per instruction, provided the workload is contiguous and large enough to repay
setup and remainder handling. SIMD is powerful here because the operation is
uniform: load words, OR them, store the result.

::image{src=medium/graph-algorithms-rust/04.webp alt="SIMD processing several graph words" rows=9}

## PARALLEL ROWS

Rows of the result are independent. Rayon can distribute them across cores and
collect each thread's output without shared mutation. Work stealing balances
uneven rows, but task scheduling has overhead. Small graphs stay faster on one
core; parallelism wins only after the work per partition becomes substantial.

::image{src=medium/graph-algorithms-rust/05.webp alt="Benchmark results across graph sizes" rows=10}

## WHAT THE BENCHMARKS SAID

- Small graphs favor simple scalar or bitwise code with minimal setup.
- Medium graphs are a strong SIMD territory.
- Large graphs can amortize Rayon and use the available cores.
- Density changes branch behavior and the amount of useful work per row.
- The fastest variant is selected by workload, not by technique prestige.

The progression matters more than the final speedup: establish a correct
baseline, change one dimension at a time, and benchmark the graph sizes the
engine actually produces. Complexity describes growth; measurements reveal
the constants, memory traffic, and thresholds that decide a frame.

