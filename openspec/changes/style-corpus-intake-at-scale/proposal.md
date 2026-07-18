## Why

The `StylePack`/`StyleExample` RAG (shipped in `style-packs-foundation` + `style-packs-generation`) can only
be loaded one example at a time via the super-admin UI, or via a CLI seed script that embeds examples one
HTTP call each and has no de-duplication beyond exact-match. Building a real writer corpus — the vision's
"different tones of popular bangla tech writers", 30-100 real posts per pack — needs a curator (not
necessarily a developer with shell access) to import a batch of posts in one action, and needs visibility
into whether a pack's `style_card` is still representative of its current examples. Neither exists today:
the style-card generator is CLI-only with no record of when/from-what it was generated, so there's no way to
tell a stale card from a fresh one without re-reading it. This change makes corpus intake practical at the
scale the vision requires, without which the writer-style RAG stays populated with a handful of hand-pasted
examples indefinitely.

## What Changes

- Add `POST /style-packs/:id/examples/bulk` (super_admin) — accepts the same JSON array shape as the
  existing seed file (`[{ content, platform?, source_ref?, engagement_hint? }]`), capped at 100 items per
  call, embeds all survivors in one `embedBatch` call (not one HTTP call per item), skips items whose
  whitespace-normalized content already exists in the pack or earlier in the same batch, and returns
  `{ created, skipped, total }`.
- Add `POST /style-packs/:id/generate-card` (super_admin) — runs the style-card generation synchronously
  and persists `style_card` plus new metadata `style_card_generated_at` and `style_card_example_count`, so
  staleness (current example count vs. count-at-generation) becomes derivable by any reader of the pack.
- Extract the style-card generation logic (sampling, the fixed analysis prompt, the LLM call) out of
  `scripts/generateStyleCard.ts` into the `StylePack` service, so the CLI script and the new endpoint share
  one implementation and can never drift.
- Update `scripts/seedStylePack.ts` to use the same `embedBatch` + whitespace-normalized-dedup rule as the
  new bulk endpoint, replacing its current one-`embed()`-call-per-item, exact-match-only behavior.
- Frontend (`frontend/src/pages/dashboard/admin/StylePacks.tsx`): add a bulk-import control (paste/drop a
  JSON array) that calls the bulk endpoint and reports created/skipped counts, and a style-card panel per
  pack showing the card text, when/from-how-many-examples it was generated, a "stale" indicator, and a
  "Regenerate card" button.
- Fold in a one-line, unrelated-capability bug fix while touching this job's neighborhood: add
  `lifecycle: 'active'` to the `NewsItem` query in `generatedContent.job.ts`'s auto-generation selection —
  today it can still draft content from an item already archived as a finished trend, because the query was
  never updated after the `lifecycle` field was added by the retention change.

## Capabilities

### New Capabilities
(none — this change extends the existing `style-packs` and `content-generation` capabilities; see Modified below)

### Modified Capabilities
- `style-packs`: adds bulk example import and a style-card generation/staleness-metadata capability to the
  existing pack/example CRUD requirements.

## Impact

- **Backend:** `backend/src/app/modules/StylePack/` (interface, model, validation, service, controller,
  route), `backend/src/scripts/generateStyleCard.ts` (becomes a thin wrapper), `backend/src/scripts/seedStylePack.ts`
  (dedup/embedBatch rewrite), `backend/src/app/modules/GeneratedContent/generatedContent.job.ts` (one-line
  filter fix), `backend/src/app/docs/stylePackPaths.ts` + `schemas.ts`.
- **Frontend:** `frontend/src/pages/dashboard/admin/StylePacks.tsx`, `frontend/src/lib/api/stylePacks.ts`.
- **Tests:** `backend/src/__tests__/stylePack.integration.test.ts` (new cases), a new/extended
  `generatedContent.job.integration.test.ts` case for the lifecycle fix.
- **No breaking changes** — new endpoints are additive; existing single-example add, pack CRUD, and CLI seed
  script usage remain unchanged in shape (only their internal de-dup/embedding strategy improves).
