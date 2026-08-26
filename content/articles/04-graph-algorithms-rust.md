---
title: GRAPH ALGORITHMS · RUST
sub: Theory, bitsets, SIMD and Rayon
year: 2025
---
## Introduction: Why Are Graphs Everywhere?
Imagine you’re browsing LinkedIn. Each person is a point (node), each connection is a line (edge). That’s a graph! Google Maps? Intersections are nodes, roads are edges. Facebook, Twitter, neural networks, the Internet itself… everything is a graph.
In this article, we’ll explore two fundamental graph algorithms, starting from pure theory to the most extreme optimizations in Rust, achieving performance gains of **46x**.
## Context: Dependency Graphs in a 3D ECS Engine
This research is part of developing a **3D engine based on ECS** (Entity Component System) architecture. In this context, systems (game logic) have dependencies between them:
- The **Physics** system must execute before the **Render** system
- The **Input** system must execute before the **Movement** system
- Some systems can execute in parallel if they have no dependencies
These dependencies form a **directed acyclic graph** (DAG) where:
- **Nodes** = Systems (Physics, Render, Input, etc.)
- **Edges** = Dependencies (A → B means “A must execute before B”)
The challenge: efficiently schedule these systems to maximize parallelism while respecting dependencies. Graph algorithms thus become critical for engine performance.
## What is a Graph?
A graph G = (V, E) consists of:
- **V**: A set of vertices (nodes)
- **E**: A set of edges connecting vertices
## Understanding Big O Notation
Before diving into algorithms, let’s understand this mysterious notation: **O(…)**.
## What is Algorithmic Complexity?
Big O notation describes how an algorithm’s execution time (or memory space) evolves based on input size.
**Concrete Example**: Searching for a name in a directory
```rust
// Linear search: O(n)
fn linear_search(directory: &[String], name: &str) -> Option<usize> {
    for (i, entry) in directory.iter().enumerate() {
        if entry == name {
            return Some(i);
        }
    }
    None
}
// If directory has 1,000 names: ~500 comparisons on average
// If directory has 1 million names: ~500,000 comparisons
```
## Common Complexities
::embed{provider=gist src="https://gist.github.com/LeaderGRL/0aec9bb28231d576b06c7ee65716b81a.js" title="GitHub Gist" height=300}
## Visualization with Graphs
For a graph with **V** vertices and **E** edges:
```rust
O(V): Traverse all vertices
for vertex in graph:
    // One operation

O(V²): Compare each vertex with all others
for vertex1 in graph:
    for vertex2 in graph:
        // One operation

O(V³): Triple comparison (as for G²)
for i in graph:
    for j in graph:
        for k in graph:
            // One operation
```
## Concrete Performance Impact
For a graph with **1,000 vertices**:
- O(V) = 1,000 operations → **1 microsecond**
- O(V²) = 1,000,000 operations → **1 millisecond**
- O(V³) = 1,000,000,000 operations → **1 second**
For a graph with **10,000 vertices**:
- O(V) = 10,000 operations → **10 microseconds**
- O(V²) = 100,000,000 operations → **100 milliseconds**
- O(V³) = 1,000,000,000,000 operations → **17 minutes!**
This is why going from O(V²) to O(V) transforms an unusable real-time algorithm into something instantaneous.
## Types of Graphs
::media{src=medium/graph-algorithms-rust/01.webp label="Article illustration" fit=contain background=off height=300}
In a **directed graph**, edges have a direction.
## Graph Representations
## 1. Graphical Representation
Here’s a directed graph from the book “Introduction to Algorithms” that we’ll study throughout this article.
::media{src=medium/graph-algorithms-rust/02.webp label="Article illustration" fit=contain background=off height=300}
## 2. Adjacency List
Each vertex stores the list of its neighbors:
::media{src=medium/graph-algorithms-rust/03.webp label="Article illustration" fit=contain background=off height=300}
**Advantages**: Memory-efficient for sparse graphs **Complexity**: O(V + E) in space
## 3. Adjacency Matrix
A matrix where `matrix[i][j] = 1` if there's an edge from i to j:
::media{src=medium/graph-algorithms-rust/04.webp label="Article illustration" fit=contain background=off height=300}
**Advantages**: Check edge existence in O(1) **Complexity**: O(V²) in space
## Graph Squared (G²)
## Mathematical Definition
Graph squared G² contains an edge (u,v) if and only if there exists a path of length **at most 2** between u and v in G.
In other words, graph squared G² is a new graph built from graph G: we connect two vertices in G² either if they’re already directly connected in G, or if there exists another vertex in G that is a neighbor of both (i.e., they’re at distance 2 in G).
## Mathematical Formula
```rust
G² = G ∪ G²
```
Where G² represents paths of length exactly 2.
## Visual Example
Because a picture is worth 1,000 words, here’s the graph squared G² of our previously illustrated graph.
::media{src=medium/graph-algorithms-rust/05.webp label="Article illustration" fit=contain background=off height=300}
In this graph, we add edge 1 → 5:
- 5 is 2 nodes away
- 5 is reachable through edge direction 2 → 5
Edge 2 → 4 is added through neighbor node 5 and not neighbor 1 because the edge is directed 2 → 5 and not 2 → 1.
## Naive Implementation in Pseudocode
```rust
function GraphSquared(matrix):
    n = size of matrix
    result = copy of matrix

    for i from 0 to n-1:
        for j from 0 to n-1:
            for k from 0 to n-1:
                if matrix[i][k] = 1 AND matrix[k][j] = 1:
                    result[i][j] = 1

    return result
```
**Complexity**: O(V³) — three nested loops
## Rust Implementation (Basic Version)
```rust
fn matrix_square_basic(matrix: &Vec<Vec<usize>>) -> Vec<Vec<usize>> {
    let n = matrix.len();
    let mut result = matrix.clone();

    // Add paths of length 2
    for i in 0..n {
        for j in 0..n {
            for k in 0..n {
                if matrix[i][k] == 1 && matrix[k][j] == 1 {
                    result[i][j] = 1;
                }
            }
        }
    }

    result
}
```
## First Optimization: Early Break
Once we find ONE path of length 2, no need to search for others:
```rust
fn matrix_square_optimized(matrix: &Vec<Vec<usize>>) -> Vec<Vec<usize>> {
    let n = matrix.len();
    let mut result = matrix.clone();

    for i in 0..n {
        for j in 0..n {
            if result[i][j] == 0 {  // Only if not already connected
                for k in 0..n {
                    if matrix[i][k] == 1 && matrix[k][j] == 1 {
                        result[i][j] = 1;
                        break;  // OPTIMIZATION: stop as soon as we find one
                    }
                }
            }
        }
    }

    result
}
```
## Second Optimization: Bitwise Operations
### What is Bitwise?
Bitwise operations directly manipulate individual bits of a number. Instead of storing each 0 or 1 in a complete integer (32 or 64 bits), we use a SINGLE bit!
### Understanding Bits
A number in memory is a sequence of bits:
```rust
Number 5 in 8 bits: 00000101
Number 3 in 8 bits: 00000011
                    ↑     ↑
                  bit 2  bit 0
```
### Fundamental Bitwise Operations
```rust
// AND (&): 1 only if both bits are 1
5 & 3 = 00000101
      & 00000011
      = 00000001 (result: 1)

// OR (|): 1 if at least one bit is 1
5 | 3 = 00000101
      | 00000011
      = 00000111 (result: 7)

// XOR (^): 1 if bits are different
5 ^ 3 = 00000101
      ^ 00000011
      = 00000110 (result: 6)

// NOT (!): inverts all bits
!5 = !00000101
   = 11111010

// SHIFT LEFT (<<): shifts bits to the left
5 << 1 = 00000101 << 1
       = 00001010 (result: 10)

// SHIFT RIGHT (>>): shifts bits to the right
5 >> 1 = 00000101 >> 1
       = 00000010 (result: 2)
```
### Implementing G² with Bitwise in Rust
```rust
fn matrix_square_bitwise(matrix: &Vec<Vec<usize>>) -> Vec<Vec<usize>> {
    let n = matrix.len();

    // Step 1: Convert each row to bits
    let mut rows: Vec<u64> = vec![0; n];
    for i in 0..n {
        for j in 0..n {
            if matrix[i][j] == 1 {
                // Set bit j to 1 in row i
                rows[i] |= 1u64 << j;
                // If j=3: 1 << 3 = 0b00001000
                // rows[i] |= 0b00001000 activates bit 3
            }
        }
    }

    // Step 2: Calculate G² with bitwise operations
    let mut result_bits = rows.clone();
    for i in 0..n {
        for k in 0..n {
            // Check if bit k is set in row i
            if (rows[i] & (1u64 << k)) != 0 {
                // If yes, OR with entire row k
                result_bits[i] |= rows[k];
                // This adds ALL neighbors of k to i!
            }
        }
    }

    // Step 3: Convert back to normal matrix
    let mut result = vec![vec![0; n]; n];
    for i in 0..n {
        for j in 0..n {
            // Extract bit j from row i
            if (result_bits[i] & (1u64 << j)) != 0 {
                result[i][j] = 1;
            }
        }
    }

    result
}
```
**Advantages**:
- **Memory**: 64x less memory (1 bit vs 64 bits)
- **Cache**: More data fits in CPU cache
- **Parallelism**: One OR operation processes 64 connections at once!
### Explanation of Matrix Row to Bits Conversion
For our matrix G:
- `rows[0]`: bit 2 set and bit 4 set → binary `0b010100`(decimal 10)
- `rows[1]`: bit 2 set → binary `0b000010`(decimal 16)
- `rows[2]`: bit 3 set → binary `0b000011`(decimal 48)
- `rows[3]`: no bit → binary `0b010000`(decimal 2)
- `rows[4]`: no bit → binary `0b000100`(decimal 8)
- `rows[5]`: no bit → binary `0b000001`(decimal 32)
Resulting in a vector containing [10, 16, 48, 2, 8, 32].
### Explanation of G² calculation with bit-by-bit operations
For each node **i**, we want to “jump” first to each neighbor **k**, then copy all arcs starting from **k** into line **i**.
**In bitwise**:
- Test if **i→k** exists: `(rows[i] & (1 << k)) != 0`
- If yes, add all `rows[k]` to `result_bits[i]` through bitwise OR: `result_bits[i] |= rows[k]`
Initially, `result_bits = rows`, so we already preserve direct edges (length 1). After this loop, each `result_bits[i]` contains edges of length 1 **and** length 2.
### **Calculation for i = 0**
We iterate through k = 0,1,2,3,4,5:
::embed{provider=gist src="https://gist.github.com/LeaderGRL/4872b56e37dec499e9ac174ebcfd9b76.js" title="GitHub Gist" height=300}
### **Calculation for i = 1**
We iterate through k = 0,1,2,3,4,5:
::embed{provider=gist src="https://gist.github.com/LeaderGRL/5233b0971b67d5d34935e37d5fc1c955.js" title="GitHub Gist" height=300}
### **Final Result for i = 0..5**
::embed{provider=gist src="https://gist.github.com/LeaderGRL/31e06586bf80fc93d0f5ed11ff470543.js" title="GitHub Gist" height=300}
The last step consists of converting this result into a matrix.
## Third Optimization: SIMD (Single Instruction, Multiple Data)
### What is SIMD?
SIMD allows applying the same operation on multiple data simultaneously.
### Simple Analogy
**Without SIMD (scalar)**:
```rust
Addition of 4 pairs of numbers:
3 + 5 = 8     (cycle 1)
2 + 7 = 9     (cycle 2)
1 + 4 = 5     (cycle 3)
6 + 3 = 9     (cycle 4)
Total: 4 cycles
```
**With SIMD (vectorial)**:
```rust
Addition of 4 pairs in ONE nycle:
[3, 2, 1, 6] + [5, 7, 4, 3] = [8, 9, 5, 9]
Total: 1 cycle!
```
### SIMD Registers
Modern processors have special registers:
- **SSE**: 128 bits (2 × u64 or 4 × u32)
- **AVX**: 256 bits (4 × u64 or 8 × u32)
- **AVX-512**: 512 bits (8 × u64 or 16 × u32)
```rust
AVX register of 256 bits:
┌────────┬────────┬────────┬────────┐
│  u64   │  u64   │  u64   │  u64   │
└────────┴────────┴────────┴────────┘
    ↓        ↓        ↓        ↓
 Identical operation on each part
```
### Example of OR Operation Using SIMD in Rust
```rust
#[cfg(target_arch = "x86_64")]
use std::arch::x86_64::*;

unsafe fn simd_or_256bits(a: &[u64], b: &[u64], result: &mut [u64]) {
    // Process 4 × u64 (256 bits) at once
    for i in (0..a.len()).step_by(4) {
        // Load 256 bits from a
        let va = _mm256_loadu_si256(a[i..].as_ptr() as *const __m256i);
        // va contains [a[i], a[i+1], a[i+2], a[i+3]]

        // Load 256 bits from b
        let vb = _mm256_loadu_si256(b[i..].as_ptr() as *const __m256i);
        // vb contains [b[i], b[i+1], b[i+2], b[i+3]]

        // OR on 256 bits in ONE instruction!
        let vresult = _mm256_or_si256(va, vb);
        // vresult = [a[i]|b[i], a[i+1]|b[i+1], a[i+2]|b[i+2], a[i+3]|b[i+3]]

        // Store the result
        _mm256_storeu_si256(result[i..].as_mut_ptr() as *mut __m256i, vresult);
    }
}
```
As with the bitwise version, the G² calculation requires **data conversion** before performing the **OR operation** to ensure **SIMD compatibility** and correct **alignment**, but nothing more! The full code is available in the Github repository at the end of this article.
### Why is SIMD So Efficient?
- **Throughput**: 4× more operations per cycle (AVX)
- **Hidden latency**: CPU can overlap operations
- **Energy**: More efficient than 4 separate operations
- **Cache**: Loads/stores contiguous blocks
### SIMD Limitations
- **Alignment**: Data must be memory-aligned
- **Fixed size**: Works better with multiples of 256/512 bits
- **Complexity**: Code harder to write and debug
- **Portability**: Processor-specific (x86, ARM, etc.)
**General rule**: SIMD shines for simple operations on lots of contiguous data, exactly like our bit matrices!
## Fourth Optimization: Parallelization
### What is Parallelization?
Parallelization consists of dividing work into multiple tasks that execute simultaneously on different processor cores. It’s like having multiple employees working on different parts of a project at the same time.
### Understanding CPU Cores
A modern processor has multiple cores:
```rust
8-core CPU:
┌─────┬─────┬─────┬─────┐
│Core0│Core1│Core2│Core3│
├─────┼─────┼─────┼─────┤
│Core4│Core5│Core6│Core7│
└─────┴─────┴─────┴─────┘
```
```rust
Without parallelization: Only Core0 works
With parallelization: All 8 cores work
```
### Simple Example: Calculating Number Squares
**Sequential version (1 core)**:
```rust
let numbers = vec![1, 2, 3, 4, 5, 6, 7, 8];
let squares: Vec<i32> = numbers
    .iter()
    .map(|&x| x * x)  // Core0: 1², 2², 3², 4², 5², 6², 7², 8²
    .collect();
// Time: 8 units
```
**Parallel version (8 cores)**:
```rust
use rayon::prelude::*;

let squares: Vec<i32> = numbers
    .par_iter()  // "par" = parallel
    .map(|&x| x * x)
    .collect();
// Core0: 1²  Core1: 2²  Core2: 3²  Core3: 4²
// Core4: 5²  Core5: 6²  Core6: 7²  Core7: 8²
// Time: 1 unit!
```
### Rayon: Easy Parallelization in Rust
Rayon is a library that makes parallelization almost transparent. It automatically manages:
- Thread creation
- Work distribution
- Synchronization
- Result collection
### How Rayon Divides Work
```rust
Data: [A, B, C, D, E, F, G, H]
                ↓
        Rayon Work-Stealing
    ┌──────────┴──────────┐
Thread 1: [A, B]      Thread 2: [C, D]
Thread 3: [E, F]      Thread 4: [G, H]
    ↓                     ↓
If Thread 1 finishes early, it "steals" work from others
```
### Parallelizing G² Calculation
```rust
use rayon::prelude::*;
use std::sync::Arc;

fn matrix_square_parallel(matrix: &Vec<Vec<usize>>) -> Vec<Vec<usize>> {
    let n = matrix.len();
    // Arc = Atomic Reference Counter for sharing without copying
    let matrix_arc = Arc::new(matrix);

    // Calculate each row in parallel
    let result: Vec<Vec<usize>> = (0..n)
        .into_par_iter()  // Transform into parallel iterator
        .map(|i| {
            // Each thread has access to the shared matrix
            let matrix = matrix_arc.clone();
            let mut row = vec![0; n];

            // Calculate row i
            for j in 0..n {
                // First copy existing value
                row[j] = matrix[i][j];

                // Then look for paths of length 2
                if row[j] == 0 {
                    for k in 0..n {
                        if matrix[i][k] == 1 && matrix[k][j] == 1 {
                            row[j] = 1;
                            break;
                        }
                    }
                }
            }

            row  // Return calculated row
        })
        .collect();  // Rayon collects all rows

    result
}
```
### Anatomy of Parallel Execution
```rust
1000×1000 matrix on 8 cores:

Time 0ms: Work division
├─ Thread 0: rows 0-124
├─ Thread 1: rows 125-249
├─ Thread 2: rows 250-374
├─ Thread 3: rows 375-499
├─ Thread 4: rows 500-624
├─ Thread 5: rows 625-749
├─ Thread 6: rows 750-874
└─ Thread 7: rows 875-999
Time 1-5ms: Parallel calculation
Thread 0: ████████████░░░ (finishes early)
Thread 1: ████████████████
Thread 2: ███████████████░
Thread 3: ████████████████
Thread 4: █████████████░░░ (finishes early)
Thread 5: ████████████████
Thread 6: ████████████████
Thread 7: ██████████████░░
Time 5ms: Work-stealing
Thread 0 → helps Thread 1
Thread 4 → helps Thread 3
Time 6ms: Result collection
Result = [row0, row1, ..., row999]
```
### Parallelization Pitfalls
**1. Thread Creation Overhead**
```rust
// BAD: Parallelizing a small task
let sum: i32 = vec![1, 2, 3]
    .par_iter()
    .sum();  // Slower than sequential!

// GOOD: Parallelize only large tasks
if matrix.len() > 100 {
    // Parallel version
} else {
    // Sequential version
}
```
**2. Memory Contention (False Sharing)**
```rust
// BAD: All threads modify the same vector
let mut result = vec![0; n];
(0..n).into_par_iter().for_each(|i| {
    result[i] = compute(i);  // Access conflict!
});

// GOOD: Each thread creates its part
let result: Vec<_> = (0..n)
    .into_par_iter()
    .map(|i| compute(i))
    .collect();
```
### When to Use Parallelization?
**Use when**:
- Large data (n > 100)
- Independent calculations per row/element
- Expensive operations (> 1μs per element)
- Multi-core machine
**Avoid when**:
- Small data (overhead > gain)
- Strong dependencies between calculations
- Conflicting memory access
- I/O operations (disk, network)
## Performance Analysis
### Hardware
Tests performed on:
- CPU: Intel® Core™ Ultra 9 185H Processor (Up to 5.1 GHz 24MB L3 Cache)
- RAM: 32GB
- Compiler: rustc 1.89.0-nightly
## Results
### 1. Small Graphs (16–64 nodes)
For n=64:
- **Original**: 55.4 µs (baseline)
- **Bitwise simple**: 8.5 µs (**6.5x faster**)
- **Custom BitVec**: 12.5 µs (4.4x faster)
- **SIMD**: 17.7 µs (3.1x faster)
**Surprise**: Simple bitwise beats the “custom BitVec” version! This is explained by the implementation simplicity allowing better compiler optimization.
⚠️ The BitVec version is not explained in this article because it’s less efficient overall despite being written with the goal of being the best version.
### 2. Medium Graphs (128–256 nodes)
For n=256:
- **Basic**: 13.0 ms (4x slower — normal as no early break)
- **SIMD**: 303 µs (**10.8x faster**)
- **Ultra-optimized**: 353 µs (9.2x faster)
- **Parallel**: 400 µs (8.2x faster)
**SIMD wins** at this size, as expected!
### 3. Large Graphs (500–2000 nodes)
For n=1000:
- **Parallel**: 4.2 ms (**41x faster**)
- **Custom BitVec**: 5.3 ms (33x faster)
## Density Impact
Interesting observation:
- At low density (1–5%), the gap between ultra-optimized and parallel is large
- At high density (50%), performances converge (720 µs vs 723 µs)
This shows that parallelism has an overhead that becomes negligible when there are many calculations.
## Key Conclusions
1. **For n ≤ 64**: Use `bitwise_simple` (fastest)
2. **For 64 < n ≤ 256**: Use `SIMD`(10x faster)
3. **For n > 256**: Use `parallel`(up to 46x faster)
4. **Density matters**: Parallelism becomes more effective with high density
## Complete Source Code
The complete code with all algorithms, tests, and benchmarks is available at: [GitHub — Graph Algorithms in Rust](https://github.com/LeaderGRL/graphbench-rs.git)
*This article is based on Chapter 22 of “Introduction to Algorithms” by Cormen, Leiserson, Rivest, and Stein,
