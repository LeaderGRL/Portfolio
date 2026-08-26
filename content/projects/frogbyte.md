---
title: FROGBYTE
sub: Rebuilding an engine around data, evidence and explicit contracts
status: FOUNDATION / ACTIVE RESEARCH
year: 2026
stack: [Rust, ECS, Criterion, GitHub Actions]
link: https://github.com/FrogbyteEngine/Frogbyte
---

Frogbyte is a ground-up refactoring of ideas first explored in LeaderEngine.
LeaderEngine was where I learned how much fun it is to build an engine from
scratch. Frogbyte is where I started asking the less glamorous question: **what
would I do differently if the code had to survive reviews, benchmarks, CI,
unsafe audits and my future self?**

The answer was not "rewrite everything in Rust and immediately add more
features". That is a very efficient way to obtain the same architecture in a
new language.

Instead, Frogbyte starts again from the foundations: entity identity, component
storage, archetypes, memory ownership and the contracts that higher-level
systems will eventually depend on. Features come later. Invariants get a chair
at the table first.

## STARTING OVER WITHOUT PRETENDING NOTHING HAPPENED

LeaderEngine explored a broad surface area: ECS, scripting, networking,
rendering and gameplay systems. That breadth was useful because it exposed the
places where an engine becomes difficult to reason about once enough systems
start depending on each other.

Frogbyte keeps the lessons and discards the obligation to preserve the old
architecture. It is organized as a Rust workspace with separate ECS and
renderer crates, so subsystem boundaries are visible in the repository instead
of existing mostly in diagrams and good intentions.

The current public foundation is deliberately narrow. The ECS implements
**generational entities, type-erased component storage and archetype columns**.
Queries, archetype transitions and world-level orchestration are still future
layers. Saying "not implemented yet" is considerably cheaper than debugging a
fictional feature.

## AN ENTITY IS TWO INTEGERS WITH TRUST ISSUES

An `Entity` is a generational handle: an index identifies a slot and a
generation identifies which lifetime of that slot we mean.

When an entity is removed, its slot can be reused. The generation changes when
that happens, so an old handle cannot quietly refer to the new occupant. A
stale entity coming back from the dead is a bug; Frogbyte does not promote it
to a resurrection mechanic.

This sounds like bookkeeping because it is bookkeeping. It is also the kind of
bookkeeping every later ECS operation assumes is correct. If identity is
ambiguous, everything built above it gets to enjoy ambiguous bugs too.

## TYPE ERASURE, OR: RUST AGREES NOT TO KNOW `T` FOR A MOMENT

Components of one concrete type live in `BlobVec`, a contiguous type-erased
container. It stores the allocation, element `Layout`, `TypeId`, logical
length, capacity and the destructor required to clean up values whose concrete
type is no longer present in the container's public shape.

That gives the ECS a low-level column that can own `Position`, `Velocity` or
any other component through the same runtime representation while still
preserving the information needed to allocate, move and destroy the original
values correctly.

Type erasure is useful precisely because an archetype cannot be generic over
every component combination that might exist at runtime. At some point the
engine has to stop asking the compiler what `T` is and start carrying enough
metadata to behave correctly without it.

This is also where the code becomes interestingly dangerous.

`BlobVec` performs allocation, reallocation, pointer arithmetic and manual
destruction. Rust is happy to let you do all of that after you write `unsafe`.
Rust is also happy to let you be wrong afterward. The keyword is not a force
field.

Frogbyte therefore treats every unsafe operation as a small contract. Local
`SAFETY` comments explain the assumptions, workspace lints reject undocumented
unsafe blocks, and the storage code keeps explicit invariants for alignment,
initialization, capacity and zero-sized types. Unsafe code is where the compiler
stops proving part of the story, so the programmer has to make that story
reviewable.

## ARCHETYPES: PUT THE BYTES NEXT TO THE BYTES THEY TRAVEL WITH

An `Archetype` represents one exact set of component types. Each component type
gets its own contiguous `BlobVec` column, while entities and component rows stay
aligned.

::figure{cols=ENTITY,POSITION,VELOCITY}
E0,E1,E2
P0,P1,P2
V0,V1,V2
::

Row `1` means `E1`, `P1` and `V1` belong together. Removing a row uses
swap-remove across every column so that alignment survives the operation.

This layout is not exotic. Archetype ECS designs group entities with the same
component set and keep component data contiguous because linear iteration is
exactly the kind of memory access modern CPUs are good at. Type erasure is what
lets a runtime ECS build those columns without knowing every component type in
advance.

The interesting part is not drawing three neat columns. The interesting part is
keeping them neat after insertion, removal, destruction and eventually
archetype transitions. CPUs like contiguous data. Bugs also enjoy contiguous
data if you move the wrong row, so alignment is treated as an invariant rather
than a suggestion.

## DROP EVERYTHING. PREFERABLY ONCE.

Type-erased storage owns values whose destructors must still run exactly once.
That becomes unpleasant when a destructor panics halfway through removing an
archetype row.

Frogbyte uses drop guards so structural changes are completed first and pending
component values are then destroyed in a way that can continue during
unwinding. The goal is not to make panicking destructors a recommended hobby.
It is to keep one bad destructor from turning the remaining columns into an
ownership crime scene.

This kind of work is representative of the refactor: the visible feature is
"remove an entity from an archetype"; most of the engineering is deciding what
must remain true when the happy path stops being happy.

## PERFORMANCE WITHOUT THE CEREMONIAL STOPWATCH

Frogbyte is performance-oriented, but the project deliberately avoids turning
"data-oriented" into a magic adjective.

The ECS currently has Criterion benchmarks for entity allocation, component
storage and archetype operations. They exist so design changes can be compared
against evidence instead of intuition. **"It feels faster" is not a unit of
measurement**, even when said confidently.

The workflow is intentionally boring:

- define the invariant and the operation being measured;
- implement the smallest useful version;
- test correctness first;
- benchmark it with Criterion;
- change the design when the data gives us a reason.

That last step matters. Data-oriented design is not "replace every struct with
SoA and collect 10% performance". Access patterns decide which layouts are
useful, and fragmented archetypes can become their own performance problem when
a design creates too many tiny tables. Archetypes are a tool, not a coupon for
free cache locality.

## THE INFRASTRUCTURE IS NOT THE BORING PART

A major difference from LeaderEngine is that Frogbyte treats repository
infrastructure as part of the engine rather than the paperwork around it.

Every pull request goes through formatting, Clippy, tests, doctests, rustdoc and
a Windows release build. The main test and lint matrix runs on both Ubuntu and
Windows. A required aggregate job refuses to call the workflow successful when
one of those jobs quietly disappeared behind a green checkmark.

The ECS also has a dedicated **Miri** workflow. Miri is effectively the
paranoid reviewer invited specifically because raw pointers are involved. If a
memory model assumption is questionable, I would rather hear about it from a
machine in CI than from a user with a crash dump.

Security gets its own workflow as well: dependency changes are reviewed and
GitHub Actions are checked with Zizmor. Third-party Actions are pinned to commit
SHAs instead of floating tags.

Then there is dependency maintenance. **Dependabot** checks Cargo and GitHub
Actions weekly, while scheduled validation runs the workspace against Rust beta
and nightly and also tests the latest compatible dependency resolution. Monday
morning can therefore begin with useful automation complaining before I have
had the opportunity to do it myself.

The repository also carries a custom AI-quality guard. That part is less about
buzzwords than about enforcing review policy in a codebase where generated or
assisted changes still have to meet the same engineering bar as handwritten
ones.

## POLICY AS CODE

Workspace-level lints make several expectations explicit: correctness warnings
can fail the build, ignored `must_use` values are rejected, unsafe blocks need
local justification, public unsafe functions need safety documentation, and
panic-prone conveniences such as `unwrap` remain visible during review.

Documentation lives next to the implementation and is versioned with it. The
project charter and engineering policies are therefore reviewable artifacts,
not oral tradition stored in whichever developer last touched the subsystem.

This is intentionally more process than the old engine had. Process is cheaper
to add before ten crates depend on an accidental API.

## WHERE FROGBYTE IS NOW

Frogbyte is still pre-release. The ECS foundation currently has the pieces that
later systems need to trust: entity allocation, type-erased component columns
and archetype storage. Queries, archetype transitions and world orchestration
come next; the renderer crate exists as a separate boundary but is earlier in
its public implementation.

That may sound less spectacular than claiming a complete engine. It is also a
much better place to build one from.

The point of Frogbyte is not "I rewrote LeaderEngine in Rust." The point is to
take the same curiosity that produced LeaderEngine and apply stricter rules to
it: know who owns the bytes, document the unsafe parts, measure performance,
make CI annoying on purpose, and avoid building the third floor before checking
whether the foundation is actually concrete.
