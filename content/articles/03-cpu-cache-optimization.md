---
title: CPU CACHES · ECS IN RUST
sub: From latency to data layout
year: 2026
---
::media{src=medium/cpu-cache-optimization/01.webp label="Article illustration" fit=contain background=off height=300}
## 1. Introduction: The Problem Nobody sees
Imagine you’re a developer who just wrote two versions of an algorithm. Both do exactly the same thing, have the same O(n) complexity, use the same operations. Yet one is **8 times faster** than the other.
```
// Version A: 3.8ms for 1 million elements
for entity in &entities {
    sum += entity.position.x;
}

// Version B: 470µs for 1 million elements
for pos in &positions {
    sum += pos.x;
}
```
The difference? **How the data is organized in memory.**
This isn’t a bug. It’s the **CPU cache**. an intermediate memory system that can transform a slow program into a fast one, or vice versa, without changing a single line of logic.
In this article, we’ll dive deep into how CPU caches work. No oversimplifications, you’ll understand **exactly** what happens when your CPU reads data from memory.
## 2. The Memory Well: Why Caches Exist
**A Story of Imbalance**
In the 1980s, processors and RAM memory evolved at roughly the same pace. Then something happened.
::figure
Performance Evolution (1980–2020)
- CPU Performance: +25–50% per year (exponential)
- DRAM Latency: +7% per year (near-linear)
Source: Hennessy & Patterson, Computer Architecture: A Quantitative Approach, 5th ed. (2011)
::
The result? In 2026, a modern processor can execute **billions** of operations per second, but waiting for data from RAM still takes ~100 nanoseconds. Let’s do the math:
```
Modern CPU 4 GHz = 4 billion cycles/second
1 cycle = 0.25 nanoseconds

RAM Latency = ~100 nanoseconds
            = ~400 CPU cycles

=> The CPU can execute 400 instructions while waiting
   for ONE SINGLE piece of data from RAM.
```
### The Solution: A Memory Hierarchy
Engineers solved this problem by creating multiple levels of memory, each with a different trade-off between size and speed:
::media{src=medium/cpu-cache-optimization/02.webp label="Cache Memory Hierarchy" fit=contain background=off height=300}
The principle is simple: **keep frequently used data as close to the CPU as possible**.
## 3. Memery Hierarchy Architecture
### L1 Cache
The L1 cache is the fastest and closest to the CPU. On most modern processors, it’s divided into two parts:
- **L1d (Data)**: For data (32–64 KB)
- **L1i (Instruction)**: For executable code (32–64 KB)
::figure
L1 Characteristics (Intel Core i9–13900K)
─────────────────────────────────────────
Size: 80 KB per core (48 KB data + 32 KB instruction)
Latency: 4–5 cycles (~1 ns)
Associativity: 12-way (L1d), 8-way (L1i)
Line size: 64 bytes
Bandwidth: ~2 TB/s (read)
::
At 4 cycles of latency, L1 is almost as fast as registers. The problem? **32 KB is tiny.**
### L2 Cache
The L2 cache offers a trade-off between size and speed:
::figure
L2 Characteristics (Intel Core i9–13900K)
─────────────────────────────────────────
Size: 2 MB per core (P-cores)
Latency: 12–14 cycles (~3 ns)
Associativity: 16-way
Line size: 64 bytes
::
L2 is **3x slower** than L1, but **30x larger**. This is often where the difference between a fast and slow program is determined.
### L3 Cache
The L3 cache (also called LLC for Last Level Cache) is shared among all cores:
::figure
L3 Characteristics (Intel Core i9–13900K)
─────────────────────────────────────────
Size: 36 MB (shared among all cores)
Latency: ~40 cycles (~10 ns)
Associativity: 12-way
Line size: 64 bytes
::
L3 is crucial for:
- Communication between cores
- Working sets too large for L2
- Reducing pressure on RAM
### RAM: The Last Resort
When data isn’t in any cache, it must be fetched from RAM:
::figure
DDR5–5600 RAM Characteristics
─────────────────────────────────────────
Latency: ~80–100 ns (~200 cycles)
Bandwidth: ~45 GB/s (per channel)
Size: 8–128 GB typical
::
**200 cycles.** That’s the price of a complete cache miss. And you potentially pay this price on every memory access.
```
L1 Hit:   ████ (4 cycles)

L2 Hit:   ████████████ (12 cycles)

L3 Hit:   ████████████████████████████████████████ (40 cycles)

RAM:      ███████████████████████████████████████████████████████████████
          ███████████████████████████████████████████████████████████
          ████████████████████████████████████████████████████████████████
          ████████████ (200 cycles)
```
## 4. Cache Anatomy: How It Really Works
Now let’s dive into the details. How does the CPU know if data is in the cache? How does it decide where to store it?
### The Cache Line: The Fundamental Unit
The CPU **never** reads a single byte from RAM. It always loads a block of **64 bytes** called a **cache line**.
::media{src=medium/cpu-cache-optimization/03.webp label="Cache Line" fit=contain background=off height=300}
Why 64 bytes? It’s a trade-off:
- **Too small** (16 bytes): Too much management overhead, poor locality exploitation
- **Too large** (256 bytes): Bandwidth waste, cache pollution
### Memory Address Structure
When the CPU wants to access an address, it decomposes it into three parts:
```
64-bit address (simplified example with 32KB L1 cache, 8-way)
┌───────────────────────┬──────────┬────────┐
│         Tag            │  Index   │ Offset │
│      (52 bits)         │ (6 bits) │(6 bits)│
└────────────────────────┴──────────┴────────┘

- Offset (6 bits): Position within the cache line (0-63)
- Index (6 bits):  Which cache "set" (0-63)
- Tag (rest):      Unique identifier for the line
```
Let’s break down a concrete example:
Address: 0x1AC0
- 1 = 0001 - A = 1010 - C = 1100 - 0 = 0000
Full address in binary: 0001 1010 1100 0000.
The offset corresponds to the position in the 64-bit cache line and is located at the very beginning of the line in our example (+0). The offset is 6 bits. Offset = 00 0000.
For the index, we assumed that we were on the L1 cache, which has 64 lines. 64 lines => 6 bits Index = 1010 11
The tag corresponds to the rest of the address. Tag = 0001
Complete address in binary with Tag/Index/Offset breakdown: [0001] [1010 11] [00 0000]
### Associativity: Cache “Ways”
A cache can be organized in different ways:
**Direct-mapped (1 way)**: Each address can only go to ONE location.
::figure
Address A => Set 5, only way
Address B => Set 5, only way
=> CONFLICT! B evicts A, even if the cache isn’t full.
::
**Fully associative**: Each address can go ANYWHERE.
::figure
Address A => Any free line
Address B => Any free line
=> No conflict, but expensive search (compare all tags)
::
**N way set associative**: A compromise. Each address can go to N locations.
::note
8 way cache, 64 sets:
::
::figure
Set 0: [way0][way1][way2][way3][way4][way5][way6][way7]
Set 1: [way0][way1][way2][way3][way4][way5][way6][way7]
…
Set 63: [way0][way1][way2][way3][way4][way5][way6][way7]
::
::figure
Address A (index=5) can go to: Set 5, ways 0–7
Address B (index=5) can go to: Set 5, ways 0–7
=> Conflict only if all 8 ways of set 5 are occupied
::
Modern caches typically use 8 to 16 ways, offering a good balance between flexibility and search cost.
### The Complete Memory Access Process
Here’s what happens when your code executes `let x = array[42];`:
::figure
STEP 1: Address Calculation
─────────────────────────────
CPU calculates: base_address + 42 * sizeof(element)
Result: 0x1AC0
::
::figure
STEP 2: Address Decomposition
─────────────────────────────
Tag: 0x1
Index: 43
Offset: 0
::
::figure
STEP 3: L1 Search
─────────────────────────────
→ Go to set 43
→ Compare each way’s tag with 0x1AC0
→ Check the “valid” bit
::
::figure
Set 44: [0x1 ✓][0x2 ✗][0x3✗]…
↑
MATCH! L1 HIT
::
::figure
STEP 4a: On HIT
─────────────────────────────
→ Read bytes at offset 0
→ Return to CPU
→ Total: 4 cycles
::
::figure
STEP 4b: On MISS
─────────────────────────────
→ Search in L2 (same process)
→ If L2 miss, search in L3
→ If L3 miss, go to RAM
→ Load entire cache line (64 bytes)
→ Store in L1 (possibly evicting another line)
→ Return data to CPU
→ Total: 200+ cycles
::
### Replacement Policies
When the cache is full and a new line needs to enter, which one to evict?
**LRU (Least Recently Used)**: Evict the least recently used line.
::note
Access history: A, B, C, D, A, B, E (4-line cache)
State: [A, B, E, D] ← C evicted as least recent
::
**Pseudo-LRU**: Less expensive approximation of LRU (used in practice).
**Random**: Sometimes as effective as LRU, and much simpler!
## 5. The Three Types of Cache Misses
Not all cache misses are equal. Understanding their nature helps avoid them.
### 1. Compulsory Miss (Cold Miss)
**Definition**: First access to a piece of data. Unavoidable.
```
// First ever access to positions[0] - ALWAYS a miss
let first = positions[0];  // Compulsory miss

// Subsequent accesses to neighboring data are hits
let second = positions[1]; // HIT! (same cache line)
let third = positions[2];  // HIT!
```
**How to minimize**: Impossible to eliminate, but you can maximize the usefulness of each miss by exploiting spatial locality.
### 2. Capacity Miss
**Definition**: The data doesn’t fit in the cache.
```
// 100 MB working set, 36 MB L3 cache
let huge_array: Vec<f64> = vec![0.0; 12_500_000]; // 100 MB

// First pass: load everything (compulsory + capacity misses)
for x in &huge_array { /* ... */ }

// Second pass: early data has been evicted!
for x in &huge_array { /* ... */ }  // Capacity misses
```
**How to minimize**:
- Reduce working set
- Process data in blocks that fit in cache (blocking/tiling)
- Improve locality to reduce effective working set
### 3. Conflict Miss
**Definition**: Two addresses map to the same set, evicting each other.
```
// Pathological example: stride = cache way size
let array: [f64; 1024] = [0.0; 1024];  // 8 KB

// Access with stride of 512 (4 KB) on a direct-mapped cache
// All these addresses map to the SAME set!
let a = array[0];      // Miss, loads into set N
let b = array[512];    // Miss, evicts a from set N
let c = array[0];      // Miss! a was evicted
let d = array[512];    // Miss! b was evicted
// Miss rate: 100% despite only using 2 lines
```
**How to minimize**:
- Avoid strides that are powers of 2 close to cache size
- Pad structures to break pathological alignments
- Use caches with more ways (out of your control)
### Example:
::embed{provider=iframe src="https://codepen.io/arthoxx_/embed/preview/WbxojvP?default-tabs=js%2Cresult&height=600&host=https%3A%2F%2Fcodepen.io&slug-hash=WbxojvP" title="Interactive CodePen" height=300}
## 6. Locality: The Fundamental Principle
The entire point of caches relies on two types of locality.
### Temporal Locality
**Principle**: If you access a piece of data, you’ll probably access it again soon.
```
// Good temporal locality
for _ in 0..1000 {
    counter += 1;  // 'counter' stays in cache
}

// Poor temporal locality
for i in 0..1000 {
    results[i] = compute(data[i]);  // Each element visited only once
}
```
### Spatial Locality
**Principle**: If you access an address, you’ll probably access neighboring addresses.
```
// Excellent spatial locality
for i in 0..1000 {
    sum += array[i];  // Sequential access
}
// One cache line (64 bytes) = 16 f32 values
// 1 miss for 16 elements = 6.25% miss rate

// Poor spatial locality
for i in 0..1000 {
    sum += array[i * 100];  // Stride of 400 bytes
}
// Each access in a different cache line
// 100% miss rate
```
### Quantifying the Impact
Let’s take a concrete example with 1 million elements:
::figure
Sequential access (stride = 1):
─────────────────────────────────────────
Cache lines loaded: 1,000,000 / 16 = 62,500
Cache misses: 62,500 (compulsory only)
Wasted cycles: 62,500 × 200 = 12,500,000 cycles
Time @ 4GHz: ~3.1 ms
::
::figure
Strided access (stride = 16, i.e., 64 bytes):
─────────────────────────────────────────
Cache lines loaded: 1,000,000 (one per access!)
Cache misses: 1,000,000
Wasted cycles: 1,000,000 × 200 = 200,000,000 cycles
Time @ 4GHz: ~50 ms
::
::note
Ratio: 16x slower for the same number of operations!
::
## 7. Impact on Code: AoS vs SoA
This is where theory meets practice. Let’s see how memory layout affects performance.
### Array of Structures (AoS)
The “natural” way to organize data:
```
struct Entity {
    position: Vec3,    // 12 bytes
    velocity: Vec3,    // 12 bytes
    health: f32,       // 4 bytes
    damage: f32,       // 4 bytes
}   // Total: 32 bytes

let entities: Vec<Entity> = vec![...];  // 1 million entities
```
**Memory layout**:
::media{src=medium/cpu-cache-optimization/04.webp label="Entity Cache" fit=contain background=off height=300}
**Problem: Query on positions only**
```
// We want to sum all positions
fn sum_positions(entities: &[Entity]) -> Vec3 {
    let mut sum = Vec3::ZERO;
    for e in entities {
        sum += e.position;  // We read 12 bytes...
    }                       // ... but load 32 bytes per entity!
    sum
}
```
::note
What we want: [pos][pos][pos][pos]… 12 bytes × N
What we load: [pos, vel, hp, dmg][pos, vel, hp, dmg]… 32 bytes × N
::
::figure
Efficiency: 12/32 = 37.5% useful bandwidth
Waste: 62.5% of loaded data is unused!
::
### Structure of Arrays (SoA)
Let’s reorganize data by component:
```
struct World {
    positions:  Vec<Vec3>,   // All positions together
    velocities: Vec<Vec3>,   // All velocities together
    healths:    Vec<f32>,    // All health values together
    damages:    Vec<f32>,    // All damage values together
}
```
::media{src=medium/cpu-cache-optimization/05.webp label="Components Cache" fit=contain background=off height=300}
**Query on positions**:
```
fn sum_positions(world: &World) -> Vec3 {
    let mut sum = Vec3::ZERO;
    for pos in &world.positions {
        sum += pos;  // We read 12 bytes, we load 12 useful bytes
    }
    sum
}
```
::note
What we want: [pos][pos][pos][pos]…
What we load: [pos][pos][pos][pos]…
::
::figure
Efficiency: 100% useful bandwidth!
::
### Field-Level SoA: Ultimate Optimization (well, almost…)
For cases where you iterate on a single field:
```
struct World {
    // Positions decomposed by field
    pos_x: Vec<f32>,
    pos_y: Vec<f32>,
    pos_z: Vec<f32>,
    // ...
}
```
::media{src=medium/cpu-cache-optimization/06.webp label="Field Level Cache" fit=contain background=off height=300}
::figure
=> Perfect for SIMD (16 floats = one AVX-512 register)
=> Maximum cache utilization
=> Prefetcher works perfectly
::
### When to Use What?
Use AoS when: • You always access ALL fields together • Code simplicity takes priority over performance • Entities are accessed individually (not in batches)
Use SoA when: • You iterate over millions of elements • Queries only use a subset of fields • Performance is critical (games, simulations, HPC)
Use Field-level SoA when: • You can use SIMD • Operations are simple (sum, min, max) • Each field is processed independently
### AoS vs SoA Cache Miss Example on sum position calculation:
::note
1. Run the “AoS” simulation.
::
::note
The yellow frame represents the cache line (64 bytes). When the CPU (the bright cursor) wants to read a position (green block), it has to pull the entire line from RAM.
::
::figure
- The problem: Look at all the orange (Velocity) and blue (HP) blocks that turn gray and dull.
- They are loaded into the cache, consuming electricity and bandwidth… only to be immediately discarded because they are not used.
- Result: Look at the “Efficiency” meter. It stagnates at around 37.5%. You are throwing 60% of your performance out the window.
::
::note
2. Run the “SoA” simulation.
::
::figure
- The data is sorted: all positions (green) are stuck together.
- When a cache line is loaded, it is filled to the brim with useful data.
- Result: Efficiency climbs to 100%.
::
::note
The “Data Loaded” meter rises much more slowly. Your RAM breathes easier, your CPU is constantly fed.
::
::embed{provider=iframe src="https://codepen.io/arthoxx_/embed/preview/VYjmbXX?default-tabs=css%2Cresult&height=600&host=https%3A%2F%2Fcodepen.io&slug-hash=VYjmbXX" title="Interactive CodePen" height=300}
## 8. The Hardware Prefetcher: Your Invisible Ally
The CPU doesn’t passively wait for cache misses. It tries to **predict** your future accesses and load data **before** you request it.
### How the Prefetcher Works
::figure
- Your accesses: [0] [1] [2] [3] [4] …
- Prefetcher: “Hmm, sequential pattern detected!”
- Action: Load [5], [6], [7] in the background
- Result: When you request [5], it’s already there!
::
### Types of Prefetchers
1. **Stride Prefetcher** Detects constant stride patterns:
::figure
Access: 0, 4, 8, 12, 16… (stride = 4)
=> Predicts: 20, 24, 28…
::
**2. Stream Prefetcher** Optimized for sequential access:
::figure
Access: line 0, line 1, line 2…
=> Automatically loads following lines
::
**3. Spatial Prefetcher** Loads adjacent lines:
::figure
Access: line N
=> Also loads line N+1 (adjacent line prefetch)
::
```
// ✓ Predictable pattern - Prefetcher works well
for i in 0..n {
    sum += array[i];
}

// ✗ Unpredictable pattern - Prefetcher useless
for i in 0..n {
    sum += array[random_indices[i]];
}

// ✗ Stride too large or variable
for i in 0..n {
    sum += array[i * varying_stride];
}

// ✗ Dependent accesses (pointer chasing)
while node != null {
    sum += node.value;
    node = node.next;  // Address unknown until read
}
```
### Helping the Prefetcher
You can give hints to the prefetcher with intrinsics:
```
use std::arch::x86_64::_mm_prefetch;

for i in (0..n).step_by(16) {
    // Prefetch 256 bytes ahead
    unsafe {
        _mm_prefetch(
            array.as_ptr().add(i + 64) as *const i8,
            _MM_HINT_T0  // Prefetch into L1
        );
    }

    // Process current batch
    for j in i..min(i+16, n) {
        sum += array[j];
    }
}
```
But be careful: the hardware prefetcher is often better than your manual hints. Only prefetch manually if you’ve **measured** a gain.
## 9. Conclusion
### Key Takeaways
1. **Cache is your bottleneck**: On memory bound code, the difference between good and bad layout can be 10x.
2. **The cache line is the fundamental unit**: 64 bytes loaded per access. Maximize the usefulness of each loaded line.
3. **Locality, locality, locality**: Sequential access + compact data = happy cache.
4. **Measure before optimizing**: Use `perf`, Cachegrind, or your platform's tools.
5. **Data layout determines performance**: AoS vs SoA isn’t a style question, it’s a performance question.
### Further Reading
- **“What Every Programmer Should Know About Memory” —** Ulrich Drepper (2007, still relevant)
- **“Computer Architecture: A Quantitative Approach”** — Hennessy & Patterson
- **“Data-Oriented Design” —** Richard Fabian
- **Mike Acton’s talks** on data-oriented design
