# Infinite Knob — Evolution

> The instrument is complete. This is how it grows.

The core is done: one sound, one knob, words transform it. Everything below is additive — each phase makes the instrument feel more alive, more responsive, more its own thing. Nothing replaces what's already there.

---

## Phase 1 — Feel

*The instrument already works. This phase makes it feel intentional.*

### Recency bias

Right now all active layers (age 0–2) have equal weight. The last word typed should pull slightly harder — the instrument should feel like it's responding to *you right now*, not averaging your history.

Simple implementation: multiply the newest layer's effective weight by a small constant (e.g. ×1.3). One line change in `computeEffective()`. Disproportionate impact on feel.

### Envelope parameters

The audio param set covers spectrum, space, modulation, and noise — but not time. Attack and decay shape are how a sound feels punchy or soft, tense or relaxed. Adding `attack` (0–1, maps to masterGain attack time) and `decay` (0–1, release tail) would let words like "punchy", "plodding", "nervous" land more accurately.

### Fix the log

The SQLite schema is missing `layer_stack`. Every commit currently drops that column silently. Fix the schema and insert statement — this data is needed for everything in Phase 3.

---

## Phase 2 — Memory

*The instrument starts to know what it has been.*

### Patch library

A named bank of ~20 authored sound states. Not sounds that play — parameter configurations that describe what the sound *is*.

```
warm-pad       { gain:0.7, wave:2, lpf:3000, room:0.4, sub:0.3 ... }
cathedral      { gain:0.5, room:0.9, delay:0.5, lpf:2000, detune:15 ... }
digital-ruin   { crush:0.7, noise:0.4, lpf:900, shape:0.3 ... }
nasal-cry      { lpf:1800, lpq:14, fm:0.2, lfo:2 ... }
supersaw       { detune:180, wave:0, gain:0.8, lpf:8000 ... }
```

These become reference points — destinations the AI can aim trajectories toward, and anchors for the knowledge graph.

### Knowledge graph (v1)

Built from the usage log. Start simple: for each term that has appeared 3+ times, compute:

- average `effectiveParams` at submission
- average `committedPosition`
- variance across sessions

Store this in a new `term_stats` table. This is the seed of the graph — terms as nodes with known sonic character.

### Learned patches

When a term's `effectiveParams` variance is low (users consistently reach the same place) and average `committedPosition > 0.5` (they actually explored it), it crystallises into a learned patch automatically.

The instrument writes its own vocabulary from use.

---

## Phase 3 — Grounded AI

*The AI stops inventing and starts remembering.*

### Context API

```
GET /api/context?term=wailing
→ {
    hitCount: 14,
    avgParams: { lpf: 1800, lpq: 11, room: 0.6 },
    avgPosition: 0.72,
    nearestPatch: "nasal-cry",
    relatedTerms: ["hollow", "aching", "strained"]
  }
```

### Grounded prompts

Before calling GPT, fetch `/api/context`. If prior data exists, inject it:

> *"Users who typed 'wailing' typically reached `{lpf:1800, lpq:11, room:0.6}` at knob position 0.72. Nearest patch: nasal-cry. Related terms: hollow, aching, strained."*

The AI now designs trajectories toward destinations that have been proven to work, rather than inventing from scratch every time. Interpretations become more consistent and more surprising — the instrument has taste.

### Term → term similarity

Add edges between terms whose average `effectiveParams` are close (cosine distance on the param vector). "Wailing" and "aching" are near each other. "Supersaw" and "digital-ruin" are near each other. This lets the context API surface related terms the AI can reference.

---

## Phase 4 — Deeper Representation

*The instrument gets a better model of what sound means.*

### Real embeddings

The current `latent` object is AI-generated dimensional scores — a rough proxy for position in semantic space. Replace or augment with proper embeddings (e.g. CLAP, or a fine-tuned text→audio-param model) so that term similarity is computed on real vectors rather than GPT-estimated dimensions.

This makes the knowledge graph's edges meaningful: "what does this word sound like" becomes a geometric question with a real answer.

### Explicit conflict resolution

Currently, conflicting layers (dark + bright both pushing `lpf` in opposite directions) cancel out by arithmetic. This is correct but accidental. With real embeddings, conflict can be detected explicitly and resolved intentionally — blending the semantic vectors first, then designing a trajectory toward the blend.

Dark + bright becomes not cancellation but a real in-between state: neither dark nor bright, something else entirely.

### Richer audio model

More transform dimensions the current engine can't reach:

- **Envelope** — attack shape, decay tail (see Phase 1)
- **Pitch** — fundamental frequency as a semantic axis (tense = slight sharp, heavy = slight flat)
- **Stereo width** — beyond pan; true M/S processing
- **Spectral tilt** — a single param sweeping the full spectral balance curve

Each addition expands what words can mean.

---

## Phase 5 — The Instrument Teaches Itself

*The boundary between authored and learned dissolves.*

### Self-authored patches

Phase 2 crystallises patches from usage. Phase 5 lets the instrument *refine* them. When a learned patch is triggered by many different terms, it finds what those terms share — and can suggest a new name for itself.

A patch that keeps getting reached by "hollow", "aching", "far away" might name itself "longing".

### Cross-session vocabulary

The knowledge graph currently reflects one user's usage. Opening it to aggregate across sessions (anonymised) means the instrument's vocabulary is shaped by everyone who has played it. Certain terms stabilise — their sonic meaning becomes shared, settled, reliable.

Other terms stay unstable — their meaning genuinely varies person to person. The instrument can know the difference.

### The instrument as collaborator

With a stable vocabulary and grounded AI, the instrument can begin to suggest. Not autocomplete — something subtler. If you type "vast", the context API knows what terms people follow "vast" with. The instrument doesn't show you this. But the AI's trajectory for the next word is quietly informed by where conversations like this one have gone before.

---

## What doesn't change

- One sound. One knob. One input.
- No parameter names ever visible.
- No instrument identity — only character.
- The knob is always intensity over the current semantic stack. Always.

The interface stays minimal forever. All the complexity lives underneath.
