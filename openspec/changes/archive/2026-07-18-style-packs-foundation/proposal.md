## Why

The vision calls for content that reads in the voice of popular Bangla tech writers (e.g. Programming Hero's energetic edtech tone) — "should not feel like AI generated." Today's brand-voice RAG is per-team only (a team's own past posts, 3 few-shots). There is no shared, curated, multi-tone corpus of named writer styles that teams can opt into. This change lays the data foundation — the model, CRUD API, team linkage, and curation tooling — for that shared style layer; wiring it into generation is a separate, subsequent change (6B) so this one ships independently and stays reviewable.

## What Changes

- New `StylePack` module: `style_packs` (name, unique `slug`, description, language, `tone_tags`, optional `style_card`, `is_active`) and `style_examples` (`style_pack_id`, `content`, server-generated 1536-dim embedding, `platform` enum, optional `source_ref`/`engagement_hint`).
- Full CRUD API: super_admin manages packs and examples (`requireSuperAdmin`); any authenticated user can list active packs and read a pack with its example count (`requireAuth`) — the Generate UI needs this read access.
- Deleting a pack cascades to delete its examples. Retiring a pack uses `PATCH` to toggle `is_active` instead.
- `Team` gains optional `default_style_pack_id`, editable via the existing team update endpoint; a dangling/inactive reference must never break team operations (soft-fail is 6B's concern at generation time — this change just stores the field safely).
- Tooling: `npm run seed:style-pack -- <slug> <file.json>` (idempotent bulk import, mirrors `seed:brand-voice`), a sample `seed/style-pack.example.json`, and `npm run verify:style-pack-retrieval -- <slug> "<topic>"` (human-in-the-loop retrieval-quality check for Bangla embeddings, required before 6B proceeds).
- OpenAPI docs for the new endpoints.
- Explicitly excluded from this change: any wiring into `POST /content/generate` (that's 6B).

## Capabilities

### New Capabilities
- `style-packs`: globally shared, curated writer-style corpus (packs + examples) with CRUD API, team default-pack linkage, and curation scripts.

## Impact

- Backend: new `backend/src/app/modules/StylePack/` (interface, model, validation, service, controller, route), `routes/index.ts` registration, `docs/schemas.ts` + new `stylePackPaths.ts` wired into `docs/openapi.ts`.
- `Team` model/interface/validation/service gain `default_style_pack_id` (additive, optional).
- New scripts: `scripts/seedStylePack.ts`, `scripts/verifyStylePackRetrieval.ts`, registered as npm scripts.
- No changes to content generation, retrieval, or prompt construction — that is entirely deferred to change 6B.
- No frontend changes in this change.
