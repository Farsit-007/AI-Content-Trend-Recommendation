## Why

Change 6A (`style-packs-foundation`) built the data model, CRUD API, and curation tooling for globally-shared writer style packs, but explicitly excluded any wiring into generation. The vision's actual goal — content that reads in a named Bangla tech writer's register, "should not feel like AI generated" — only lands once `POST /content/generate` can actually resolve a pack and steer the LLM prompt with it. This change does that wiring, plus fixes a pre-existing cache-correctness bug (the generation cache key ignores language, so a cached Bangla result can be served to a later English request for the same team+item) that packs would otherwise make worse by multiplying the number of distinct outputs that can collide under one key.

## What Changes

- `POST /content/generate` gains optional `style_pack_id`; resolution order is request override → team's `default_style_pack_id` → none, soft-failing (log warn, proceed without a pack) on a missing or inactive pack — never a request error.
- When a pack resolves, retrieval fetches its top-5 topic-similar examples and the system prompt gains a structured style section: pack style card (when present) + pack examples, ordered **before** the team's own brand-voice examples, so the pack owns tone/register while the team's examples contribute terminology and specifics.
- Cold-start redefinition: the brand-neutral fallback prompt now triggers only when there are **no** brand-voice examples **and no pack resolved** — a brand-new team with a pack selected gets styled output from day one.
- **Cache-correctness fix:** the Redis cache key now incorporates the resolved language and resolved style pack id, so a cached result for one language/pack combination can never be served to a request for a different one.
- Ships `npm run style:generate-card -- <slug>`, an offline script that analyzes a pack's examples with one LLM call and persists a ~300-word style card onto the pack (re-runnable, idempotent overwrite) — curators can also hand-write a card without this script.

## Capabilities

### Modified Capabilities
- `content-generation`: `POST /content/generate` gains style-pack resolution and style-conditioned prompting (new requirement, built on the existing generation pipeline); the existing "Cold-start fallback when no brand-voice examples exist" requirement is modified so the brand-neutral branch also considers whether a pack resolved.
- `content-generation-cache`: the existing "Generated content is cached in Redis for 24 hours" requirement is modified so the cache key incorporates the resolved language and resolved style pack id, fixing a pre-existing bug where a cached result for one language/pack could be served to a request for a different one.

## Impact

- Backend: `contentGeneration.interface.ts`, `contentGeneration.validation.ts`, `contentGeneration.retrieval.ts`, `contentGeneration.service.ts`, `contentGeneration.prompt.ts`.
- New `backend/src/scripts/generateStyleCard.ts` + npm script `style:generate-card`.
- No changes to the `StylePack`/`StyleExample` data model or CRUD API (6A already shipped those) — this change only reads from them.
- No frontend changes.
- Depends on change 6A (`style-packs-foundation`) being applied — it is (all 17 tasks complete in this session).
