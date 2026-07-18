## Context

`fetchTopStyleExamples(packId, topicEmbedding)` (`contentGeneration.retrieval.ts`) fetches a
resolved style pack's examples (`{content, embedding, engagement_hint}` — `platform` is not even in
the projection today) and ranks them purely by cosine similarity to the topic, top 5. This single
ranked list is computed once per generation request and reused for every requested format
(`contentGeneration.service.ts`'s miss-handling path builds one shared `styleContext` before the
per-format `Promise.all`). `StyleExample.platform` (`'facebook' | 'linkedin' | 'other'`) is captured
at intake (single-add, bulk-import, and seed script all accept it) but has no reader anywhere in the
generation path — the metadata is inert.

`CONTENT_FORMATS` (`contentGeneration.formats.ts`) already models per-format identity (label, kind,
instruction); it has no platform association today, but formats already map cleanly onto platforms
by name (`facebook_post`, `facebook_reel_script`, `linkedin_post`, `caption` — ambiguous, `youtube_idea`
— not a social platform post).

## Goals / Non-Goals

**Goals:**
- Make platform tagging on style examples actually influence which examples are selected for a
  given format's generation.
- Never let a thin per-platform corpus silently produce a worse (empty or near-empty) style block —
  backfill from the rest of the pack rather than filtering strictly.
- Avoid N redundant style-pack DB fetches for an N-format request.
- Zero behavior change for every case that predates this feature: no pack, a format with no platform
  preference, or a pack with no platform-tagged examples.

**Non-Goals:**
- Changing brand-voice example retrieval (team corpora are small and intentionally platform-mixed;
  out of scope per the parent plan).
- Changing prompt structure, block ordering, or the cold-start/pack-resolution rules
  (`style-packs-generation` already shipped these; untouched here).
- Retrieval for `/content/refine` (uses only the style card, no few-shot examples — correctly
  unaffected).
- A general-purpose "platform" concept beyond `facebook`/`linkedin` — `other`/untagged examples stay
  in the backfill tier, not a third preference tier.

## Decisions

### 1. Platform preference lives on the format definition, not a separate mapping table

`ContentFormatDefinition` gains `preferredPlatform?: 'facebook' | 'linkedin'`
(`contentGeneration.formats.ts`). `facebook_post`, `facebook_reel_script`, `caption` → `'facebook'`;
`linkedin_post` → `'linkedin'`; `youtube_idea` → unset. Single source of truth: a future
`instagram_post` format states its own preference in the same place, and nothing outside
`formats.ts` needs to know the mapping exists.

`caption` is deliberately mapped to `'facebook'` rather than left unset: it's currently used
alongside Facebook-family formats in the default set and its register is closer to a Facebook
caption than a LinkedIn one; this is a judgment call, not a hard constraint — easy to revisit if a
LinkedIn-specific caption format is ever split out.

### 2. Two-stage rank: platform matches first (by similarity), then similarity-ranked backfill

New pure function (extends, doesn't replace, the existing ranker so old call sites keep compiling):
`rankStyleExamples(candidates, topicEmbedding, preferredPlatform?, limit = 5)`.
- No `preferredPlatform` → identical to today's behavior (plain similarity sort, top N).
- With a `preferredPlatform` → partition candidates into matches (`platform === preferredPlatform`)
  and the rest; sort matches by similarity, take up to `limit`; if fewer than `limit`, sort the rest
  by similarity and fill the remainder. `platform: 'other'` (or missing/legacy examples with no
  platform stored) always falls in the backfill tier, never the match tier.

Alternative considered: hard-filter to platform matches only, erroring or returning empty when a pack
has none for that platform. Rejected — a pack curated before this change (or one where a curator
simply hasn't tagged consistently) would silently produce a weaker or empty style block for e.g.
LinkedIn, which is worse than today's behavior. Preference-with-backfill guarantees this change can
only improve or match current retrieval quality, never regress it.

### 3. Fetch the pack's examples once per request; rank per format from that shared set

Today's `fetchTopStyleExamples` couples the DB fetch and the ranking in one call, invoked once and
shared verbatim across formats. This change splits it:
- `fetchStylePackExamples(packId): Promise<StyleExampleCandidate[]>` — one DB read, projection now
  includes `platform`.
- `rankStyleExamples(...)` (Decision 2) — pure, called once per requested format inside the existing
  per-format `Promise.all` in `contentGeneration.service.ts`, using each format's
  `CONTENT_FORMATS[format].preferredPlatform`.

This keeps the request's total DB round-trips for style examples at exactly one regardless of how
many formats are requested (matching today's cost), while giving each format its own selection.
`StyleContext` per format is otherwise unchanged (`{ card, examples }` — the card is
format-independent and still computed once).

### 4. Brand-voice examples and fact sheet stay request-level, not per-format

Unaffected by this change — they were already request-level and there's no per-platform signal on
`BrandVoiceExample` to act on. Only the `styleContext.examples` slice moves inside the per-format
loop; `fewShotExamples` (brand voice) and `factSheet` remain computed once and passed unchanged into
every format's `buildMessages` call, exactly as today.

### 5. Refine endpoint is unaffected

`buildRefineMessages` only ever used `styleCard`, never style examples — nothing to change there;
explicitly confirmed as a non-goal above so it doesn't get touched by accident during the service
refactor.

## Risks / Trade-offs

- **[Risk] Restructuring the miss-handling loop to compute `styleContext` per format (instead of
  once, shared) touches a well-tested, already-shipped code path.** → Mitigation: the DB fetch stays
  hoisted (Decision 3) so the only thing moving per-format is a pure, synchronous ranking call — low
  blast radius; existing `contentGeneration.integration.test.ts`/`contentGeneration.prompt.test.ts`
  cases for the no-pack and single-format paths must continue passing unchanged (explicit task).
- **[Risk] `caption`'s platform assignment (Decision 1) is a judgment call that could be wrong for
  some curators' mental model.** → Mitigation: low cost to revisit — it's one field in one object
  literal, not a schema or API change.
- **[Trade-off] Backfill tier does not itself get a "how many were true matches" signal into the
  prompt** (the model isn't told which examples were platform-matched vs. backfilled). → Accepted:
  the vision's goal is better-fitting examples, not prompt transparency about retrieval internals;
  revisit only if bake-off review (change 9C) shows the model needs that signal.

## Migration Plan

No data migration. Existing `StyleExample` documents already carry `platform` (default `'other'`
where unset) from the original model; nothing needs backfilling. Purely additive/refactor code
change — safe to roll back by reverting if the bake-off (9C, once it runs) somehow shows a quality
regression, though the backfill design makes a regression unlikely (worst case, output is
observationally identical to pre-change for untagged/no-preference cases, per Decision 2).

## Open Questions

- None blocking. Whether platform-matched retrieval measurably improves generated output quality is
  exactly what change 9C's bake-off (once real corpora exist) is for — this change ships the
  mechanism; 9C is where its value gets measured against real data.
