# Progressive-Trend Dedup — Telling Updates Apart from Duplicates

**Date:** 2026-07-16
**Parent doc:** [NEWS-PIPELINE-ANALYSIS.md](./NEWS-PIPELINE-ANALYSIS.md)
**Covers reported problem:** (4) A trending story evolves — "Fable released" → "Fable banned for some days" → "Fable made public again" — and the follow-up posts look like duplicates to semantic dedup but actually carry material updates. How do we keep true duplicates out while letting progressive updates through?

---

## 1. Where exactly the update gets killed (verified)

The follow-up blog post has a **new URL**, so it survives Layer 2 hash dedup (`content_hash = sha256(source:url)`, `newsIngestion.utils.ts:14-15`). It dies at Layer 2b, `dedupeSemantic` (`newsIngestion.utils.ts:58-82`):

```ts
if (recentPool.length > 0 && Math.max(...recentPool.map((e) => cosineSimilarity(item.embedding, e))) >= threshold) {
  continue;   // ← unconditional drop, no second look
}
```

Any candidate whose embedding is ≥ `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD` (0.88) cosine-similar to *anything stored in the last 72 h* is discarded outright. "Fable banned" embeds extremely close to "Fable released" — same product name, same domain vocabulary, mostly-shared context with a few changed words — so it lands above 0.88 and is dropped. The trend's most newsworthy moment (the reversal) never reaches the feed.

## 2. Why threshold tuning cannot fix this (evidence)

This threshold has already been calibrated once, and the calibration data proves the bands overlap:

- Original design guessed **0.93**. Live verification (`backend/src/scripts/verifySemanticDedupLive.ts`, run against the real `openai/text-embedding-3-small` model) showed a **genuine same-story cross-source paraphrase scored 0.8992** — a true duplicate *below* 0.93. The threshold was lowered to 0.88 to catch it (unrelated items scored ~0.14, so 0.88 looked safe at the time). Documented in `openspec/changes/filter-pipeline/design.md`.
- A progressive update ("Fable banned" vs "Fable released") shares more surface vocabulary with its predecessor than two independent paraphrases of the same event share with each other. Its similarity lands in roughly the same **0.88–0.97** region as true duplicates.

So: true duplicates live at ~0.89–0.99, and material updates live at ~0.88–0.97. **The distributions overlap; no scalar threshold separates them.** Raising the threshold re-admits the cross-source duplicates that 0.88 was specifically chosen to catch; keeping it kills updates. Cosine similarity measures *topical sameness*, and an update is — by definition — topically the same but *informationally* different. Distinguishing "same information" from "same topic, new information" requires reading the content, not measuring its direction in embedding space.

## 3. Design: two-band dedup with LLM adjudication + story chains

Replace the single unconditional threshold with three regions:

```
cosine vs best stored/accepted match
├── < 0.88                  DISTINCT   → pipeline continues unchanged (today's behavior)
├── 0.88 – 0.97  GRAY BAND  ADJUDICATE → batched LLM compares candidate vs matched item:
│                                         verdict ∈ duplicate | update | distinct
│                                         • duplicate → drop, merge engagement into stored item
│                                         • update    → store, linked to the story chain (§4)
│                                         • distinct  → store normally (false-positive rescue)
└── ≥ 0.97       HARD DUP   DROP       → near-verbatim; drop + merge engagement.
                                          No LLM call — verbatim copies don't need a judge.
```

Config: `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD=0.88` keeps its meaning (floor of the gray band); new `NEWS_INGESTION_HARD_DUP_THRESHOLD=0.97` (ceiling). Both re-calibrated per §7 before launch.

### 3.1 The adjudication call

Extend the gray-band path in `dedupeSemantic`'s two match cases (recent-pool match and in-run match). For each gray-band pair, collect `{candidate: {title, snippet, published_at, source}, matched: {title, snippet, published_at, source}}` and adjudicate in batches, following the existing categorization pattern (`newsIngestion.categorize.ts` — batches of 10, strict-JSON prompt, per-batch fallback):

```
System: You judge pairs of tech news items. For each pair decide:
- "duplicate": both describe the SAME event/announcement with no new information
  (paraphrase, cross-post, syndication).
- "update": same ongoing story, but the newer item contains a MATERIAL development
  the older one does not (status change, reversal, new release, ban/unban, new numbers).
- "distinct": different stories that merely share a topic.
Respond ONLY a JSON array: [{ "id": <n>, "verdict": "duplicate"|"update"|"distinct",
"note": "<one short sentence>", "confidence": <0-1> }].
```

- Model: `LLM_MODELS.standard` (same cheap model as categorization; this is a short classification task).
- Only *gray-band pairs* are sent — with the pipeline's current volumes (dozens of candidates/run, of which a handful match the pool at all) this is typically **0–2 batches per run**. Cost is bounded by construction: it can never exceed `candidates_in_gray_band / 10` calls.
- Pass `published_at` for both items so the model knows which is newer; the *pair ordering* (which is "old", which is "new") must be explicit in the prompt because the stored match is not always older than the candidate within a single run.

### 3.2 Failure discipline (the "no silent loss" rule)

Mirrors `fallbackCategorize` (`newsIngestion.categorize.ts:22-28`): if the adjudication call fails, times out, or returns unparseable JSON, the fallback verdict is **`update` with `confidence: 0` → keep the item, flag `needs_review: true`**. Rationale:

- A false *keep* costs one redundant feed item that a human (or the next retention pass) removes.
- A false *drop* silently loses news forever — the exact failure mode this whole document exists to eliminate.
- Infrastructure failure must degrade toward the recoverable error. (Same principle the categorizer already follows: parse failure never masquerades as an AI judgment.)

Low-confidence real verdicts (`confidence < 0.5`) also set `needs_review: true` but honor the verdict.

### 3.3 Engagement merge on `duplicate` and hard-dup drops

Today a dropped duplicate's engagement evidence evaporates. A story hitting HN *and* Lobsters *and* Reddit simultaneously is a stronger trend signal than any single posting — the duplicate drop should record that:

- On drop, push the duplicate's `{source, points, comments, url}` into the stored item's new `corroborations: [...]` array and recompute the stored item's `current_trend_score` counting corroboration engagement (feeds the decayed-trend model in [Retention §4](./NEWS-PIPELINE-RETENTION.md)).
- This replaces (and generalizes) the current in-run tie-break that keeps only the higher-engagement copy (`newsIngestion.utils.ts:75-79`): the kept item now *absorbs* the loser's signal instead of discarding it.
- Caveat: cap `corroborations` at ~10 entries per item; a syndicated wire story can appear in 50 feeds.

## 4. Story chains (`story_id`)

An `update` verdict creates a **chain**, so the feed can show the trend's evolution ("Fable released → banned → restored") instead of three seemingly unrelated cards:

**Schema additions (`newsItem.model.ts` / `newsItem.interface.ts`):**

```ts
story_id:    { type: Schema.Types.ObjectId, index: true },  // shared by all chapters; equals the root item's _id
story_seq:   { type: Number },                              // 1, 2, 3… position in chain
supersedes:  { type: Schema.Types.ObjectId },               // the specific item this one updates
update_note: { type: String },                              // the adjudicator's one-sentence "what changed"
corroborations: [{ source: String, points: Number, comments: Number, url: String }],
```

**Write path on `update`:** if the matched item has no `story_id`, set both items' `story_id` to the matched item's `_id` (root); the new item gets `story_seq = matched.story_seq + 1` (root backfilled to 1), `supersedes = matched._id`, `update_note` from the adjudicator.

**Read path (feed):**
- Default feed query groups by story: show the **latest chapter** as the card, with a "story timeline" affordance (chapter count badge → expandable list of prior chapters with their `update_note`s). Backend: for items with `story_id`, return only `max(story_seq)` in the main list (aggregation `$sort story_seq desc` + `$group $first`, or a `is_latest_chapter` boolean maintained on write — recommended, since the write path already touches both rows and a boolean keeps the hot query index-only) and attach `story: [...]` with the siblings.
- Older chapters get `is_latest_chapter: false` on the same write that inserts the new chapter — one `updateOne` on the superseded item.

**Interaction with retention (critical, see [Retention §5](./NEWS-PIPELINE-RETENTION.md)):** a story is retired as a unit. The retention job must not archive chapter 1 while chapter 3 still trends — the protection rule is "skip items whose `story_id` has any active member above the trend floor." Conversely, when the *whole* story goes cold, all chapters archive together, and tombstones cover every chapter's hash.

**Edge cases:**
- **Chain forks:** two different updates both matching chapter 2 in the same run. The in-run dedup already compares candidates against accepted items; if both survive adjudication as `update`, both join the chain with consecutive `story_seq` (ordered by `published_at`). A genuine fork (two simultaneous distinct developments) is rare and rendering them as sequential chapters is an acceptable simplification — do not build a tree.
- **Transitive drift:** chapter 4 may be < 0.88 similar to chapter 1 (story drifted) but ≥ 0.88 to chapter 3 — chains handle this naturally since matching is against the *nearest* stored chapter, which is exactly `dedupeSemantic`'s existing best-match behavior.
- **Cross-source updates:** "Fable banned" from HN updating "Fable released" from dev.to works with zero extra code — the recent pool is already cross-source by design.
- **Recent-pool metadata:** `fetchRecentEmbeddings` (`newsIngestion.utils.ts:46-49`) currently returns bare embeddings. It must now return `{_id, embedding, title, snippet, published_at, story_id, story_seq}` so the adjudicator has text to compare and the write path knows what it matched. Same single query, wider projection — no extra round-trip.

## 5. GitHub Trending re-appearance is the degenerate case of this feature

A repo re-entering trending is "the same story with new numbers" — an update with an *identical URL*, which means it's caught earlier, at **hash** dedup, not semantic dedup. Handle it there: when `dedupeAgainstStored` finds an existing hash for a `github_trending` item, refresh the stored item's `raw_stars_delta`/engagement history instead of plain-skipping (hook already described in [Sources §A.3.3](./NEWS-PIPELINE-SOURCES.md)). No LLM needed — same URL plus new engagement is unambiguous. This also generalizes to any source where the same URL legitimately re-surfaces with new engagement (Mastodon trending links, HN re-submissions of the same URL).

## 6. What NOT to build (considered and rejected)

- **Second embedding of the "diff":** embedding only the parts of the new snippet not in the old one — brittle (snippets are truncated at 500 chars, `reddit.ts:33`), and diffing prose with string ops produces garbage. The LLM read is strictly better and barely more expensive at gray-band volumes.
- **Entity extraction + event-state machines** (track "Fable" entity, model release/ban/unban states): the "right" IR answer and massive overkill — an unbounded taxonomy of event types, an NER dependency, and weeks of work to beat a 10-line prompt on a task the cheap LLM already does well.
- **Dropping semantic dedup and keeping only hash dedup:** re-opens the cross-source duplicate flood that 0.88 was calibrated to stop (HN + dev.to + Reddit all carrying the same story would each appear).
- **Per-pair human review queue as the primary mechanism:** `needs_review` exists as the *fallback*, not the pipeline — a growth team won't triage dedup pairs 8×/day.

## 7. Calibration & verification plan

The existing live-verify script is the tool for this — extend, don't replace (`backend/src/scripts/verifySemanticDedupLive.ts`, run via `npm run verify:semantic-dedup-live`; it was built precisely to re-tune thresholds against the real embedding model).

1. **Build a labeled pair set (~30–40 pairs, hand-written, checked into the script):**
   - ~10 true duplicates (paraphrase, cross-post, syndicated copy),
   - ~15 progressive updates covering the reported classes: status reversal (banned/unbanned), version release ("v2 released" after "v2 announced"), metric update ("raises $10M" → "valuation confirmed at $80M"), follow-up analysis,
   - ~10 same-topic-different-story pairs (two different AI model releases the same week).
2. **Measure the similarity distribution per class** against the live embedding model → set `HARD_DUP_THRESHOLD` where the update class's distribution ends (expected ≈ 0.97; use the max observed update similarity + margin). If any true update scores above every true duplicate, that pair goes into the prompt as a few-shot example instead of forcing the threshold up.
3. **Measure adjudicator accuracy** on the gray-band pairs with `LLM_MODELS.standard`. Target ≥ 90% on duplicates (false "update" = one redundant card — cheap) and ≥ 95% on updates (false "duplicate" = lost news — expensive; this asymmetry is the acceptance bar). If the cheap model misses updates, escalate only the low-confidence verdicts to `LLM_MODEL_CONTENT` — a two-tier judge — before considering a bigger default model.
4. **End-to-end scenario test** (automatable in the script): ingest "X framework released" → run pipeline with a paraphrase (expect: dropped, corroboration recorded) → run with "X framework banned from npm" (expect: stored, `story_id` chained, `story_seq=2`) → run with the paraphrase of the ban (expect: dropped against chapter 2).
5. **Re-run the whole set whenever `EMBEDDING_MODEL` changes** — thresholds are model-specific (master doc §5.3).

## 8. Caveats

1. **Latency:** adjudication adds one LLM round-trip layer to the ingestion run for gray-band items only. The run is a background cron (`0 */3 * * *`) — tens of seconds of added latency is irrelevant; still, cap adjudication at ~5 batches/run and fall back per §3.2 beyond that.
2. **Cost:** bounded at gray-band volume (§3.1). Monitor via the run history (`ingestion_runs` gains `adjudicated`, `verdict_duplicate/update/distinct` counters — Sources doc §C.1) so cost drift is visible.
3. **Prompt drift / model swap:** verdict quality is prompt+model dependent. The labeled pair set (§7.1) doubles as a regression suite — re-run after any change to `LLM_MODEL_STANDARD` or the prompt.
4. **Snippet quality ceiling:** adjudication reads title + snippet (≤ 500 chars), not full articles. A buried-lede update (identical title, update in paragraph 6) can be misjudged as duplicate. Accept this initially — the engagement-corroboration path (§3.3) still boosts the story, and full-article fetching is a separate feature with its own scraping/ToS surface. Revisit only if the §7 test set shows real misses.
5. **Ordering inside one run:** `dedupeSemantic` is greedy and order-dependent (items iterate in adapter order). With chains this becomes visible: whichever chapter arrives first becomes the comparison anchor. Sort candidates by `published_at` ascending before the dedup loop so chains build in chronological order deterministically.
6. **Feed/API contract change:** grouped-story responses (`story: [...]`, `is_latest_chapter`) change the news-list payload shape. Frontend feed components (`frontend/src/components/feed/`) and the mock data (`frontend/src/lib/mock/news.ts` — keep until after demo per CLAUDE.md) need coordinated updates; version the API response additively (new fields only, no removals) so the current UI keeps working before the timeline UI ships.

## Acceptance checklist

- [ ] Labeled pair set (§7.1) committed into the extended verify script; threshold + judge accuracy numbers recorded in the script output
- [ ] End-to-end release→ban→restore scenario passes against live DB/LLM (§7.4)
- [ ] True-duplicate protection regression: the original 0.8992 cross-source pair from the first calibration still gets dropped (as `duplicate`, now with corroboration recorded)
- [ ] LLM outage drill: adjudication with the LLM mocked to fail keeps all gray-band items with `needs_review: true`; zero items dropped
- [ ] Feed shows a chained story as one card with a timeline; archived stories archive as a unit (joint test with Retention doc checklist)
- [ ] Run history shows adjudication counters; cost per run stays within the §3.1 bound
