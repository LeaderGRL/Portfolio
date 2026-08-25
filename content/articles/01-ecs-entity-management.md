---
title: ECS #2 · GENERATIONAL IDS
sub: Safe entity recycling in Rust
year: 2026
---

# Entity Management: IDs, Generations, and the Art of Recycling

*This is the second article in a series about building a high-performance Entity Component System from scratch in Rust. In this article, we tackle a deceptively simple question: how do you identify an entity?*

---

## The Deceptively Simple Problem

At first glance, entity identification seems trivial. Just use an integer, right?

```rust
type Entity = u32;

fn spawn(world: &mut World) -> Entity {
    let id = world.next_id;
    world.next_id += 1;
    id
}
```

Simple. Clean. And completely broken for any real game.

Let me show you why.

---

## The Dangling Reference Problem

Imagine a simple game scenario:

```rust
// Frame 1: Spawn an enemy, player stores reference to target
let enemy = world.spawn(Enemy::new());
player.target = Some(enemy);  // enemy has id = 42

// Frame 2: Enemy dies
world.delete(enemy);

// Frame 3: Spawn a health pickup (reuses id = 42)
let pickup = world.spawn(HealthPickup::new());

// Frame 4: Player attacks their "target"
if let Some(target) = player.target {
    world.deal_damage(target, 50);  // Oops! Damages the health pickup!
}
```

The player is still holding `Entity(42)`, but that ID now refers to a completely different entity. This is the **ABA problem**—the ID was A (enemy), became nothing (deleted), then became A again (same numeric value, different entity).

In the best case, you get weird bugs. In the worst case, you corrupt game state in ways that are nearly impossible to debug.

### Why This Happens More Than You'd Think

This isn't a contrived example. Real games constantly store entity references:

- AI systems store targets, allies, patrol points
- Physics joints connect two bodies
- Parent-child hierarchies for scene graphs
- Particle emitters attached to entities
- Quest systems tracking objective entities
- UI elements bound to world entities

Every one of these is a potential dangling reference waiting to happen.

---

## The Generation Solution

The fix is elegant: pair each ID with a **generation counter**.

```rust
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub struct Entity {
    pub id: u32,
    pub generation: u32,
}
```

Here's how it works:

1. When we spawn entity #42 for the first time, it gets `Entity { id: 42, generation: 0 }`
2. When we delete it, we increment the generation: slot 42 now expects generation 1
3. When we reuse slot 42, the new entity gets `Entity { id: 42, generation: 1 }`
4. The old reference `Entity { id: 42, generation: 0 }` no longer matches

```rust
// The player still holds: Entity { id: 42, generation: 0 }
// The new pickup is:      Entity { id: 42, generation: 1 }
// These are NOT equal - the old reference is now detectably stale!
```

Let's implement this properly.

---

## Implementation: The Entity Struct

Here's my actual implementation:

```rust
use std::hash::{Hash, Hasher};

/// A unique identifier for an entity in the world.
/// 
/// The combination of `id` and `generation` ensures that even when
/// IDs are recycled, old references can be detected as stale.
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub struct Entity {
    /// The index/slot number. Gets recycled when entities are deleted.
    pub id: u32,
    /// Incremented each time this slot is reused. Detects stale references.
    pub generation: u32,
}

impl Entity {
    pub fn new(id: u32, generation: u32) -> Self {
        Entity { id, generation }
    }
}

impl Hash for Entity {
    fn hash<H: Hasher>(&self, state: &mut H) {
        // Both fields contribute to the hash for use in HashMaps
        state.write_u32(self.id);
        state.write_u32(self.generation);
    }
}
```

### Why These Traits Matter

**`Copy` and `Clone`**: Entities are just two integers—8 bytes total. They should be trivially copyable. No heap allocation, no reference counting, just raw data.

**`Eq` and `PartialEq`**: Two entities are equal only if *both* id and generation match. This is the core of stale reference detection.

**`Hash`**: Entities are often used as keys in `HashMap<Entity, T>` for sparse data. Both fields must contribute to the hash to avoid collisions between generations.

**`Debug`**: Essential for debugging. You want to see `Entity { id: 42, generation: 3 }` in your logs, not some opaque number.

---

## Implementation: The World's Entity Management

Now let's look at how the World manages entity lifecycles:

```rust
use std::collections::VecDeque;

pub struct World {
    /// The next ID to assign if no recycled IDs are available
    next_id: u32,
    
    /// Generation counter for each ID slot. Index = entity ID.
    generations: Vec<u32>,
    
    /// Queue of IDs available for reuse (FIFO)
    free_ids: VecDeque<u32>,
    
    /// Maps entity ID to its location in storage (for O(1) component access)
    locations: Vec<Option<EntityLocation>>,
    
    /// All currently alive entities (for iteration)
    entities: Vec<Entity>,
    
    // ... component storage, archetypes, etc.
}

#[derive(Copy, Clone, Debug)]
pub struct EntityLocation {
    pub archetype_index: usize,
    pub chunk_index: usize,   // For chunked storage
    pub slot_index: usize,    // Position within chunk/archetype
}
```

### Spawning an Entity

```rust
impl World {
    pub fn spawn(&mut self, components: &[&dyn Component]) -> Entity {
        // Step 1: Get an ID (recycled or fresh)
        let id = if let Some(recycled) = self.free_ids.pop_front() {
            recycled
        } else {
            let fresh = self.next_id;
            self.next_id += 1;
            fresh
        };
        
        // Step 2: Ensure generations array is large enough
        if (id as usize) >= self.generations.len() {
            self.generations.resize(id as usize + 1, 0);
        }
        
        // Step 3: Create entity with current generation
        let generation = self.generations[id as usize];
        let entity = Entity::new(id, generation);
        
        // Step 4: Store components in archetype (covered in future article)
        let location = self.store_components(entity, components);
        
        // Step 5: Track the entity's location
        if (id as usize) >= self.locations.len() {
            self.locations.resize(id as usize + 1, None);
        }
        self.locations[id as usize] = Some(location);
        
        // Step 6: Add to live entities list
        self.entities.push(entity);
        
        entity
    }
}
```

### Deleting an Entity

```rust
impl World {
    pub fn delete(&mut self, entity: Entity) -> bool {
        let id = entity.id as usize;
        
        // Bounds check
        if id >= self.locations.len() {
            return false;
        }
        
        // Check if entity is still alive (location exists)
        let location = match self.locations[id].take() {
            Some(loc) => loc,
            None => return false,  // Already deleted
        };
        
        // Verify generation matches (detect stale references)
        if self.generations[id] != entity.generation {
            return false;  // Stale reference to old entity
        }
        
        // INCREMENT GENERATION - this is the key!
        // Any old references with the previous generation are now invalid
        self.generations[id] = self.generations[id].wrapping_add(1);
        
        // Return ID to the recycling pool
        self.free_ids.push_back(entity.id);
        
        // Remove from component storage (swap-remove for O(1))
        self.remove_from_storage(location);
        
        // Remove from live entities list
        if let Some(pos) = self.entities.iter().position(|&e| e == entity) {
            self.entities.swap_remove(pos);
        }
        
        true
    }
}
```

### Validating an Entity Reference

Sometimes you just want to check if an entity is still alive:

```rust
impl World {
    /// Check if an entity reference is still valid
    pub fn is_alive(&self, entity: Entity) -> bool {
        let id = entity.id as usize;
        
        if id >= self.generations.len() {
            return false;
        }
        
        // Must match current generation AND have a valid location
        self.generations[id] == entity.generation 
            && self.locations[id].is_some()
    }
    
    /// Get an entity's location if it's alive, None if stale/dead
    pub fn get_location(&self, entity: Entity) -> Option<EntityLocation> {
        if self.is_alive(entity) {
            self.locations[entity.id as usize]
        } else {
            None
        }
    }
}
```

---

## Why FIFO Recycling?

You might wonder: why use a `VecDeque` (queue) instead of a `Vec` (stack) for recycled IDs?

### The Problem with LIFO (Stack)

```rust
// Using Vec with push/pop (LIFO - Last In, First Out)
free_ids: Vec<u32>

// Scenario:
spawn() -> id 0
spawn() -> id 1
spawn() -> id 2
delete(id 2)  // free_ids = [2]
delete(id 1)  // free_ids = [2, 1]
delete(id 0)  // free_ids = [2, 1, 0]
spawn() -> pops 0, reuses immediately
spawn() -> pops 1, reuses immediately
spawn() -> pops 2, reuses immediately
```

With LIFO, recently deleted IDs are reused immediately. This maximizes the chance that someone is still holding a reference to that entity.

### The Advantage of FIFO (Queue)

```rust
// Using VecDeque with push_back/pop_front (FIFO - First In, First Out)
free_ids: VecDeque<u32>

// Scenario:
spawn() -> id 0
spawn() -> id 1  
spawn() -> id 2
delete(id 2)  // free_ids = [2]
delete(id 1)  // free_ids = [2, 1]
delete(id 0)  // free_ids = [2, 1, 0]
spawn() -> pops 2 (oldest deletion)
spawn() -> pops 1
spawn() -> pops 0 (most recent deletion, reused last)
```

FIFO ensures maximum "cooling time" between deletion and reuse. The longer an ID sits in the queue, the more likely any stale references have been cleared.

### Does This Actually Matter?

With generations, stale references are always *detectable*. But detection isn't free—you have to actually check. FIFO recycling reduces the frequency of stale reference checks failing, which can matter for:

- AI systems that batch-validate targets
- Physics systems with many constraints
- Any system that caches entity references between frames

It's a small optimization, but it's also free (same performance as LIFO).

---

## The EntityLocation: O(1) Component Access

When you have an entity and want its components, you need to find where they're stored. Without any indexing, you'd have to search through all archetypes:

```rust
// Slow: O(archetypes × entities_per_archetype)
fn get_component<T>(&self, entity: Entity) -> Option<&T> {
    for archetype in &self.archetypes {
        for (i, &e) in archetype.entities.iter().enumerate() {
            if e == entity {
                return Some(archetype.get::<T>(i));
            }
        }
    }
    None
}
```

Instead, we maintain a **sparse array** mapping entity ID → location:

```rust
#[derive(Copy, Clone, Debug)]
pub struct EntityLocation {
    pub archetype_index: usize,  // Which archetype
    pub chunk_index: usize,      // Which chunk within archetype (if chunked)
    pub slot_index: usize,       // Which slot within chunk
}

// In World:
locations: Vec<Option<EntityLocation>>

// O(1) component access
fn get_component<T>(&self, entity: Entity) -> Option<&T> {
    // Validate entity is alive
    let location = self.get_location(entity)?;
    
    // Direct access via indices
    let archetype = &self.archetypes[location.archetype_index];
    let chunk = &archetype.chunks[location.chunk_index];
    Some(chunk.get::<T>(location.slot_index))
}
```

This is a classic space-time tradeoff:
- **Extra memory**: One `EntityLocation` (24 bytes typically) per entity slot ever used
- **Gained speed**: O(1) instead of O(n) for entity → component lookup

For a game with 100,000 entity slots, that's ~2.4 MB. Absolutely worth it.

---

## Handling Swap-Remove: Keeping Locations Consistent

When we delete an entity, we typically use **swap-remove** for O(1) deletion from contiguous storage:

```
Before delete(entity at slot 1):
Slots: [A, B, C, D]  (we want to remove B)

After swap-remove:
Slots: [A, D, C]  (D moved from slot 3 to slot 1)
```

The problem: entity D's location is now wrong! It thinks it's at slot 3, but it's at slot 1.

Here's how we fix it:

```rust
impl World {
    pub fn delete(&mut self, entity: Entity) {
        let id = entity.id as usize;
        let location = self.locations[id].take().unwrap();
        
        // Increment generation, recycle ID...
        self.generations[id] = self.generations[id].wrapping_add(1);
        self.free_ids.push_back(entity.id);
        
        // Perform swap-remove in archetype, get the moved entity (if any)
        let archetype = &mut self.archetypes[location.archetype_index];
        let moved_entity = archetype.swap_remove(location.chunk_index, location.slot_index);
        
        // UPDATE THE MOVED ENTITY'S LOCATION
        if let Some(moved) = moved_entity {
            // The entity that was at the end is now at the deleted slot
            self.locations[moved.id as usize] = Some(EntityLocation {
                archetype_index: location.archetype_index,
                chunk_index: location.chunk_index,
                slot_index: location.slot_index,  // It took the deleted slot
            });
        }
    }
}
```

The archetype's `swap_remove` returns which entity got moved:

```rust
impl Archetype {
    /// Remove entity at given slot by swapping with the last element.
    /// Returns the Entity that was moved into the hole (if any).
    pub fn swap_remove(&mut self, chunk_idx: usize, slot_idx: usize) -> Option<Entity> {
        let chunk = &mut self.chunks[chunk_idx];
        let last_idx = chunk.count - 1;
        
        let moved_entity = if slot_idx != last_idx {
            // We're moving the last entity into this slot
            Some(chunk.entities[last_idx])
        } else {
            // Removing the last element, no swap needed
            None
        };
        
        if moved_entity.is_some() {
            // Copy component data from last slot to removed slot
            unsafe {
                let dst = chunk.ptr.add(slot_idx * chunk.layout.size());
                let src = chunk.ptr.add(last_idx * chunk.layout.size());
                std::ptr::copy_nonoverlapping(src, dst, chunk.layout.size());
            }
            // Swap entity handles
            chunk.entities.swap(slot_idx, last_idx);
        }
        
        // Pop the last element
        chunk.entities.pop();
        chunk.count -= 1;
        self.len -= 1;
        
        moved_entity
    }
}
```

This pattern—swap-remove with location fixup—is fundamental to ECS performance. You'll see it everywhere.

---

## Optimizations and Variations

### Packing ID and Generation Together

Some engines pack both values into a single `u64`:

```rust
#[derive(Copy, Clone, Eq, PartialEq, Hash)]
pub struct Entity(u64);

impl Entity {
    const ID_BITS: u32 = 32;
    const GEN_BITS: u32 = 32;
    const ID_MASK: u64 = (1 << Self::ID_BITS) - 1;
    
    pub fn new(id: u32, generation: u32) -> Self {
        Entity(((generation as u64) << Self::ID_BITS) | (id as u64))
    }
    
    pub fn id(self) -> u32 {
        (self.0 & Self::ID_MASK) as u32
    }
    
    pub fn generation(self) -> u32 {
        (self.0 >> Self::ID_BITS) as u32
    }
}
```

**Pros:**
- Single 64-bit value, efficient to pass around
- Atomic operations possible (for lock-free structures)

**Cons:**
- Bit manipulation on every access
- Less readable in debuggers

I prefer the struct with two fields for clarity, but both approaches work.

### Smaller Generations

32 bits for generation is overkill. At 60 deletions per second, a 32-bit counter overflows after ~2.2 years. You could use:

```rust
pub struct Entity {
    pub id: u32,
    pub generation: u16,  // 65,536 generations per slot
}
// Total: 6 bytes (or 8 with padding)
```

Or even pack into 32 bits total:

```rust
pub struct Entity(u32);

impl Entity {
    // 20 bits for ID (1 million entities max)
    // 12 bits for generation (4096 reuses per slot)
    const ID_BITS: u32 = 20;
    const GEN_BITS: u32 = 12;
    // ...
}
```

The tradeoff is maximum entity count vs. generation safety margin.

### Generational Indices in Other Languages

This pattern exists outside Rust too:

- **C++**: Often called "handle" or "slot map"
- **Unity DOTS**: `Entity` struct with Index and Version
- **Flecs**: `ecs_entity_t` with similar semantics

It's a universal solution to the entity reference problem.

---

## Testing Entity Management

Here are tests that verify correctness:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spawn_assigns_sequential_ids() {
        let mut world = World::new();
        
        let e0 = world.spawn(&[]);
        let e1 = world.spawn(&[]);
        let e2 = world.spawn(&[]);
        
        assert_eq!(e0.id, 0);
        assert_eq!(e1.id, 1);
        assert_eq!(e2.id, 2);
        
        // All should have generation 0
        assert_eq!(e0.generation, 0);
        assert_eq!(e1.generation, 0);
        assert_eq!(e2.generation, 0);
    }

    #[test]
    fn test_delete_increments_generation() {
        let mut world = World::new();
        
        let e0 = world.spawn(&[]);
        assert_eq!(e0.generation, 0);
        
        world.delete(e0);
        
        // Spawn again - should reuse id 0 with generation 1
        let e0_new = world.spawn(&[]);
        assert_eq!(e0_new.id, 0);
        assert_eq!(e0_new.generation, 1);
        
        // Old reference should not equal new entity
        assert_ne!(e0, e0_new);
    }

    #[test]
    fn test_fifo_recycling_order() {
        let mut world = World::new();
        
        let e0 = world.spawn(&[]);
        let e1 = world.spawn(&[]);
        let e2 = world.spawn(&[]);
        
        // Delete in order: 0, 1, 2
        world.delete(e0);
        world.delete(e1);
        world.delete(e2);
        
        // FIFO: should reuse in order 0, 1, 2
        let new0 = world.spawn(&[]);
        let new1 = world.spawn(&[]);
        let new2 = world.spawn(&[]);
        
        assert_eq!(new0.id, 0);  // First deleted, first reused
        assert_eq!(new1.id, 1);
        assert_eq!(new2.id, 2);  // Last deleted, last reused
    }

    #[test]
    fn test_is_alive_detects_stale_references() {
        let mut world = World::new();
        
        let enemy = world.spawn(&[]);
        assert!(world.is_alive(enemy));
        
        world.delete(enemy);
        assert!(!world.is_alive(enemy));  // Stale reference
        
        let pickup = world.spawn(&[]);  // Reuses same ID
        assert!(!world.is_alive(enemy));  // Still stale (wrong generation)
        assert!(world.is_alive(pickup));  // New entity is alive
    }

    #[test]
    fn test_delete_stale_reference_returns_false() {
        let mut world = World::new();
        
        let e = world.spawn(&[]);
        world.delete(e);
        
        // Trying to delete again should fail
        assert!(!world.delete(e));
        
        // Spawn new entity in same slot
        let _ = world.spawn(&[]);
        
        // Old reference should still fail to delete
        assert!(!world.delete(e));
    }

    #[test]
    fn test_swap_remove_updates_moved_entity_location() {
        let mut world = World::new();
        
        // Create some components for testing
        register::<Position>();
        
        let p = Position { x: 0.0, y: 0.0, z: 0.0 };
        
        let e0 = world.spawn(&[&p]);
        let e1 = world.spawn(&[&p]);
        let e2 = world.spawn(&[&p]);
        
        // All in same archetype: slots [0, 1, 2]
        // Delete e0: e2 moves to slot 0
        world.delete(e0);
        
        // e2's location should now be slot 0
        let loc = world.get_location(e2).unwrap();
        assert_eq!(loc.slot_index, 0);
        
        // e1 should still be at slot 1
        let loc1 = world.get_location(e1).unwrap();
        assert_eq!(loc1.slot_index, 1);
    }

    #[test]
    fn test_generation_wrapping() {
        let mut world = World::new();
        
        // Manually set generation near max to test wrapping
        world.generations.push(u32::MAX);
        world.next_id = 1;
        
        let e = world.spawn(&[]);
        assert_eq!(e.id, 0);
        assert_eq!(e.generation, u32::MAX);
        
        world.delete(e);
        
        // After delete, generation should wrap to 0
        let e_new = world.spawn(&[]);
        assert_eq!(e_new.id, 0);
        assert_eq!(e_new.generation, 0);  // Wrapped around
    }
}
```

---

## Common Pitfalls

### 1. Forgetting to Update Locations After Swap-Remove

This is the most common bug. If you swap-remove without updating the moved entity's location, you'll get:
- Wrong components returned
- Corruption when deleting the wrong entity
- Undefined behavior in unsafe code

Always pair swap-remove with location fixup.

### 2. Not Validating Before Access

```rust
// BAD: Assumes entity is valid
fn deal_damage(&mut self, target: Entity, amount: f32) {
    let loc = self.locations[target.id as usize].unwrap();  // Panics on stale!
    // ...
}

// GOOD: Handle stale references gracefully
fn deal_damage(&mut self, target: Entity, amount: f32) -> bool {
    let Some(loc) = self.get_location(target) else {
        return false;  // Entity no longer exists
    };
    // ...
    true
}
```

### 3. Storing Raw IDs Instead of Entities

```rust
// BAD: Loses generation information
struct AITarget {
    target_id: u32,  // Can't detect if target was deleted and ID reused!
}

// GOOD: Keeps full entity reference
struct AITarget {
    target: Entity,  // Can validate with is_alive()
}
```

### 4. Double-Free Bugs

With generations, double-free is detectable but you should still handle it:

```rust
pub fn delete(&mut self, entity: Entity) -> bool {
    // ...
    
    // This check prevents double-free
    if self.generations[id] != entity.generation {
        return false;  // Already deleted (or reused)
    }
    
    // ...
}
```

---

## Performance Characteristics

Let's analyze the complexity of our entity operations:

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| `spawn()` | O(1) amortized | Vec resize can cause O(n) rarely |
| `delete()` | O(1) | Swap-remove + location update |
| `is_alive()` | O(1) | Array lookup + comparison |
| `get_location()` | O(1) | Array lookup |
| `get_component<T>()` | O(1) | Location lookup + archetype access |

Memory usage:
- `generations: Vec<u32>` — 4 bytes per entity slot ever used
- `locations: Vec<Option<EntityLocation>>` — ~24 bytes per slot (with padding)
- `free_ids: VecDeque<u32>` — 4 bytes per currently-free ID
- `entities: Vec<Entity>` — 8 bytes per currently-alive entity

For a game that spawns 100,000 entities total with 10,000 alive at once:
- generations: 400 KB
- locations: 2.4 MB
- free_ids: ~360 KB (90,000 free IDs)
- entities: 80 KB

Total: ~3.2 MB for entity management. Trivial for modern systems.

---

## Conclusion

Entity management seems simple—until it isn't. The generation pattern solves a real problem that *will* bite you in any non-trivial game:

1. **IDs alone aren't enough** — Recycled IDs cause dangling references
2. **Generations detect staleness** — A 32-bit counter makes old references detectable
3. **FIFO recycling maximizes safety** — Oldest deletions get reused first
4. **Location tracking enables O(1) access** — Sparse array maps entity → storage location
5. **Swap-remove requires fixup** — Always update moved entity locations

This foundation supports everything we'll build on top: archetypes, queries, systems, and parallelism.

In the next article, we'll explore **BlobVec: Type-Erased Component Storage**—how to store components of any type in contiguous memory without boxing, and why it's essential for cache-friendly iteration.

---

*Next article: "BlobVec: Type-Erased Contiguous Storage for Any Component"*

*All code from this series is available on GitHub: [link to your repo]*

---

### Key Takeaways

- An `Entity` is just `{ id: u32, generation: u32 }`
- Generation increments on delete, invalidating old references
- Use FIFO (`VecDeque`) for ID recycling to maximize "cooling time"
- Maintain `EntityLocation` mapping for O(1) component access
- Always fix up locations after swap-remove operations
- Validate entities before access: `is_alive()` or `get_location()`

### Further Reading

- [Rust Book: Smart Pointers](https://doc.rust-lang.org/book/ch15-00-smart-pointers.html) — Understanding ownership models
- [Generational Indices](https://lucassardois.medium.com/generational-indices-guide-8e3c5f7fd594) — In-depth explanation of the pattern
- [Slot Map Pattern](https://docs.rs/slotmap/latest/slotmap/) — Rust crate implementing this pattern
- [Catherine West's RustConf Talk](https://www.youtube.com/watch?v=aKLntZcp27M) — Covers entity management in ECS
