---
title: ECS #2 · GENERATIONAL IDS
sub: Safe entity recycling in Rust
year: 2026
---
*How do you identify an entity ? A subject that can be useful in contexts other than an ECS* ! *This is the second article in a series about building a high performance Entity Component System from scratch in Rust.*
## Quick Reminder: What is an Entity?
In our ECS architecture, an **Entity** is the simplest possible thing: just a unique identifier. Nothing more.
Unlike Object Oriented Programming where a `Player` object contains its data (health, position, inventory) and its behavior (move, attack, die), an Entity in ECS is just a number that says "this thing exists."
The Entity doesn’t *contain* anything. Instead, it’s a **key** that links components together:
```rust
Entity 42:
    -> Position component: { x: 10.0, y: 0.0, z: 5.0 }
    -> Health component: { current: 100, max: 100 }
    -> PlayerController component: { ... }
```
Think of it like a database primary key. The number itself has no meaning, it just uniquely identifies a “row” of data spread across multiple tables (component storages).
This separation is what gives ECS its power: systems can process all `Position` components in a tight loop without caring whether they belong to players, enemies, or bullets.
Now, the question becomes: **how do we generate and manage these identifiers?**
## Starting Simple: The Naive Approach
et’s build entity management from scratch, starting with the simplest possible implementation and improving it as we discover problems.
### Version 0: Just a Counter
```rust
type Entity = u32;

pub struct World {
    next_id: u32,
    // ... component storage (we'll cover this in future articles)
}

impl World {
    pub fn new() -> Self {
        Self { next_id: 0 }
    }

    pub fn spawn(&mut self) -> Entity {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub fn delete(&mut self, entity: Entity) {
        // Remove components for this entity
        // But what happens to the ID?
    }
}
```
This works! Entities get IDs 0, 1, 2, 3… Simple and fast. But there’s a critical flaw hiding here. Let me show you.
## The Dangling Reference Problem
Imagine a simple game scenario:
```rust
fn game_loop(world: &mut World) {
    // Frame 1: Spawn an enemy, player stores reference to target
    let enemy = world.spawn();  // enemy = 42
    let mut player_target: Option<Entity> = Some(enemy);

    // Frame 2: Enemy dies
    world.delete(enemy);

    // Frame 3: Spawn a health pickup
    let pickup = world.spawn();  // pickup = 43

    // Frame 4: Player attacks their "target"
    if let Some(target) = player_target {
        world.deal_damage(target, 50);  // What happens here?
    }
}
```
With our naive implementation, `pickup` gets ID 43. The player still targets ID 42, which no longer exists. We'd need to check if the entity exists before every operation. Annoying, but manageable. But what if we want to **recycle IDs**?
### Why Recycle IDs?
You might think: “Why bother recycling? Just use `u64` and never run out!" A `u64` can hold 18 quintillion values. At 1 million spawns per second, it would take more than 584,000 years to overflow. Problem solved, right?
**Wrong.** The problem isn’t running out of numbers, it’s **memory**. In my ECS, I use entity IDs as **array indices** for fast O(1) lookups:
```rust
struct World {
    // Index = entity ID, Value = data for that entity
    generations: Vec<u32>,            // generations[entity_id]
    locations: Vec<Option<Location>>, // locations[entity_id]
    // ... more arrays indexed by entity ID
}
```
Without recycling, if your game spawns entity #1,000,000, your arrays need **1 million slots** even if only 100 entities are alive at any moment.
Without recycling (after 1 million spawns, 100 alive):
- generations: [0, 0, 0, 0, 0, …] -> 1,000,000 slots = 4 MB
- locations: [None, None, None, None, …] -> 1,000,000 slots = 24 MB -> 99.99% wasted
With recycling (max 100 alive at once):
- generations: [3, 7, 2, 5, …] -> 100 slots = 400 bytes
- locations: [Some, Some, …] -> 100 slots = 2.4 KB
A bullet-hell game spawning 10,000 projectiles per second would consume gigabytes of RAM in minutes without recycling. Not because we ran out of IDs, but because our arrays grew unbounded.
**Recycling keeps IDs compact.** If you never have more than N entities alive simultaneously, your arrays stay around size N.
So let’s add recycling:
```rust
pub struct World {
    next_id: u32,
    free_ids: Vec<u32>,  // Pool of reusable IDs
}

impl World {
    pub fn spawn(&mut self) -> Entity {
        if let Some(id) = self.free_ids.pop() {
            return id;
        }

        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub fn delete(&mut self, entity: Entity) {
        // Return ID to the pool
        self.free_ids.push(entity);
    }
}
```
Now we have a **real problem**:
```rust
// Frame 1: Spawn enemy
let enemy = world.spawn();  // enemy = 42
player.target = Some(enemy);

// Frame 2: Enemy dies
world.delete(enemy);  // 42 goes into free_ids

// Frame 3: Spawn pickup -> Reuse ID 42
let pickup = world.spawn();  // pickup = 42 (recycled)

// Frame 4: Player attacks... the health pickup
if let Some(target) = player.target {  // target = 42
    world.deal_damage(target, 50);  // Oops! Damages the pickup!
}
```
The player is holding `Entity(42)`, but that ID now refers to a completely different entity. This is the **ABA problem**. The ID was A (enemy), became nothing (deleted), then became A again (same numeric value, different logical entity).
::media{src=medium/ecs-entity-management/01.webp label="Player attack the health pickup" fit=contain background=off height=300}
### This Happens Constantly in Real Games
This isn’t a contrived example. Real games store entity references everywhere:
- **AI systems**: targets, allies, patrol waypoints, flee-from entities
- **Physics**: joints connecting two bodies, collision pairs
- **Scene graphs**: parent-child relationships
- **Attachments**: particles attached to characters, weapons in hands
- **Quests**: objective entities, NPCs to talk to
- **UI**: health bars bound to world entities
Every one of these is a potential dangling reference waiting to corrupt your game state.
## Solution: Generational IDs
The fix is elegant: pair each ID with a **generation counter**.
```rust
#[derive(Copy, Clone, Eq, PartialEq, Hash, Debug)]
pub struct Entity {
    pub id: u32,         // The slot number (recycled)
    pub generation: u32, // Incremented each time slot is reused
}
```
Here’s the key insight:
1. When we create entity #42 for the first time → `Entity { id: 42, generation: 0 }`
2. When we delete it -> we **increment** the generation for slot 42
3. When we reuse slot 42 -> new entity gets `Entity { id: 42, generation: 1 }`
4. Old reference `{ id: 42, generation: 0 }` != new entity `{ id: 42, generation: 1 }`
The player still holds: Entity { id: 42, generation: 0 } The new pickup is: Entity { id: 42, generation: 1 } These are not equal. The stale reference is now detectable!
Let’s implement this properly.
### Implementation v1: Basic Generations
```rust
#[derive(Copy, Clone, Eq, PartialEq, Hash, Debug)]
pub struct Entity {
    pub id: u32,
    pub generation: u32,
}

impl Entity {
    pub fn new(id: u32, generation: u32) -> Self {
        Entity { id, generation }
    }
}

pub struct World {
    next_id: u32,

    /// Current generation for each ID slot
    /// Index = entity ID, Value = current generation
    generations: Vec<u32>,

    /// Pool of IDs available for reuse
    free_ids: Vec<u32>,
}

impl World {
    pub fn new() -> Self {
        Self {
            next_id: 0,
            generations: Vec::new(),
            free_ids: Vec::new(),
        }
    }

    pub fn spawn(&mut self) -> Entity {
        let id = if let Some(recycled) = self.free_ids.pop() {
            recycled
        } else {
            let fresh = self.next_id;
            self.next_id += 1;
            fresh
        };

        // Ensure generations array is large enough
        if (id as usize) >= self.generations.len() {
            self.generations.resize(id as usize + 1, 0);
        }

        // Create entity with current generation for this slot
        let generation = self.generations[id as usize];
        Entity::new(id, generation)
    }

    pub fn delete(&mut self, entity: Entity) -> bool {
        let id = entity.id as usize;

        // Bounds check
        if id >= self.generations.len() {
            return false;
        }

        // Verify generation matches
        // This detects attempts to delete already deleted entities
        if self.generations[id] != entity.generation {
            return false;  // Stale reference -> entity already deleted
        }

        // Increment generation -> this invalidates all old references
        self.generations[id] = self.generations[id].wrapping_add(1);

        // Return ID to the pool for reuse
        self.free_ids.push(entity.id);

        true
    }
}
```
::media{src=medium/ecs-entity-management/02.webp label="Generation" fit=contain background=off height=300}
We’ve solved the ABA problem. But there’s still room for improvement.
## Optimization: FIFO vs LIFO Recycling
Look at our current `free_ids`:
```rust
free_ids: Vec<u32>

// Vec::push() adds to the END
// Vec::pop() removes from the END
// This is LIFO -> Last In, First Out
```
With LIFO recycling:
```rust
// Spawn entities 0, 1, 2
world.spawn();  // id = 0
world.spawn();  // id = 1
world.spawn();  // id = 2

// Delete in order: 0, 1, 2
world.delete(e0);  // free_ids = [0]
world.delete(e1);  // free_ids = [0, 1]
world.delete(e2);  // free_ids = [0, 1, 2]

// Spawn 3 new entities
world.spawn();  // pops 2 — just deleted!
world.spawn();  // pops 1 — just deleted!
world.spawn();  // pops 0 — deleted longest ago
```
The most recently deleted IDs are reused immediately. This **maximizes** the chance that someone is still holding a stale reference.
### FIFO: First In, First Out
```rust
use std::collections::VecDeque;

pub struct World {
    next_id: u32,
    generations: Vec<u32>,
    free_ids: VecDeque<u32>,
}

impl World {
    pub fn spawn(&mut self) -> Entity {
        let id = if let Some(recycled) = self.free_ids.pop_front() {  // Take from front
            recycled
        } else {
            let fresh = self.next_id;
            self.next_id += 1;
            fresh
        };
        // ...
    }

    pub fn delete(&mut self, entity: Entity) -> bool {
        // ...
        self.free_ids.push_back(entity.id);  // Add to back
        true
    }
}
```
Now with FIFO:
```rust
// Delete in order: 0, 1, 2
world.delete(e0);  // free_ids = [0]
world.delete(e1);  // free_ids = [0, 1]
world.delete(e2);  // free_ids = [0, 1, 2]

// Spawn 3 new entities
world.spawn();  // pops 0 — deleted longest ago (GOOD!)
world.spawn();  // pops 1
world.spawn();  // pops 2 — just deleted, reused last
```
FIFO ensures **maximum “cooling time”** between deletion and reuse. The longer an ID sits in the queue, the more likely stale references have been cleared by game logic. It gives the rest of the game the maximum amount of time to realize the entity is dead before we dare to reuse this slot.
## The Complete Entity Implementation
Here’s our final, production ready entity management:
```rust
use std::collections::VecDeque;
use std::hash::{Hash, Hasher};

/// A unique identifier for an entity in the world.
///
/// The combination of id and generation ensures that even when
/// IDs are recycled, old references can be detected as stale.
///
/// # Size
/// 8 bytes total (two u32 values), trivially copyable.
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub struct Entity {
    /// The index/slot number. Gets recycled when entities are deleted.
    pub id: u32,
    /// Incremented each time this slot is reused. Prevents ABA problem.
    pub generation: u32,
}

impl Entity {
    #[inline]
    pub fn new(id: u32, generation: u32) -> Self {
        Entity { id, generation }
    }
}

impl Hash for Entity {
    fn hash<H: Hasher>(&self, state: &mut H) {
        // Both fields must contribute to hash for HashMap usage
        state.write_u32(self.id);
        state.write_u32(self.generation);
    }
}

pub struct World {
    /// Next fresh ID to assign if no recycled IDs available
    next_id: u32,

    /// Current generation for each ID slot.
    /// Index = entity ID, Value = current generation for that slot.
    generations: Vec<u32>,

    /// Queue of IDs available for reuse (FIFO for maximum cooling time)
    free_ids: VecDeque<u32>,

    /// Number of currently alive entities
    alive_count: usize,
}

impl World {
    pub fn new() -> Self {
        Self {
            next_id: 0,
            generations: Vec::new(),
            free_ids: VecDeque::new(),
            alive_count: 0,
        }
    }

    /// Spawn a new entity and return its handle.
    ///
    /// Prefers recycled IDs over fresh IDs.
    pub fn spawn(&mut self) -> Entity {
        let id = if let Some(recycled) = self.free_ids.pop_front() {
            recycled
        } else {
            let fresh = self.next_id;
            self.next_id += 1;
            fresh
        };

        // Ensure generations array can hold this ID
        if (id as usize) >= self.generations.len() {
            self.generations.resize(id as usize + 1, 0);
        }

        let generation = self.generations[id as usize];
        self.alive_count += 1;

        Entity::new(id, generation)
    }

    /// Delete an entity, making its ID available for reuse.
    ///
    /// Returns true if the entity was alive and is now destroyed.
    /// Returns false if the entity was already dead (stale reference).
    pub fn delete(&mut self, entity: Entity) -> bool {
        let id = entity.id as usize;

        // Bounds check
        if id >= self.generations.len() {
            return false;
        }

        // Verify this entity is still alive (generation matches)
        if self.generations[id] != entity.generation {
            return false; // Stale reference
        }

        // Increment generation -> invalidates all references to this slot
        self.generations[id] = self.generations[id].wrapping_add(1);

        // Return ID to recycling queue
        self.free_ids.push_back(entity.id);
        self.alive_count -= 1;

        true
    }

    /// Check if an entity handle still refers to a living entity.
    #[inline]
    pub fn is_alive(&self, entity: Entity) -> bool {
        let id = entity.id as usize;

        id < self.generations.len()
            && self.generations[id] == entity.generation
    }
}
```
### Entities recycling example:
Try entities recycling with this interface
::embed{provider=iframe src="https://codepen.io/Leader_/embed/preview/OPXaRMZ?default-tabs=css%2Cresult&height=600&host=https%3A%2F%2Fcodepen.io&slug-hash=OPXaRMZ" title="Interactive CodePen" height=300}
## Why These Trait Implementations Matter
### `Copy` and `Clone:`
```rust
#[derive(Copy, Clone, ...)]
pub struct Entity { ... }
```
With two integers, entities are just 8 bytes. They should be trivially copyable like `i32` or `f64`. No heap allocation, no reference counting, just raw data that can be memcpy.
```rust
let e1 = world.spawn();
let e2 = e1;  // Copy, not move!
// Both e1 and e2 are valid
```
### `Eq` and `PartialEq:`
```rust
#[derive(Eq, PartialEq, ...)]
```
Two entities are equal **only if both ID and generation match**. This is the core of stale reference detection:
```rust
let enemy = world.spawn();     // { id: 42, generation: 0 }
world.delete(enemy);
let pickup = world.spawn();    // { id: 42, generation: 1 }

assert_ne!(enemy, pickup);     // Different generations!
```
### Hash:
```rust
impl Hash for Entity {
    fn hash<H: Hasher>(&self, state: &mut H) {
        state.write_u32(self.id);
        state.write_u32(self.generation);
    }
}
```
Entities are often used as keys in `HashMap<Entity, T>` for sparse component storage or caching. **Both fields must contribute to the hash**. Otherwise `{ id: 42, gen: 0 }` and `{ id: 42, gen: 1 }` would hash to the same bucket, causing incorrect lookups.
### `Debug:`
Essential for debugging. You want to see `Entity { id: 42, generation: 3 }` in your logs, not some opaque memory address.
## Performance Analysis
::media{src=medium/ecs-entity-management/03.webp label="Article illustration" fit=contain background=off height=300}
::note
The O(1) Amortized means it is fast 99% of the time, but you occasionally pay a heavy “tax” to resize the storage. In a game engine, this tax manifests as a lag spike. This is why pre allocating memory or batch spawning is critical to avoid stuttering during gameplay.
::
### Memory Usage
For a game with `N` entity slots ever used:
::media{src=medium/ecs-entity-management/04.webp label="Article illustration" fit=contain background=off height=300}
This is minimal overhead for the safety it provides.
## Common Pitfalls
### 1. Storing Raw IDs Instead of Entities
```rust
// BAD: Loses generation, can't detect stale references
struct AIController {
    target_id: u32,  // Just the ID!
}

// GOOD: Full entity with generation
struct AIController {
    target: Option<Entity>,
}
```
### 2. Forgetting to Validate Before Access
```rust
// BAD: Panics or corrupts if entity was deleted
fn damage_target(world: &World, target: Entity, amount: f32) {
    let health = world.get_component::<Health>(target).unwrap(); // 💥
}

// GOOD: Handle stale references gracefully
fn damage_target(world: &World, target: Entity, amount: f32) -> bool {
    if !world.is_alive(target) {
        return false;
    }

    true
}
```
### 3. Not Handling Double Delete
```rust
// BAD: Might cause logic errors
fn cleanup(world: &mut World, entities: &[Entity]) {
    for &e in entities {
        world.delete(e); // What if same entity appears twice?
    }
}

// GOOD: Check return value
fn cleanup(world: &mut World, entities: &[Entity]) {
    for &e in entities {
        if world.delete(e) {
            println!("Deleted {:?}", e);
        }
    }
}
```
## What’s Missing? The Eternal O(n) Problem
We now have robust entity identification, but there’s a critical piece missing: **how do we find an entity’s components?**
This is actually one of the most fundamental problems in programming and one of the main reasons ECS architecture exists.
### The Problem: Linear Search Everywhere
Think about how many times you’ve written code like this:
```rust
// Find a user by ID
fn find_user(users: &[User], id: u64) -> Option<&User> {
    for user in users {
        if user.id == id {
            return Some(user);
        }
    }
    None
}

// Find an item in inventory
fn find_item(inventory: &[Item], name: &str) -> Option<&Item> {
    inventory.iter().find(|item| item.name == name)
}

// Find an enemy to attack
fn find_target(enemies: &[Enemy], target_id: u32) -> Option<&Enemy> {
    enemies.iter().find(|e| e.id == target_id)
}
```
Every single one of these is **O(n)**. We scan through the entire collection to find what we want. With 10 items, who cares? With 100,000 entities updated 60 times per second, this becomes catastrophic.
### In Games, This Multiplies Fast
A typical game frame might need to:
```rust
// For each bullet, find its target
for bullet in &bullets {                           // n bullets
    if let Some(target) = find_entity(world, bullet.target_id) {  // O(m) search
        // Deal damage
    }
}
// Total: O(n × m) — potentially millions of operations!

// For each AI, find nearby enemies
for ai in &ai_controllers {                        // n AIs
    for potential_target in &all_entities {        // m entities
        if is_enemy(ai, potential_target) && in_range(ai, potential_target) {
            // React
        }
    }
}
// Total: O(n × m) -> quadratic explosion!
```
This is why naive game engines (like my first one) hit a wall around a few thousand entities. The algorithms are fundamentally O(n²) or worse.
### The Solutions We’ll Build
The entire ECS architecture is designed to eliminate these linear searches:
::media{src=medium/ecs-entity-management/05.webp label="Article illustration" fit=contain background=off height=300}
The key insights we’ll explore:
1. **BlobVec**: Store components contiguously so iteration is cache friendly
2. **HashMap for entity -> location**: Trade memory for O(1) lookup
3. **Archetypes**: Group entities by their component “signature” so we never check entities that don’t match our query
4. **Sorted signatures**: Use binary search instead of linear search for component lookups
Each of these techniques attacks the O(n) problem from a different angle. Combined, they turn an O(n²) game loop into something closer to O(n) and that O(n) iteration happens over cache friendly, contiguous memory.
## The Fundamental Trade-off
There’s no magic here, just the classic **space-time trade-off**:
::note
More memory (indexesn hashmaps, caches) = Faster lookups
Less memory (just arrays) = Slower lookups (linear search)
::
In the next articles, we’ll build these solutions step by step, starting with the most fundamental building block inspired (like many things in this article) by the famous Bevy Engine: **BlobVec**. A way to store any component type in contiguous, cache friendly memory.
## Conclusion
Entity management seems trivial until you need ID recycling. Then the ABA problem bites hard.
The generational index pattern solves this elegantly:
1. **ID + Generation** makes references unique across time
2. **Generation increment on delete** invalidates all old references
3. **FIFO recycling** maximizes time before ID reuse
4. `is_alive()` **check** catches stale references explicitly
This pattern is universal, you’ll find it in Unity DOTS, Flecs, Bevy, and countless custom engines. It's the right solution.
In the next article, we’ll build **BlobVec**: a type erased, cache friendly storage for any component type. It’s the building block that makes everything else possible.
*Next article: “BlobVec: Type-Erased Contiguous Storage”*
## Further Reading
- [Catherine West’s RustConf 2018 Talk](https://www.youtube.com/watch?v=aKLntZcp27M) — ECS architecture in Rust
- [Unity DOTS Entity](https://docs.unity3d.com/Packages/com.unity.entities@1.0/manual/concepts-entities.html) — Same pattern in Unity
