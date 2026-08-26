---
title: FROGBYTE
sub: Rebuilding a Rust engine with production-grade engineering discipline
status: FOUNDATION / ACTIVE RESEARCH
year: 2026
stack: [Rust, ECS, Criterion, GitHub Actions]
link: https://github.com/FrogbyteEngine/Frogbyte
---

::facts{columns=2 label="FOUNDATION"}
LANGUAGE | RUST 2024
WORKSPACE | ECS + RENDERER CRATES
CURRENT ECS | ENTITIES + BLOBVEC + ARCHETYPES
BENCHMARKING | CRITERION
VALIDATION | TESTS + CLIPPY + MIRI + RUSTDOC
STATUS | PRE-RELEASE / RESEARCH
::

Frogbyte is a ground-up refactoring and re-foundation of ideas explored in
LeaderEngine. The goal is not to reproduce the old engine feature-for-feature.
It is to rebuild the foundation in a context where maintainability, explicit
invariants, measurable performance, reviewability and automated validation are
part of the architecture from the beginning.

That changes the order of work. Instead of accumulating features first and
hardening them later, Frogbyte deliberately spends time on small foundational
systems whose contracts can be tested and audited before higher-level engine
features depend on them.

## WHY REBUILD LEADERENGINE

LeaderEngine was valuable as an exploration of engine architecture, ECS,
scripting, networking and gameplay systems. Frogbyte takes the next step: use
that experience while removing assumptions that came from learning by building.

The new project is structured as a Rust workspace rather than one monolithic
engine package. The public repository currently separates the ECS foundation
from the renderer, allowing each subsystem to evolve with a narrower API and a
clearer validation surface.

::system{columns=2 label="ENGINEERING DIRECTION"}
FOUNDATION FIRST | STABILIZE INVARIANTS BEFORE FEATURE COUNT
DATA ORIENTED | DESIGN STORAGE AROUND ACCESS PATTERNS
MEASURE FIRST | BENCHMARK BEFORE CLAIMING A PERFORMANCE WIN
EXPLICIT UNSAFE | DOCUMENT EVERY MEMORY-SAFETY CONTRACT
AUTOMATED REVIEW | CI, SECURITY AND TOOLCHAIN CHECKS ARE PART OF THE PRODUCT
SCOPE CONTROL | UNFINISHED SYSTEMS ARE LABELLED AS UNFINISHED
::

## ECS FOUNDATION

The current ECS is intentionally small. It implements the pieces that every
later query, scheduler and world abstraction will have to trust.

`Entity` is a generational handle made from an index and a generation. Removed
slots can be reused, but the generation changes so a stale handle cannot be
mistaken for the new entity occupying the same slot.

Component storage is built around `BlobVec`, a contiguous type-erased container
for one concrete component type. It keeps the component layout, `TypeId` and
destructor needed to own values without knowing their concrete type at runtime.
This is the low-level storage primitive used by archetypes.

`Archetype` then groups entities that share one exact component set. Each
component type owns a contiguous column and row indices stay aligned between the
entity list and every component column.

::figure{cols=ENTITY,POSITION,VELOCITY}
E0,E1,E2
P0,P1,P2
V0,V1,V2
::

::facts{columns=2 label="CURRENT ECS BOUNDARY"}
ENTITY IDENTITY | GENERATIONAL INDEX + GENERATION
ALLOCATION | SLOT REUSE WITH STALE-HANDLE REJECTION
COMPONENT STORAGE | CONTIGUOUS TYPE-ERASED BLOBVEC
ARCHETYPES | CANONICAL COMPONENT SET + ALIGNED COLUMNS
NOT IMPLEMENTED YET | QUERIES + ARCHETYPE TRANSITIONS
NOT IMPLEMENTED YET | WORLD-LEVEL ORCHESTRATION
::

Keeping that boundary explicit matters. A professional foundation is also the
ability to say what the engine does **not** provide yet instead of presenting an
experiment as a finished architecture.

## UNSAFE AS AN AUDITED BOUNDARY

Type-erased contiguous storage requires low-level memory operations. Frogbyte
does not try to hide that fact. `BlobVec` owns allocation, reallocation,
destruction and type-erased access directly, with explicit invariants around
length, capacity, initialization, alignment and zero-sized types.

Unsafe operations are surrounded by local `SAFETY` justifications, while the
workspace lint policy denies undocumented unsafe blocks and missing safety
documentation. Panic-safe drop guards are used so component destruction cannot
silently break storage ownership during unwinding.

This is an important change from treating low-level code as an implementation
detail: memory safety is a contract that can be reviewed independently.

## PERFORMANCE WORK

Performance work is based on measurement rather than on a headline comparison.
The ECS crate currently contains Criterion benchmarks for three foundations:
entity allocation, component storage and archetype operations.

::pipeline{label="PERFORMANCE LOOP"}
DEFINE CONTRACT | SPECIFY THE DATA STRUCTURE AND ITS INVARIANTS
IMPLEMENT | KEEP THE HOT PATH SMALL AND REVIEWABLE
BENCHMARK | CRITERION ON ALLOCATOR / STORAGE / ARCHETYPE OPERATIONS
VALIDATE | TEST CORRECTNESS BEFORE INTERPRETING TIMINGS
ITERATE | CHANGE THE DESIGN ONLY WITH EVIDENCE
::

The previous portfolio version claimed a Bevy comparison and SIMD results that
are not part of the current public Frogbyte foundation. Those claims have been
removed deliberately. The project should communicate measured reality, not a
future optimization roadmap as if it were already shipped.

## INFRASTRUCTURE IS PART OF THE ENGINEERING

A major purpose of the refactor is to treat repository infrastructure as part
of the software design. The default CI pipeline validates the workspace on both
Ubuntu and Windows and does considerably more than run unit tests.

::pipeline{label="PULL REQUEST VALIDATION"}
FORMAT | CARGO FMT --CHECK
STATIC ANALYSIS | CLIPPY ACROSS WORKSPACE / ALL TARGETS
TESTS | LINUX + WINDOWS / ALL FEATURES
DOCUMENTATION | DOCTESTS + RUSTDOC WITH WARNINGS AS ERRORS
RELEASE | WINDOWS RELEASE BUILD
QUALITY GUARD | CUSTOM RUST TOKEN GUARD + INTEGRATED VALIDATOR
REQUIRED GATE | AGGREGATE JOB REJECTS PARTIAL SUCCESS
::

Memory-model validation has its own Miri workflow for the ECS and uses a pinned
nightly toolchain. Security validation reviews dependency changes and analyzes
GitHub Actions configuration. Third-party Actions are pinned to commit SHAs
rather than floating tags.

Dependabot checks both Cargo dependencies and GitHub Actions every week. A
separate scheduled workflow tests beta and nightly Rust compatibility and also
resolves the latest compatible dependencies before running the workspace tests.
This catches ecosystem drift before it becomes a surprise during feature work.

::facts{columns=2 label="REPOSITORY HARDENING"}
CI PLATFORMS | UBUNTU 24.04 + WINDOWS 2025
MEMORY CHECK | MIRI / ECS
SECURITY | DEPENDENCY REVIEW + ZIZMOR
DEPENDENCIES | WEEKLY DEPENDABOT
FUTURE RUST | WEEKLY BETA + NIGHTLY TESTS
LATEST DEPS | SCHEDULED CARGO UPDATE + TEST
::

## ENGINEERING POLICY

The workspace centralizes lint rules instead of leaving quality decisions to
individual crates. Correctness warnings can fail the build; ignored must-use
values are rejected; public unsafe functions must document their contracts;
and panic-prone conveniences such as `unwrap` are kept visible during review.

Documentation is versioned next to the code so engineering rules can evolve
through the same review process as implementation. This makes architectural
intent inspectable rather than depending on conventions that only exist in the
author's head.

## CURRENT DIRECTION

Frogbyte is still pre-release and its APIs are expected to change. The next ECS
layers — queries, archetype transitions and world orchestration — are exactly
where the existing storage contracts will start paying off. The renderer crate
is present as a separate workspace boundary but remains earlier in its public
foundation than the ECS.

::timeline
LEADERENGINE | LEARN ENGINE ARCHITECTURE BY BUILDING A COMPLETE CUSTOM ENGINE
REFOUNDATION | RESTART AROUND RUST, DATA OWNERSHIP AND EXPLICIT CONTRACTS
ECS CORE | GENERATIONAL ENTITIES + BLOBVEC + ARCHETYPE STORAGE
INFRASTRUCTURE | CROSS-PLATFORM CI + MIRI + SECURITY + DEPENDENCY AUTOMATION
NEXT | QUERIES, TRANSITIONS, WORLD ORCHESTRATION AND RENDERER FOUNDATIONS
::

## WHAT THIS PROJECT REPRESENTS

Frogbyte is less about saying "I wrote another engine" and more about applying
professional software-engineering discipline to a domain where correctness and
performance are tightly coupled. The interesting work is in deciding what must
be guaranteed, how that guarantee is tested, and how future optimization can be
measured without weakening the safety or maintainability of the system.
