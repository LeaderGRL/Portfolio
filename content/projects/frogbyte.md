---
title: FROGBYTE
sub: Refactoring my ECS experiments into a professionally engineered Rust foundation
status: FOUNDATION / ACTIVE DEVELOPMENT
year: 2026
stack: [Rust, ECS, Criterion, GitHub Actions]
link: https://github.com/FrogbyteEngine/Frogbyte
---

Frogbyte is the continuation of work I started in **LeadEngine**, but with a very different objective.

LeadEngine was an experimental Rust workspace focused on ECS architecture. I used it to explore several storage models, queries, schedulers and data layouts, and to benchmark different approaches while learning what actually mattered in practice.

Frogbyte takes those experiments and starts again with a stricter rule: the architecture should not only be interesting to build, it should also be maintainable, measurable, reviewable and difficult to accidentally break.

The feature count got smaller. The guarantees got larger.

## FROM LEADENGINE TO FROGBYTE

LeadEngine was essentially my ECS laboratory. The repository contains several competing approaches rather than one polished final architecture: AoS and SoA archetypes, field-level SoA experiments, matching query implementations, multiple scheduler variants, a thread pool, dependency graph, metrics, events, resources and procedural macros.

It also contains Criterion benchmarks, including comparison experiments against Bevy ECS. Those measurements belong to that implementation. Frogbyte does not reuse them as performance claims because the storage model and codebase are being rebuilt.

That experimental breadth was useful. It showed me where complexity accumulates quickly in an ECS: storage, structural changes, scheduling, ownership and all the glue required to keep those systems coherent.

Frogbyte is the refactor that came out of those lessons.

## A SMALLER, STRONGER FOUNDATION

The current Frogbyte repository is a Rust 2024 workspace with the ECS isolated in `frogbyte_ecs` and a separate renderer crate boundary for later work. The public implementation currently concentrates on the ECS foundation rather than pretending the rest of the engine already exists.

The first pieces are intentionally low-level:

- generational entity allocation with stale-handle rejection;
- contiguous type-erased component storage through `BlobVec`;
- archetypes built from canonical component sets and aligned columns;
- Criterion benchmarks around allocator, storage and archetype operations.

Queries, archetype transitions and world orchestration are not implemented yet. They are the next layers, and I would rather write that sentence than market a TODO comment as architecture.

## REBUILDING THE ECS CORE

One of the biggest changes is the component storage itself. Frogbyte uses `BlobVec` as a type-erased contiguous column that owns its allocation, layout, concrete `TypeId` and destructor.

That gives archetypes a uniform storage primitive without giving up control over where the bytes live or how they are destroyed.

::figure{cols=ENTITY,POSITION,VELOCITY}
E0,E1,E2
P0,P1,P2
V0,V1,V2
::

An archetype keeps those columns aligned by row. Structural operations therefore have a very explicit responsibility: if an entity moves or disappears, every associated column must tell exactly the same story afterward.

This is the part of ECS development I enjoy most: the API may eventually become pleasant and high-level, but underneath it somebody still has to move the bytes without inventing a new category of undefined behavior.

## `UNSAFE` IS ALLOWED. IMPROVISATION IS NOT.

Type-erased storage requires raw allocation, pointer arithmetic and manual destruction. Frogbyte uses `unsafe` where that work genuinely needs it, but treats every unsafe block as a reviewable boundary rather than permission to become creative with pointers.

The storage code documents local safety assumptions and explicit invariants around initialization, alignment, capacity and zero-sized types. Panic-safe drop guards protect component destruction during unwinding so structural state is repaired before user destructors get an opportunity to make the afternoon more interesting.

Workspace lints reinforce the same policy: undocumented unsafe blocks and missing safety documentation are rejected instead of being left for a future cleanup pass.

## PERFORMANCE NEEDS RECEIPTS

Performance is one of the reasons Frogbyte exists, but I do not want "data-oriented" to become decorative text in the README.

Criterion benchmarks currently cover entity allocation, component storage and archetype operations. They provide a baseline for changing layouts and algorithms as the ECS grows.

LeadEngine already taught me how easy it is to accumulate benchmarks while experimenting with several architectures at once. Frogbyte takes a more disciplined approach: benchmark the implementation that actually exists, keep the workload reproducible, and do not carry old numbers into a rewrite just because they look good.

"It feels faster" remains unsupported by Criterion.

## INFRASTRUCTURE AS PART OF THE PROJECT

The other major refactor is not inside `src/` at all.

Frogbyte is built with the expectation that changes should continuously prove they still compile, remain documented and preserve the assumptions around low-level memory code. The repository infrastructure is therefore part of the project rather than something added just before a release.

Pull requests run formatting, Clippy, tests and documentation validation. The main matrix covers Ubuntu and Windows, and a Windows release build checks the non-debug configuration as well.

The ECS has a dedicated **Miri** workflow using a pinned nightly toolchain. If I am going to write type-erased storage with raw pointers, having an interpreter whose hobby is finding invalid memory behavior seems like a reasonable colleague to invite.

Security and maintenance are automated as well:

- dependency changes are reviewed automatically;
- GitHub Actions configuration is checked with Zizmor;
- third-party Actions are pinned to commit SHAs;
- Dependabot watches Cargo and GitHub Actions weekly;
- scheduled validation tests Rust beta and nightly;
- another scheduled path updates compatible dependencies and reruns the workspace tests.

There is also a custom AI-quality guard in the CI pipeline so assisted changes still pass through explicit repository policy rather than receiving a diplomatic immunity badge.

## ENGINEERING POLICY IN THE REPOSITORY

Frogbyte centralizes lint and documentation rules at workspace level. Correctness warnings can fail CI, ignored `must_use` values are rejected, unsafe contracts are documented, and API documentation is validated with the code that implements it.

That may sound like more ceremony than an early engine needs. That is exactly why I am doing it early.

Retrofitting discipline after several subsystems depend on accidental behavior is possible. I already had the prototype version of that experience.

## CURRENT STATUS

Frogbyte is still a foundation project, not a finished engine. Today the public work is concentrated on entity lifecycle, type-erased component storage, archetypes and the infrastructure around them.

The next ECS work is where the refactor becomes especially interesting: queries, structural transitions between archetypes and world-level orchestration will have to build on the contracts already established by the storage layer.

The goal is not to reproduce LeadEngine feature-for-feature. It is to keep the useful experiments, discard the accidental complexity and build the next version with stronger engineering habits from the first commit.

Frogbyte is therefore less a sequel to LeadEngine than its code review.
