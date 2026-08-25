---
title: CPU CACHES · ECS IN RUST
sub: From latency to data layout
year: 2026
---

Two implementations can perform the same arithmetic and differ dramatically
in speed. The missing variable is often data movement. A modern core can finish
many instructions while a request to main memory is still in flight.

::image{src=medium/cpu-cache-optimization/01.webp alt="Processor and memory hardware" rows=10}

## THE MEMORY WALL

At roughly 4 GHz, a cycle is about a quarter nanosecond. A main-memory access
near one hundred nanoseconds can therefore stall progress for hundreds of
cycles. Caches exist to keep recently used and nearby data closer to execution.

- L1 is tiny and fastest, commonly reached in a handful of cycles.
- L2 is larger and slower, but still private on many processors.
- L3 is shared, much larger, and the last cache before RAM.
- RAM is spacious, but a full miss is the expensive path.

::image{src=medium/cpu-cache-optimization/02.webp alt="CPU memory hierarchy" rows=9}

## CACHE LINES

The processor fetches memory in blocks, commonly 64-byte cache lines. Reading
one f32 may fetch fifteen neighbors with it. Sequential iteration converts that
cost into useful work; pointer chasing often wastes the rest of the line.

An address is effectively divided into offset, set index, and tag. Associativity
allows several lines to occupy the same set, reducing collisions without
turning lookup into a fully associative search.

::image{src=medium/cpu-cache-optimization/03.webp alt="Cache line and address anatomy" rows=10}

## THREE MISSES

- Compulsory: the first access to a line. It cannot be removed, only amortized.
- Capacity: the active working set is larger than the available cache.
- Conflict: addresses compete for the same set despite unused capacity elsewhere.

Temporal locality reuses data while it is still warm. Spatial locality consumes
neighbors already present in the fetched line. These are not abstract rules;
they determine which layout a system should use.

::image{src=medium/cpu-cache-optimization/04.webp alt="Cache miss categories" rows=8}

## AOS OR SOA

AoS is appropriate when code reads nearly every field of one entity together.
Component-level SoA is better when a system touches only a few component types.
Field-level SoA is strongest for simple bulk operations that can be vectorized.

A position sum over x values is the clean example. AoS loads y, z, padding, and
possibly unrelated state. A contiguous x slice gives the cache and hardware
prefetcher a predictable stream.

::image{src=medium/cpu-cache-optimization/05.webp alt="AoS versus SoA cache behavior" rows=10}

## PREFETCH WITH CARE

Hardware prefetchers recognize sequential and stable-stride access. Random
indices, linked lists, and dependent addresses defeat prediction. Manual
prefetch intrinsics can help specialized loops, but they can also evict useful
data or arrive too late. Measure before keeping them.

::image{src=medium/cpu-cache-optimization/06.webp alt="Sequential access and hardware prefetch" rows=9}

The practical method is simple: make the hot loop obvious, reduce its working
set, keep access contiguous, benchmark realistic entity counts, then inspect
cache misses with a profiler. Data-oriented design is not about replacing every
struct. It is about arranging the data each critical system actually consumes.

