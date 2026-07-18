## Why

Style examples are tagged `platform: 'facebook' | 'linkedin' | 'other'` at intake time
(`style-corpus-intake-at-scale` and the original `StyleExample` model both capture this), but
generation ignores the field entirely — `fetchTopStyleExamples` ranks a pack's examples by topic
similarity alone, so a LinkedIn-register post can just as easily surface as a few-shot example when
generating a Facebook post as when generating LinkedIn content. This flattens exactly the register
difference a curated pack exists to capture (energetic/casual Facebook copy vs. more restrained
LinkedIn copy), and wastes metadata curators are already asked to provide. Once real writer corpora
are loaded (the parent plan's Track 0), this gap becomes visible in generated output, not just in
theory.

## What Changes

- Add an optional `preferredPlatform` to each content format's definition
  (`contentGeneration.formats.ts`): `facebook_post`, `facebook_reel_script`, and `caption` prefer
  `'facebook'`; `linkedin_post` prefers `'linkedin'`; `youtube_idea` has no preference.
- Style example retrieval becomes platform-aware: for a format with a preferred platform, examples
  tagged with that platform are ranked first (by topic similarity), and only backfilled with the
  pack's other examples (by similarity) if there are fewer than the retrieval limit (5) platform
  matches. A format with no preference, or a pack where no example carries a matching platform tag,
  degrades to today's pure-similarity ranking — no behavior change in either case.
- The pack's examples are fetched from the database once per generation request (not once per
  format) and platform-aware ranking runs per requested format against that shared in-memory set —
  avoiding N redundant DB round-trips for an N-format request while still letting each format get
  its own ranked selection.
- No change to brand-voice example retrieval, refine, prompt structure/ordering, or the style-pack
  resolution/cold-start rules already shipped in `style-packs-generation` — this only changes which
  examples are selected once a pack has already resolved.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `content-generation`: style example retrieval gains platform-aware ranking within an existing
  requirement's scope (no new endpoint, no request/response shape change).

## Impact

- **Backend:** `backend/src/app/modules/ContentGeneration/contentGeneration.formats.ts`,
  `contentGeneration.retrieval.ts`, `contentGeneration.service.ts`.
- **Tests:** `contentGeneration.retrieval` unit coverage (new/extended), `contentGeneration.integration.test.ts`.
- **No breaking changes** — purely a ranking-quality change inside an existing code path; the
  `POST /content/generate` request/response contract is unchanged, and behavior is byte-identical
  for any pack whose examples aren't platform-tagged or for formats with no platform preference.
