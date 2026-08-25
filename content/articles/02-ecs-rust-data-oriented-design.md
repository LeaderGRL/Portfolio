---
title: ECS #1 · WHY RUST
sub: Data-oriented engine architecture
year: 2026
---

# What is an ECS and Why Rust? A Deep Dive into Data-Oriented Game Engine Design

*This is (almost) the first article in a series about building a high-performance Entity Component System from scratch in Rust. We'll explore the architecture, optimizations, and lessons learned along the way.*

---

## Why I'm Building My Own 3D Engine

Before diving into the technical details, let me share why I started this project.

I'm building a 3D game engine in Rust, not because the world needs another engine, but because I want to `learn`. I'm fascinated by optimization, squeezing every last cycle out of the CPU, understanding cache hierarchies, and watching the compiler turn high-level abstractions into tight assembly. Rust, with its data-oriented philosophy and zero-cost abstractions, feels like the perfect language for this obsession.  
But there's another reason. I want to make games with a unique aesthetic, something that feels `mine`. And I believe the best way to achieve that is to understand every layer of the stack, from memory layout to rendering pipeline.

Markus "Notch" Persson, the creator of Minecraft, recently tweeted something that resonated with me:  
> "Write your own game engine. Authors don't download a story template for their books then see how much they can be creative within those limits, they start from scratch. So can you. It's not difficult (\*), and it makes for more interesting games.
> (\* compared to making a game)"

I know that not everyone has the opportunity to create their own engine, but I find the idea interesting.  
Minecraft itself was built on LWJGL (a low-level OpenGL binding). The result was a game that felt unlike anything else, partly *because* of its technical uniqueness.

So here I am, building an ECS based 3D engine in Rust. This series documents what I've learned, the trade-offs I've made, and hopefully helps others who want to take the same path.  

Let's start with the foundations.

---

## The Problem with Traditional Game Architecture

If you've ever built a game using Object Oriented Programming, you've probably encountered the infamous inheritance nightmare.

### A Familiar Story

You're building an RPG. You start with a clean hierarchy:

```cpp
class Entity {
public:
    virtual void update(float dt) = 0;
    virtual void render() = 0;
protected:
    Vector3 position;
    bool isActive;
};

class Character : public Entity {
protected:
    float health;
    float stamina;
    AnimationController animator;
};

class Player : public Character {
    Inventory inventory;
    InputHandler input;
    Camera* camera;
};

class Enemy : public Character {
    AIController ai;
    float aggroRange;
};
```

Clean. Elegant. Then the designer says: "What if some enemies can be possessed by the player?"  
Okay, you think. `PossessableEnemy` that inherits from `Enemy` but also needs player input handling...  
"And what if the player can transform into a wolf that doesn't have an inventory?"  
Now you need `WolfPlayer` that... doesn't inherit from `Player`? Or maybe `Player` shouldn't have `Inventory` in the first place?  
"Oh, and some enemies should be able to pick up items from the ground."

A few months later:

```
Entity
├── Character
│   ├── Player
│   │   ├── PlayerWithInventory
│   │   ├── PlayerWithMount
│   │   ├── PlayerWolf (no inventory)
│   │   └── PlayerWithInventoryAndMount
│   └── Enemy
│       ├── MeleeEnemy
│       ├── RangedEnemy
│       ├── FlyingEnemy
│       ├── PossessableEnemy
│       ├── EnemyWithInventory
│       └── FlyingPossessableEnemyWithInventory (yes, really)
├── Vehicle
│   ├── MountableVehicle
│   ├── DrivableVehicle
│   └── FlyingVehicle
├── Item
│   ├── PickupableItem
│   ├── EquippableItem
│   └── ConsumableEquippableItem
...
```

To avoid the dreaded Diamond Problem of multiple inheritance, you end up with a `Combinatorial Explosion`, For n features, you end up with 2 power of n classes possible. You're fighting the type system...

### The Hidden Performance Cost

But the problems go deeper than code organization. There's a fundamental performance issue hiding in plain sight.

Consider how a traditional game loop processes entities:

```cpp
void gameLoop(std::vector<Entity*>& entities) {
    for (auto* entity : entities) {
        entity->update(deltaTime);  // Virtual call + cache miss
    }
}
```

What's happening in memory? Each `Entity*` points to a different location in the heap. When you iterate through your vector, you're essentially doing random memory access:

```
Memory layout (OOP):

Vector: [ptr1, ptr2, ptr3, ptr4, ...]
              ↓      ↓      ↓      ↓
Heap:    [????|Obj1|????????|Obj2|??|Obj3|...]
```

Every iteration involves:
1. **Cache miss**: Load the pointer from the vector
2. **Cache miss**: Follow the pointer to the object
3. **Branch misprediction**: Virtual function dispatch through vtable
4. **Cache miss**: Load the object's data (scattered across heap)
5. **Cache miss**: Potentially load the vtable itself

Modern CPUs are incredibly fast at sequential operations but **terrible** at random memory access. A cache miss can cost 100-300 CPU cycles, that's time your CPU sits idle, waiting for data from RAM.

With 10,000 entities, you're looking at millions of wasted cycles per frame. On a 3GHz CPU, that's milliseconds lost to memory latency alone.

While building this engine, it became clear that mastering Data Oriented Design means mastering the CPU cache. To keep things focused, I wrote a separate deep dive into CPU Cache Optimization. I strongly suggest reading it, as cache management will be a recurring theme throughout these articles.

https://medium.com/me/stats/post/c3d52ff99e36

---

## Enter the Entity Component System

ECS flips the paradigm completely. Instead of asking "what *is* this object?", we ask "what *does* this object have?"

### The Three Pillars

**Entity**: Just a unique identifier. Nothing more. No data, no behavior, just an ID.

```rust
struct Entity {
    id: u32,
    generation: u32,  // For detecting stale references
}
```

**Component**: Pure data, no behavior.

```rust
struct Position { x: f32, y: f32, z: f32 }
struct Velocity { x: f32, y: f32, z: f32 }
struct Health { current: f32, max: f32 }
struct PlayerController;
struct EnemyAI { aggro_range: f32, state: AIState }
struct Inventory { items: Vec<ItemId>, capacity: usize }
```

**System**: Pure behavior operating on components.

```rust
fn movement_system(positions: &mut [Position], velocities: &[Velocity], dt: f32) {
    for (pos, vel) in positions.iter_mut().zip(velocities.iter()) {
        pos.x += vel.x * dt;
        pos.y += vel.y * dt;
        pos.z += vel.z * dt;
    }
}

fn damage_system(health: &mut [Health], damage_events: &[DamageEvent]) {
    for event in damage_events {
        health[event.target].current -= event.amount;
    }
}
```

### Composition Over Inheritance

Remember our nightmare hierarchy? With ECS, that possessable flying enemy with inventory is simply:

```rust
world.spawn((
    Position { x: 10.0, y: 50.0, z: 10.0 },
    Velocity::default(),
    Health { current: 100.0, max: 100.0 },
    EnemyAI { aggro_range: 15.0, state: AIState::Patrol },
    CanFly { max_altitude: 100.0 },
    Possessable,
    Inventory { items: vec![], capacity: 5 },
));
```

Need to remove flying capability when the enemy is injured? Just remove the component:

```rust
if health.current < 20.0 {
    world.remove_component::<CanFly>(entity);
}
```

Player transforms into a wolf?

```rust
// Remove human-specific components
world.remove_component::<Inventory>(player);
world.remove_component::<HumanModel>(player);

// Add wolf components
world.add_component(player, WolfModel);
world.add_component(player, EnhancedSenses { smell_range: 50.0 });
world.add_component(player, PackMember);
```

No class explosion. No diamond inheritance. Just data flowing in and out of entities at runtime.

---

## Memory Layout Strategies: AoS, SoA, and Everything Between

There isn't one "correct" memory layout. Each approach has trade-offs, and understanding them is crucial for optimization.

### Array of Structs (AoS)

The most intuitive layout stores complete components contiguously:

```
AoS Layout - Components stored together:

Entity 0: [Position{x,y,z}][Velocity{x,y,z}][Health{cur,max}]
Entity 1: [Position{x,y,z}][Velocity{x,y,z}][Health{cur,max}]
Entity 2: [Position{x,y,z}][Velocity{x,y,z}][Health{cur,max}]
...
```

This is what I started with in my engine. The archetype stores entities as contiguous blocks:

**Pros:**
- Simple to implement
- Good cache locality when accessing all components of an entity
- Natural fit for operations like "serialize entity" or "clone entity"

**Cons:**
- Wastes cache when a system only needs one component type
- Harder to vectorize (SIMD) because data isn't contiguous per field

### Structure of Arrays - Component Level (SoA Component)

The classic ECS layout separates each *component type* into its own array:

```
SoA Component Level:

Positions:  [Pos0, Pos1, Pos2, Pos3, ...]  => All Position components
Velocities: [Vel0, Vel1, Vel2, Vel3, ...]  => All Velocity components
Health:     [HP0,  HP1,  HP2,  HP3,  ...]  => All Health components
```

Where each Position is still `{x, y, z}` stored together.

**Pros:**
- Excellent cache usage when iterating single component types
- Good for systems that touch few components
- Enables some vectorization

**Cons:**
- Still not optimal for SIMD on individual fields
- Multiple cache lines loaded when accessing a single `Position`

### Structure of Arrays - Field Level (SoA Field)

This is what I call "field level SoA" separating not just components, but individual *fields*:

```
SoA Field Level:

Position_X: [x0, x1, x2, x3, x4, x5, x6, x7, ...]  => Just X coordinates
Position_Y: [y0, y1, y2, y3, y4, y5, y6, y7, ...]  => Just Y coordinates  
Position_Z: [z0, z1, z2, z3, z4, z5, z6, z7, ...]  => Just Z coordinates

Velocity_X: [vx0, vx1, vx2, vx3, ...]
Velocity_Y: [vy0, vy1, vy2, vy3, ...]
Velocity_Z: [vz0, vz1, vz2, vz3, ...]
```

**Pros:**
- Perfect for SIMD vectorization
- Optimal cache usage for field-specific operations
- Auto-vectorization by the compiler

**Cons:**
- More complex bookkeeping
- Accessing a "complete" component requires gathering from multiple arrays
- Higher overhead for entity-centric operations

### Which Should You Use?

The honest answer: **it depends on your workload**.

| Access Pattern | Best Layout |
|----------------|-------------|
| "Process all entities with Position and Velocity" | SoA Component or Field |
| "Update just the X coordinate of all positions" | SoA Field Level |
| "Clone entity 42 to entity 43" | AoS |
| "Serialize an entity to disk" | AoS |
| "SIMD-heavy physics simulation" | SoA Field Level |
| "Entity lookups by ID are frequent" | AoS with spatial indexing |

**My approach**: I implemented SoA Field Level for hot paths (movement, physics, rendering transforms) while keeping the option for SoA Component access when needed. A hybrid approach is likely optimal for real games. My approach may possibly change in the future.

The beauty (and nightmare) of Rust is that you can abstract over this. My `#[derive(SoAComponent)]` procedural macro generates both field-level slices and component references:

```rust
#[derive(SoAComponent)]
struct Position { x: f32, y: f32, z: f32 }

// Generated: PositionRefMut, PositionSlicesMut, etc.
// Can access as &mut Position OR as (&mut [f32], &mut [f32], &mut [f32])
```

If you are interested in procedural macros, you can check this course: https://github.com/jonhoo/proc-macro-workshop?tab=readme-ov-file#suggested-prerequisites

---

## SIMD in Practice: Why Field-Level SoA Matters

Let's see why field-level storage enables dramatic speedups.

### Component-Level Iteration

```rust
// SoA Component Level - Position is still {x, y, z}
fn movement_component_level(positions: &mut [Position], velocities: &[Velocity], dt: f32) {
    for i in 0..positions.len() {
        positions[i].x += velocities[i].x * dt;
        positions[i].y += velocities[i].y * dt;
        positions[i].z += velocities[i].z * dt;
    }
}
```

The compiler *might* vectorize this, but it's tricky. The data layout is:
```
[x0,y0,z0, x1,y1,z1, x2,y2,z2, ...]
```

To use SIMD, the compiler would need to do gather (reading several values from different memory locations into one SIMD register) / scatter (writing SIMD results back to those different locations) operations, loading non-contiguous memory into vector registers. This kills performance.

### Field-Level Iteration

```rust
// SoA Field Level - each field is a separate array
fn movement_field_level(
    xs: &mut [f32], ys: &mut [f32], zs: &mut [f32],
    vxs: &[f32], vys: &[f32], vzs: &[f32],
    dt: f32
) {
    for i in 0..xs.len() {
        xs[i] += vxs[i] * dt;
        ys[i] += vys[i] * dt;
        zs[i] += vzs[i] * dt;
    }
}
```

Data layout:
```
xs:  [x0, x1, x2, x3, x4, x5, x6, x7, ...]
vxs: [vx0, vx1, vx2, vx3, vx4, vx5, vx6, vx7, ...]
```

Now the compiler can emit AVX2 instructions that process **8 floats simultaneously**:

```asm
; Pseudo-assembly for AVX2 vectorized loop
vmovups ymm0, [xs + i*4]       ; Load 8 x values
vmovups ymm1, [vxs + i*4]      ; Load 8 vx values
vfmadd231ps ymm0, ymm1, ymm2   ; xs += vxs * dt (8 at once!)
vmovups [xs + i*4], ymm0       ; Store 8 results
```

<iframe width="800px" height="200px" src="https://godbolt.org/e#g:!((g:!((g:!((h:codeEditor,i:(filename:'1',fontScale:14,fontUsePx:'0',j:1,lang:rust,selection:(endColumn:2,endLineNumber:12,positionColumn:2,positionLineNumber:12,selectionStartColumn:2,selectionStartLineNumber:12,startColumn:2,startLineNumber:12),source:'%23%5Bunsafe(no_mangle)%5D%0Afn+movement_field_level(%0A++++xs:+%26mut+%5Bf32%5D,+ys:+%26mut+%5Bf32%5D,+zs:+%26mut+%5Bf32%5D,%0A++++vxs:+%26%5Bf32%5D,+vys:+%26%5Bf32%5D,+vzs:+%26%5Bf32%5D,%0A++++dt:+f32%0A)+%7B%0A++++for+i+in+0..xs.len()+%7B%0A++++++++xs%5Bi%5D+%2B%3D+vxs%5Bi%5D+*+dt%3B%0A++++++++ys%5Bi%5D+%2B%3D+vys%5Bi%5D+*+dt%3B%0A++++++++zs%5Bi%5D+%2B%3D+vzs%5Bi%5D+*+dt%3B%0A++++%7D%0A%7D'),l:'5',n:'0',o:'Rust+source+%231',t:'0')),k:50,l:'4',n:'0',o:'',s:0,t:'0'),(g:!((h:compiler,i:(compiler:r1910,filters:(b:'0',binary:'1',binaryObject:'1',commentOnly:'0',debugCalls:'1',demangle:'0',directives:'0',execute:'1',intel:'0',libraryCode:'0',trim:'1',verboseDemangling:'0'),flagsViewOpen:'1',fontScale:14,fontUsePx:'0',j:2,lang:rust,libs:!(),options:'--target%3Dx86_64-unknown-linux-gnu+-C+opt-level%3D3+-C+overflow-checks%3Doff+-C+target-cpu%3Dnative+-C+target-feature%3D%2Bavx2,%2Bfma',overrides:!((name:edition,value:'2024')),selection:(endColumn:1,endLineNumber:1,positionColumn:1,positionLineNumber:1,selectionStartColumn:1,selectionStartLineNumber:1,startColumn:1,startLineNumber:1),source:1),l:'5',n:'0',o:'+rustc+1.91.0+(Editor+%231)',t:'0')),k:50,l:'4',n:'0',o:'',s:0,t:'0')),l:'2',n:'0',o:'',t:'0')),version:4"></iframe>

On my machine, this pattern runs **4-6x faster** than the component-level version for large entity counts.

### The API in My ECS

```rust
// High-level API that hides the complexity
for ((mut pos, vel), len) in world.query_chunks_mut::<(Position, Velocity)>() {
    // pos.x, pos.y, pos.z are &mut [f32] slices
    // vel.x, vel.y, vel.z are &[f32] slices
    for i in 0..len {
        pos.x[i] += vel.x[i] * dt;
        pos.y[i] += vel.y[i] * dt;
        pos.z[i] += vel.z[i] * dt;
    }
}
```

Type-safe and SIMD-friendly. The macro generates all the boilerplate. The ergonomics are not perfect, and this is one of the flaws of this architecture with Rust. I hope to find a way to improve this in the future.

---

## Why Rust is Ideal for ECS

Now let's talk about why Rust isn't just *a* good choice—it's arguably the *best* choice for building a high-performance ECS.

### 1. Zero-Cost Abstractions

Rust's generics are monomorphized at compile time:

```rust
fn process<T: Component>(data: &mut [T]) {
    for item in data.iter_mut() {
        // ...
    }
}
```

This compiles to specialized machine code for each concrete type. No virtual dispatch, no boxing, no runtime type checks. The abstraction costs **literally zero cycles**.

Compare this to:
- **Java/C#**: Runtime generics with type erasure and boxing overhead
- **Python**: Every operation involves type lookups
- **C++ templates**: Similar zero-cost, but with slower compile times and worse error messages

In short: with Rust, you can write high-level, safe abstractions that compile down to raw, efficient machine code, just like if you had written it manually.

### 2. Precise Memory Layout Control

Rust gives you exact control over how data is arranged in memory:

```rust
#[repr(C)]  // Predictable C-compatible layout
struct Position {
    x: f32,
    y: f32,
    z: f32,
}

#[repr(C, align(64))]  // Cache-line aligned for optimal prefetching
struct CacheAlignedData {
    // ...
}
```

You can verify layouts at compile time:

```rust
const _: () = assert!(std::mem::size_of::<Position>() == 12);
const _: () = assert!(std::mem::align_of::<Position>() == 4);
```

### 3. Ownership Prevents Data Races at Compile Time

ECS parallelism is notoriously tricky. Multiple systems might want to access overlapping components. In C++, you'd need:
- Manual mutex management
- Runtime conflict detection
- Prayer

Rust's borrow checker catches conflicts at **compile time**:

```rust
// This won't compile - and that's GOOD
fn bad_parallel(world: &mut World) {
    let positions = world.query_mut::<Position>();     // Mutable borrow
    let positions2 = world.query_mut::<Position>();    // Error: already borrowed!
}
```

For legitimate parallel access, the type system proves safety:

```rust
// System A writes Position, reads Velocity
// System B writes Health, reads Damage
// No overlap → can run in parallel with ZERO synchronization overhead!
```

My scheduler automatically detects non-conflicting systems and runs them concurrently with compile-time safety guarantees.

### 4. The Unsafe Escape Hatch

Sometimes you need to break the rules for performance. Rust lets you do this *explicitly*:

```rust
pub struct SendPtr<T>(*mut T);

// We manually verify thread-safety guarantees
unsafe impl<T> Send for SendPtr<T> {}
unsafe impl<T> Sync for SendPtr<T> {}

impl<T> SendPtr<T> {
    /// Create a new SendPtr.
    /// 
    /// # Safety
    /// Caller must ensure:
    /// - The pointer remains valid for the lifetime of parallel execution
    /// - No data races occur (non-overlapping access)
    pub unsafe fn new(ptr: *mut T) -> Self {
        SendPtr(ptr)
    }
}
```

The `unsafe` keyword is documentation and a contract: "I've verified this is correct." You get C-level performance where needed while keeping the rest of your codebase safe.

### 5. Excellent Tooling for Performance Work

- **Criterion**: Statistical benchmarking with regression detection
- **cargo-flamegraph**: CPU profiling visualization
- **cargo-asm**: Inspect generated assembly
- **miri**: Detect undefined behavior in unsafe code

When optimizing my ECS, I verified that my abstractions were truly zero-cost by checking the assembly output.
You can also verified it with this online tool : https://godbolt.org/

---

## The Honest Downsides of Rust for Game Engines

I love Rust, but let me be honest about the challenges I've faced building this engine.

### 1. The Borrow Checker Fights You (Sometimes Unfairly)

Rust’s borrow checker is a powerful tool for memory safety, but it can sometimes get in the way of natural ECS patterns. In many ECS systems, you want to iterate over entities and read their components while conditionally creating or modifying other entities. Logically, this is safe, but Rust sees it differently:

```rust
// This is logically safe but won't compile
fn update_system(world: &mut World) {
    for (entity, pos) in world.query::<&Position>() {
        if should_spawn_particle(pos) {
            // ERROR: can't mutate world while iterating!
            world.spawn(Particle::at(*pos));
        }
    }
}
```

Rust prevents this because you are still holding an immutable borrow of the positions while trying to mutably borrow the world to spawn a new particle. Even though you know there’s no overlap, Rust’s rules are conservative: you cannot mutate the same data structure while iterating over it.

The common workaround: command buffers
To satisfy the borrow checker, ECS libraries often use deferred operations:

```rust
fn update_system(world: &mut World) {
    let mut commands = Vec::new();
    
    for (entity, pos) in world.query::<&Position>() {
        if should_spawn_particle(pos) {
            commands.push(SpawnCommand::Particle(*pos));
        }
    }
    
    // Apply after iteration
    for cmd in commands {
        cmd.execute(world);
    }
}
```

- Here, we collect the changes in a buffer and apply them after the iteration is done.
- This is safe and compiles, but it introduces extra complexity and indirection.
- You now need to manage a separate system for executing commands and ensure ordering is correct.

### 2. Self-Referential Structures Are Painful

Many engine patterns involve self-references. Want an entity to store a reference to another entity's component? Prepare for lifetime gymnastics or `unsafe`.

```rust
// This natural pattern is very hard in safe Rust
struct PhysicsJoint {
    body_a: &'??? RigidBody,  // What lifetime goes here?
    body_b: &'??? RigidBody,
}
```

- Rust requires explicit lifetimes for every reference.
- In a dynamic ECS, you often don’t know how long a referenced entity will live, or entities may move around in memory.
- Solving this in safe Rust is nearly impossible without indirection or unsafe code.

The typical solution is to use indices or handles instead of direct references:
```
struct PhysicsJoint {
    body_a: EntityId,
    body_b: EntityId,
}
```

This works cleanly with Rust’s borrow checker but it’s less ergonomic, since you have to look up the actual components in the world whenever you access them.

### 3. Compile Times

I'm not there yet, but I know that for larger engines, the compilation time is excessively long. It can balloon to minutes. Iteration speed matters for game development.

Mitigations:
- Generous use of `#[inline(never)]` during development
- Workspace splitting
- `cargo check` instead of full builds

---

## ECS vs OOP: A Balanced Comparison

Let's be fair. ECS isn't universally superior—it's a trade-off.

### Where ECS Excels

- **Batch processing** : Cache-friendly iteration over thousands of entities 
- **Flexibility** : Runtime composition, no rigid hierarchies 
- **Parallelism** : Natural data separation enables safe concurrency 
- **SIMD** : Contiguous data enables vectorization 
- **Decoupling** : Systems are independent and testable 

### Where OOP Might Be Simpler

- **Small entity counts** : Less architectural overhead 
- **Complex state machines** : Encapsulation can be clearer 
- **Learning curve** : More familiar to most developers 

---

## What We'll Build in This Series

Over the coming articles, we'll implement a complete ECS featuring:

1. **Entity management** with ID recycling and generation tracking
2. **Archetype-based storage** for efficient component grouping
3. **Multiple storage strategies** (AoS, SoA Component, SoA Field)
4. **Type-safe queries** with zero runtime overhead
5. **Automatic parallelization** with conflict detection
6. **Custom thread pool** with scoped execution
7. **Procedural macros** for zero-boilerplate components

Here's a preview of the final API:

```rust
// Define components with automatic SoA storage
#[derive(SoAComponent)]
struct Position { x: f32, y: f32, z: f32 }

#[derive(SoAComponent)]  
struct Velocity { x: f32, y: f32, z: f32 }

fn main() {
    let mut world = SoAWorld::new();
    
    // Spawn 100,000 entities
    for i in 0..100_000 {
        world.spawn((
            Position { x: i as f32, y: 0.0, z: 0.0 },
            Velocity { x: 1.0, y: 0.0, z: 0.0 },
        ));
    }
    
    // SIMD-friendly iteration
    for ((mut pos, vel), len) in world.query_chunks_mut::<(Position, Velocity)>() {
        for i in 0..len {
            pos.x[i] += vel.x[i];
            pos.y[i] += vel.y[i];
            pos.z[i] += vel.z[i];
        }
    }
    
    // Parallel systems with automatic conflict detection
    let mut scheduler = Scheduler::new()
        .add_system(MovementSystem)
        .add_system(PhysicsSystem)
        .add_system(RenderPrepSystem)
        .auto_detect_conflicts()
        .build()
        .unwrap();
    
    scheduler.run_frame(&mut world);
}
```

---

## Conclusion

ECS represents a fundamental shift in how we think about game architecture. Instead of modeling the world as a hierarchy of *things*, we model it as a database of *properties*. This shift unlocks:

- **Performance**: Cache-friendly, vectorizable data access
- **Flexibility**: Runtime composition without inheritance
- **Parallelism**: Natural data separation for multi-threading
- **Maintainability**: Decoupled systems that can be tested in isolation

Rust amplifies these benefits with zero-cost abstractions, compile-time safety, and precise memory control. It's not the easiest language, and it fights you sometimes, but for performance-critical systems like game engines, the investment pays dividends.

The trade-offs are real: compile times, learning curve, and some ergonomic friction. But for someone who loves optimization and wants to understand every layer of their engine, there's no better choice.

In the next article, we'll start building. We'll implement the `Entity` struct, handle ID recycling, and explore why that `generation` field is crucial for memory safety.

---

*Next article: "Entity Management: IDs, Generations, and the Art of Recycling"*

---

### Further Reading

- [Data-Oriented Design](https://www.dataorienteddesign.com/dodbook/) - Richard Fabian's free book
- [CppCon 2014: Mike Acton "Data-Oriented Design and C++"](https://www.youtube.com/watch?v=rX0ItVEVjHc) - The talk that started a revolution
- [Catherine West: "Using Rust for Game Development"](https://www.youtube.com/watch?v=aKLntZcp27M) - RustConf 2018 on ECS in Rust
- [Bevy Engine](https://bevyengine.org/) - A popular Rust ECS game engine
- [Flecs](https://github.com/SanderMertens/flecs) - High-performance C ECS with excellent documentation
