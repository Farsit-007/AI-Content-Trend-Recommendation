## Context

Verified against the current code: `StyleExample.embedding` is always computed from the raw
`content` field — `addExample` (`stylePack.service.ts`) calls `embed(payload.content)`,
`addExamplesBulk` calls `embedBatch(survivors.map(item => item.content))`, and
`scripts/seedStylePack.ts` does the same via `embedBatch`. `rankStyleExamples`
(`contentGeneration.retrieval.ts`) then does plain cosine similarity between a topic embedding
(usually `embed(payload.topic)`, itself often an English-leaning news headline when generation is
triggered from a feed item) and each example's stored embedding. No calibration or sanity check has
ever been run on this — `verify:style-pack-retrieval` exists exactly to do that 2-minute eyeball
check but has never been pointed at a real corpus with a recorded verdict (Gate G1).

## Goals / Non-Goals

**Goals:**
- Provide a ready, tested fallback embedding strategy for the specific failure mode Gate G1 exists
  to detect (poor cross-lingual — English topic vs. Bangla example — retrieval quality), so if that
  verdict ever comes back negative, the fix is a config flip plus a migration run, not a design
  effort under pressure.
- Keep retrieval logic (`rankStyleExamples`) completely untouched — this only changes what text gets
  embedded at write time, not how similarity is computed or ranked.
- Make partial-migration states safe and inspectable via the `embedding_source` marker, so a pack
  half-migrated (some examples re-embedded, some not) never silently produces confusing results —
  the marker tells you exactly what happened to each row.
- Zero behavior change when off (default).

**Non-Goals:**
- Actually determining whether Bangla retrieval quality is a real problem — that's Gate G1 itself
  (`npm run verify:style-pack-retrieval` against a real Track-0 pack, human eyeball, recorded
  verdict), explicitly out of scope for this change per the parent plan ("Do not propose this unless
  G1 fails" — this change is being built ahead of that check, at explicit request, not in place of
  it).
- Changing `EMBEDDING_MODEL` itself, or any embedding strategy for `BrandVoiceExample` or
  `NewsItem` — explicitly scoped to `StyleExample` only (parent plan design.md decision 2: brand-voice
  corpora are small and same-language-leaning; news-item embeddings are load-bearing for the
  calibrated 0.88 semantic-dedup threshold and must not shift).
- Automatically re-embedding on every pack read or on a schedule — migration is an explicit,
  human-triggered script run, matching every other one-off migration in this codebase.
- A UI toggle for the flag — same reasoning as `style-fidelity-critique-pass`'s
  `CONTENT_CRITIQUE_ENABLED`: an operational config value, not a per-request or per-team choice.

## Decisions

### 1. One config flag governs new-example embedding strategy; migration is a separate explicit step

`STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY` (env, default `false`) gates whether `addExample`,
`addExamplesBulk`, and `seedStylePack.ts` extract-and-embed-a-summary vs. embed raw content, for
**newly created** examples only. Flipping the flag does not retroactively touch existing rows — the
migration script (Decision 4) is the only thing that changes already-stored embeddings, run
explicitly and separately. This mirrors `style-fidelity-critique-pass`'s config pattern exactly (one
boolean, default off, `.env.example` documents the evidence-gating rationale) for consistency across
this plan's changes.

### 2. Summary extraction is a small, cheap, soft-failing LLM call

`extractTopicSummary(content: string): Promise<string | null>` (`stylePack.service.ts` or a new
`stylePack.embeddingStrategy.ts` peer file, mirroring the module's existing one-concern-per-file
convention): one `chatCompletion` call (`LLM_MODELS.standard` — matches the existing "cheap,
structured output" role already used for style-card generation in this same module; not
`LLM_MODELS.content`, which is reserved for creative writing), fixed instruction: "In 1-2 sentences,
in neutral English, summarize the topic and subject matter of this social media post — not its
tone or language, just what it's about." Returns `null` (not a thrown error) on any API failure or an
empty/degenerate response, so the caller's soft-fail path (Decision 3) has a clean signal to act on.

### 3. Soft-fail to today's behavior, with the marker recording which path was taken

```
const embedding_source = flagEnabled ? (summary ? 'topic_summary' : 'content') : 'content';
const embeddingInput = embedding_source === 'topic_summary' ? summary! : content;
```

If the flag is on but extraction returns `null` (API error, empty response), the example still gets
created successfully — embedded from raw content, marked `embedding_source: 'content'` — exactly
today's behavior for that one row. This means enabling the flag can only ever match or improve
reliability, never make example creation less robust; a spike in OpenRouter errors degrades
gracefully to "some examples embedded the old way this batch," not a failed import.

### 4. Migration script: one pack at a time, idempotent via the marker, uses `embedBatch`

`scripts/migrateStyleExampleEmbeddings.ts` (`npm run migrate:style-example-embeddings -- <slug>`):
loads a pack's examples where `embedding_source !== 'topic_summary'` (idempotent — a second run
processes only rows a first run missed or that failed extraction), extracts a summary per example
(sequential — this is a low-volume, one-off operation per pack, not a hot path; no need for the
concurrency machinery `newsIngestion.contentFetch.ts` uses for hundreds of items), embeds the
successfully-extracted summaries in one `embedBatch` call, updates those rows'
`embedding`/`topic_summary`/`embedding_source`. Rows whose extraction failed are left untouched
(still `embedding_source: 'content'`, still fully functional for retrieval) — a re-run picks them up
whenever OpenRouter cooperates.

### 5. `verify:style-pack-retrieval` gains the marker in its output, not new logic

The existing script already does exactly the right check (embed a topic, cosine-rank examples,
print top-5, ask for a human verdict). The only change: print each printed example's
`embedding_source` alongside its score, so a reviewer running this *after* a migration can see at a
glance whether the ranking improvement (if any) correlates with which examples were re-embedded —
critical for actually answering "did this fix it" rather than just "did retrieval change."

## Risks / Trade-offs

- **[Risk] Summarization is itself an LLM call with its own failure modes** (hallucinated summary,
  wrong language, missing the actual topic). → Mitigation: the summary is persisted
  (`topic_summary`) precisely so a curator can spot-check it against the original post; a visibly
  bad summary is a signal to disable the flag for that pack, not silently trusted.
- **[Trade-off] Two embedding strategies coexisting in one pack (during/after partial migration)
  means retrieval quality could be inconsistent within a single ranking pass** (some examples ranked
  by content-embedding, others by summary-embedding, compared against the same topic-embedding
  query). → Accepted as a transitional state only — Decision 4's migration script is designed to be
  run to completion per pack (re-run until 0 rows remain `embedding_source: 'content'` other than
  genuine extraction failures), and the marker makes this state visible rather than a silent
  footgun.
- **[Risk] This is speculative engineering against an unconfirmed problem** (G1 has never actually
  failed — it's never even run). → Explicitly accepted per the proposal's own framing: shipped ahead
  of evidence at explicit request, kept small and inert (one flag, one migration script, no change
  to retrieval logic itself) specifically so the speculative cost is low if G1 turns out fine and the
  whole feature never gets used.

## Migration Plan

New optional fields (`embedding_source`, `topic_summary`) — existing `StyleExample` documents get a
lean backfill (`updateMany({ embedding_source: { $exists: false } }, { $set: { embedding_source: 'content' } })`,
mirroring the established `lifecycle` backfill pattern in `newsRetention.service.ts`) so every row
has an explicit value from day one rather than treating "field absent" as an implicit third state.
The re-embedding migration itself (Decision 4) is opt-in and per-pack, run only when/if Gate G1
evidence justifies it. Rollback: setting the flag back to `false` stops new examples from using the
summary strategy; already-migrated examples keep working fine for retrieval either way (cosine
similarity doesn't care which strategy produced a stored vector) — no forced rollback of embedded
data is ever needed.

## Open Questions

- Whether this is ever actually needed depends entirely on Gate G1, which remains unresolved and is
  explicitly out of this change's scope (see Non-Goals). This change's own "verification" is
  necessarily scoped to proving the mechanism works correctly in isolation (flag on/off behavior,
  soft-fail, migration idempotency) — not proving Bangla retrieval was actually broken, which no one
  has established.
