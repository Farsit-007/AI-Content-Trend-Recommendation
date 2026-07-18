# Design — Bangla Authenticity Close-Out

## Context

All machinery shipped in earlier changes (`style-corpus-intake-at-scale`,
`bangla-quality-bakeoff-harness`, `style-fidelity-critique-pass`,
`style-example-topic-summary-embeddings`); this change is mostly data collection and gate
execution, with one small code deliverable (language-fidelity regression test). The 2026-07-18
session already fixed the mechanical language bug (style examples overpowering the `Language:`
instruction) via a prompt-level dominance clause — the test here pins that behavior.

## Goals / Non-Goals

**Goals:**
- Real corpus in place; gates run once, honestly, and recorded where the decision records already
  expect them.
- A permanent automated guard against wrong-language output.

**Non-Goals:**
- No new retrieval/prompting machinery; no model fine-tuning; no scraping automation (manual
  copy-paste of public posts is acceptable and keeps the ethics posture reviewable).

## Decisions

1. **Bulk-import UI over seed scripts as the primary intake path** — it's what a non-engineer
   curator can use, and it exercises the same embedding pipeline. Seed scripts remain the fallback
   for very large files.
2. **Run G1 before G3.** If retrieval ranks the corpus badly, G3's style-fidelity scores would
   conflate retrieval failure with model failure. G1 is 30 minutes; sequence it first.
3. **Bake-off candidates: current free default + 1–2 free alternatives + 1 cheap paid model.** The
   paid model is the quality ceiling reference so "free tier is good enough" is a measured claim,
   not hope. Model application is a UI action (task default), not an env edit — the env tier no
   longer exists.
4. **Language-fidelity test asserts at the prompt layer, not via live LLM calls** — deterministic
   and free: build messages with a Bangla pack + `language: 'english'` and assert the dominance
   clause and correct `Language:` line are present; plus the refine contract's language-preservation
   line. Live spot checks stay manual.

## Risks / Trade-offs

- [Native reviewer availability] → the rubric is written for a single reviewer minimum; two is
  better (the process doc covers disagreement handling).
- [Free-model daily quota interrupts the bake-off] → run with a second OpenRouter key configured
  (key failover), or schedule the run right after quota reset.
- [Copyright/consent concerns over stored posts] → posture already documented (internal-only,
  `source_ref` audit trail, removal on request); keep it.

## Migration Plan

No deploy risk — data + docs + one test. Reversible by deactivating packs.

## Open Questions

- Which 3–5 writers/pages to license as launch styles (product/ethics call; `programming-hero`
  first per the original vision).
