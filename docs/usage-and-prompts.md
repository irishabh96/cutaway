# Usage and prompts

Tell Cutaway what the reader should understand, which real components or quantities matter, what the reader can change, and where the result will live. Choose a direct architectural cutaway or ask for a physical metaphor. You can explicitly request either.

```text
/cutaway explain [system] using [architecture or physical metaphor]. Model [counts, rates, states]. Let readers [interaction]. Deliver [HTML, SVG, or React], in [theme].
```

In Codex, replace `/cutaway` with `$cutaway`. The generated output belongs to you under the applicable source license. Inspect its model and visual checks before publishing technical claims.

## Three rendering modes

| Mode | Use it when | What is generated |
| --- | --- | --- |
| Pure isometric SVG | Components, state transitions, layered architecture, mechanisms | Four-tone solids painted back to front, live readout cards, pointer and keyboard controls. Standalone HTML/SVG or React components. |
| SVG + WebGL | Fire, fluids, caustics, light beams, or another continuous visual phenomenon explains the system | A shader canvas between back and front SVG layers, sharing the isometric camera. Light and dark effects are tuned separately. SVG remains readable when WebGL is unavailable. |
| True 3D beta | The explanation depends on a part rotating or moving in depth | Moving convex parts are re-projected, re-shaded, and ordered each frame. Static architecture stays precomputed. Scope the moving subject carefully; dense scenes are expensive. |

Animation should explain a causal relationship. A request moves because the model advances; a readout changes because the same model changes. Reduced motion holds a still state while explicit controls continue to work.

## Software and AI recipes

### 1. Multi-agent orchestration

```text
/cutaway a direct architectural cutaway of an agent orchestrator: intake, planner, three workers, merge barrier, review, output. Six tasks with different durations share a bounded pool. Let readers change parallelism from one to three, step a job, and open the control plane. Show the critical path and wait for every task before review. Standalone SVG/HTML, both themes.
```

### 2. Raft consensus

```text
/cutaway a five-node Raft cluster as an openable architectural model. Show terms, leader election, replicated log entries, and commit only after a majority. Let me isolate one follower or the leader and step messages. Explicitly explain the simplified failure and timing assumptions. Pure SVG, light and dark.
```

### 3. B-tree splits

```text
/cutaway an interactive B-tree insertion cutaway with minimum degree 2. Insert a supplied key sequence one key at a time, expose child pointers, promote median keys during splits, and show the invariant after every operation. Use direct nodes and keys, no invented mechanical metaphor. Standalone HTML, keyboard stepping.
```

### 4. Kafka partitions

```text
/cutaway a Kafka topic with six partitions and a consumer group that changes from two to three consumers. Show assignment, offsets, and a simplified rebalance. Expose the difference between ordering within one partition and ordering across the topic. Keep broker replication in a separately openable layer. React components and an HTML preview.
```

### 5. Zero-knowledge proofs

```text
/cutaway a teaching model of a zero-knowledge proof: prover, verifier, private witness, public statement, and verification result. Reveal which information crosses each boundary without revealing the witness. Use a clearly identified toy protocol, state its limitations, and never label the demo as production cryptography. Pure SVG, light theme.
```

### 6. Shared token bucket

```text
/cutaway three edge clients sharing a token bucket through one atomic coordinator. Capacity 12, refill 3 tokens per second, adjustable combined demand. Open the coordinator, step individual seconds, show accepted and throttled requests, and state that network delay and failover are omitted. Standalone HTML, both themes.
```

### 7. Vector index

```text
/cutaway a small HNSW-inspired vector search index with a fixed, visible dataset. Open graph layers and step a query from coarse entry point to local neighbors. Show visited nodes and distance evaluations. Distinguish the educational search procedure from a complete HNSW implementation. Pure SVG with exact distances from one model.
```

### 8. Transformer inference

```text
/cutaway one decoder inference step: embeddings, attention, KV cache, feed-forward network, and output sampling. Open the attention layer and show what the KV cache reuses across tokens. Use toy dimensions printed in the caption and model the displayed quantities. Direct architecture, SVG first, both themes.
```

### 9. Database connection pool

```text
/cutaway ten database connections with fifteen clients. Requests borrow a connection, return it, or wait when the pool is full. Let readers change query duration and inspect queue depth. A physical lending rack is welcome if the mapping stays exact. React/Next.js plus a standalone HTML preview.
```

### 10. Cache hierarchy

```text
/cutaway browser cache, CDN edge, and origin as three openable layers. A fixed request sequence contains hits, misses, and expired entries with TTL 60 seconds. Step requests and show which layers execute work. Export a standalone SVG still and interactive HTML, light and dark.
```

## Mechanical and shader recipes

### 11. Heat exchanger

```text
/cutaway a heat-exchanger espresso machine with the side panel open: boiler, pump, heat-exchanger tube, group head, steam wand, and gauges. Pulling a shot drives water flow and the model's readout. Route every pipe between real ports, audit every crossing, and inspect joints at 4×. SVG, standalone light and dark pages.
```

### 12. Bunsen burner: SVG + WebGL

```text
/cutaway a Bunsen burner whose air collar controls a world-space WebGL flame, from yellow combustion to a blue cone. Keep the burner SVG, register the flame to the barrel, crossfade continuously, and design ink for the light theme. Include a no-WebGL fallback and reduced-motion still. One HTML file per theme.
```

### 13. Ripple tank: SVG + WebGL

```text
/cutaway a ripple tank with two adjustable dippers. SVG for the rig; WebGL for the water and projected caustics, using the same camera. Drive wavelength, phase, and the readout from one stated teaching model. Tune light and dark separately and capture slowed transitions.
```

### 14. Differential: 3D beta

```text
/cutaway a small open differential with one rotating subject. Let readers vary the output speeds and inspect how the carrier relates to them. Re-project and re-shade moving parts each frame, keep the support static, and run the complete orbit and line audits. Standalone HTML, both themes; explain the beta performance limits.
```

## Refine a result

Ask for a specific causal improvement: “Expose the queue while workers are busy,” “Make review wait for every task,” or “Keep the highlighted port visible when the layer opens.” Request the geometry audit, line-end check, phone capture, keyboard pass, reduced-motion state, and 4× joint crops. Ask for WebGL or 3D only when it contributes to the explanation.
