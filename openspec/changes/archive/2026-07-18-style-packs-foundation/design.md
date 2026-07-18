## Context

Today's brand-voice RAG (`BrandVoiceExample/*`) is strictly per-team: a team's own past posts, embedded and ranked for few-shot retrieval. The vision wants a second, *shared* layer — curated named writer styles (e.g. `programming-hero`) that any team can opt into, so output reads in a specific human writer's register rather than a generic AI voice. That composition (pack + team examples together) is 6B's job; this change only builds the corpus, its CRUD surface, team linkage, and the curation tooling a human needs to populate and sanity-check it.

The existing `BrandVoiceExample` module (interface/model/validation/controller/service/route, one file each) is the structural template to mirror. `requireSuperAdmin` already exists and gates `PlatformCatalog` mutations the same way packs need to be gated — packs are curated, system-wide vocabulary, not team data. `embed()` and the 1536-dim Mongoose validator pattern are copied verbatim from brand-voice example creation.

## Goals / Non-Goals

**Goals:**
- A `style_packs` + `style_examples` data model that supports many packs, each with 30-100 examples, without bloating any single document.
- CRUD API: super_admin-only mutations, any-authenticated-user reads (the Generate UI must list packs before 6B wires them in).
- Safe team linkage (`default_style_pack_id`) that tolerates a pack being deleted or deactivated later without breaking team reads/writes.
- Human curation tooling: idempotent bulk import and a retrieval-quality sanity script, since whether embeddings rank Bangla content sensibly is a judgment call, not something a unit test can assert.

**Non-Goals (explicitly deferred to 6B):**
- Any change to `POST /content/generate`, retrieval, or prompt construction.
- Style-card *generation* (the LLM analysis script) — `style_card` is just a plain optional string field in this change; a human may hand-write one, or leave it empty until 6B ships the generator.
- Per-format/platform-aware retrieval preference — the `platform` enum on examples is captured now so the corpus doesn't need re-tagging later, but nothing reads it yet.
- Public attribution of source writers (packs are internal style references only).

## Decisions

1. **Two collections, not embedded arrays.** `style_packs` (small, metadata-only) and `style_examples` (`style_pack_id` indexed, one document per example). Embedding 30-100 examples × ~1-3KB text + a 1536-float vector each directly inside the pack document would blow past sensible Mongo document sizes and make example-level CRUD (add one, delete one) awkward. This mirrors why `BrandVoiceExample` is its own collection rather than embedded on `Team`.

2. **Global scope — no `team_id` on packs or examples.** The entire point is a shared, curated corpus; team-specific-ness enters only through `Team.default_style_pack_id` (this change) and, in 6B, a per-request override. This keeps the RBAC model simple: pack mutation is a platform-curation action (`requireSuperAdmin`), not a team-scoped one.

3. **RBAC:** `POST /style-packs`, `PATCH /style-packs/:id`, `DELETE /style-packs/:id`, `POST /style-packs/:id/examples`, `DELETE /style-packs/:id/examples/:exampleId` → `requireAuth, requireSuperAdmin`. `GET /style-packs`, `GET /style-packs/:id`, `GET /style-packs/:id/examples` → `requireAuth` only (any signed-in user — the Generate UI needs to list packs for every team member, not just admins). Inactive packs are filtered out of `GET /style-packs` unless the caller is `super_admin` **and** passes `?include_inactive=true`.

4. **Deletion semantics:** `PATCH` with `is_active: false` is the normal "retire a pack" path (reversible). `DELETE /style-packs/:id` is a hard, cascading delete (`StyleExample.deleteMany({ style_pack_id })` before or via the pack deletion) — irreversible, super_admin-only, expected to be confirmed client-side later. Teams referencing a deleted or deactivated pack via `default_style_pack_id` must not have any operation fail because of it — this change only needs to *store* the reference safely (no read-time validation that the pack still exists); 6B is responsible for soft-failing at generation time, following the same pattern `resolveNewsItemContext` already uses for a missing news item.

5. **Example creation embeds server-side.** `addExample` calls the existing `embed()` on `content`, identical to `BrandVoiceExample`'s create path — imports never carry a pre-computed vector, so a corrupted/mismatched embedding can't be smuggled in.

6. **Platform enum on examples:** `'facebook' | 'linkedin' | 'other'`, default `'other'`. Nothing reads it yet (6B ignores it too); 7A's per-format generation is expected to prefer platform-matched examples eventually. Capturing it now avoids a re-tagging pass on an already-curated corpus later.

7. **Retrieval-sanity is a script, not a test.** `verifyStylePackRetrieval.ts` connects to the live DB, embeds a CLI-provided topic string, cosine-ranks a pack's examples, and prints the top 5 with scores. Whether `text-embedding-3-small` ranks Bangla content sensibly is inherently a human judgment call — this script makes that check take about two minutes and is the explicit gate the parent analysis requires before 6B (prompt-wiring) proceeds. If ranking turns out poor, the documented fallback — storing an LLM-extracted English topic summary per example and embedding that instead — is out of scope here and would be its own follow-up change.

8. **Seed data & idempotency:** `seed/style-pack.example.json` is `[{ content, platform?, source_ref?, engagement_hint? }]`, matching the shape convention of `seed/brand-voice.example.json`. `seedStylePack.ts` creates the pack if it doesn't exist (name/language come from CLI flags, documented in the script's usage text) and skips any example whose `content` already exists verbatim in that pack — exact-string dedup, no fuzzy matching, matching the existing brand-voice seed script's approach.

9. **Docs:** follow the `generatedContentPaths.ts` → `docs/openapi.ts` pattern exactly (a new `stylePackPaths.ts`, plus `StylePack`/`StyleExample` schema objects added to `docs/schemas.ts`).

## Risks / Trade-offs

- **[Curating 30-100 real Bangla examples per pack is human work, not something this change can automate]** → out of scope by design; the seed script and example JSON only make the *mechanics* of import idempotent — content quality is a curator responsibility tracked outside OpenSpec.
- **[A super_admin could hard-delete a pack teams still reference]** → accepted risk, mitigated by 6B's soft-fail-at-generation-time design (not this change's job to prevent) and by `DELETE` being a deliberate, admin-only, cascading action.
- **[Embedding quality for Bangla text is unproven at proposal time]** → exactly why `verifyStylePackRetrieval.ts` exists as a required manual gate in this change's own Verification section, before any generation wiring is attempted in 6B.

## Migration Plan

- Purely additive: two new collections, one new optional field on `Team` (`default_style_pack_id`, undefined by default). No backfill, no existing behavior changes for any team that never sets the field.
- Rollback is a plain revert; no destructive schema change is introduced. Existing `style_packs`/`style_examples` documents (if any survive a partial rollback) are simply orphaned collections with no code path reading them.

## Open Questions

None — scope, RBAC, and data model are fully pinned by the plan's design decisions.
