## 1. Module scaffolding

New `backend/src/app/modules/StylePack/` mirroring `BrandVoiceExample`'s structure.

- [x] 1.1 `stylePack.interface.ts`: `IStylePack { name; slug; description?; language: LanguageStyle; tone_tags: string[]; style_card?: string; is_active: boolean; created_by: string; created_at: Date }`; `IStyleExample { style_pack_id; content; embedding: number[]; platform: 'facebook'|'linkedin'|'other'; source_ref?: string; engagement_hint?: string; created_at: Date }`
- [x] 1.2 `stylePack.model.ts`: two schemas/models (`style_packs`, `style_examples`); unique index on `slug`; index `{ style_pack_id: 1 }` on examples; 1536-dim embedding validator copied from `brandVoiceExample.model.ts`
- [x] 1.3 `stylePack.validation.ts`: create/update pack (`slug` regex `^[a-z0-9-]+$`, `language` enum, `tone_tags` max 10, `style_card` max 4000 chars); create example (`content` 1..8000 chars, `platform` enum optional); list query (`include_inactive` optional boolean-string)
- [x] 1.4 `stylePack.service.ts`: `createPack` / `listPacks(includeInactive, role)` / `getPackById` (with `example_count` via `countDocuments`) / `updatePack` / `deletePack` (cascades `StyleExample.deleteMany`) / `addExample` (embeds via `embed()`) / `listExamples` (paginated) / `deleteExample`
- [x] 1.5 `stylePack.controller.ts` + `stylePack.route.ts`: `POST /` `PATCH /:id` `DELETE /:id` `POST /:id/examples` `DELETE /:id/examples/:exampleId` behind `requireAuth, requireSuperAdmin`; `GET /` `GET /:id` `GET /:id/examples` behind `requireAuth`; register `{ path: '/style-packs', route: StylePackRoutes }` in `routes/index.ts`

## 2. Team linkage

- [x] 2.1 `team.interface.ts` + `team.model.ts`: `default_style_pack_id?: string`
- [x] 2.2 `team.validation.ts` `updateTeamValidation` + `team.service.ts` `updateTeam`'s `Pick`: add the field (objectId, optional, nullable to allow clearing)

## 3. Scripts & seed data

- [x] 3.1 `src/scripts/seedStylePack.ts` (`npm run seed:style-pack -- <slug> <file.json>`): zod-validate file `[{ content, platform?, source_ref?, engagement_hint? }]`; create the pack if missing (name/language via `--name`/`--language` args, documented defaults in usage text); skip exact-content dupes within the pack; report created/skipped/total
- [x] 3.2 `seed/style-pack.example.json` with shape documentation and 2-3 Bangla-register examples
- [x] 3.3 `src/scripts/verifyStylePackRetrieval.ts` (`npm run verify:style-pack-retrieval -- <slug> "<topic>"`): embed the topic live, cosine-rank the pack's examples, print top-5 with scores
- [x] 3.4 Register both npm scripts in `backend/package.json`

## 4. Docs

- [x] 4.1 `docs/schemas.ts` gains `StylePack`/`StyleExample` schema objects; new `docs/stylePackPaths.ts` (follow `generatedContentPaths.ts` as the template) wired into `docs/openapi.ts`

## 5. Tests

New `__tests__/stylePack.integration.test.ts` (mock openrouter for embeds).

- [x] 5.1 super_admin CRUD happy path incl. example embedding dimension; admin/user → 403 on mutations; any authenticated user can list/read active packs
- [x] 5.2 Deleting a pack cascades to delete its examples
- [x] 5.3 `include_inactive` visibility rules (super_admin only; default list excludes inactive)
- [x] 5.4 Team PATCH stores and clears `default_style_pack_id`; a dangling reference doesn't break a team read

## 6. Verification

- [x] 6.1 `cd backend && npm test && npm run build`
