## Why

Content generation and chat responses default to English because the RAG examples in `brand_voice_examples` are generic and the system prompt lacks an explicit Bangla instruction. For Bangladeshi teams (e.g., Programming Hero), "writes in our voice" means Bangla script, team-specific tone, and platform-aware style — none of which the current system delivers. This change lands the full Bangla writing loop before the 2026-07-18 demo without any new infrastructure: the LLM does the writing, the team's own seeded posts are the "fine-tuning".

## What Changes

- **Brand voice seed script** (`scripts/seedBrandVoice.ts` + `seed:brand-voice` npm script) — embeds and upserts a JSON batch of real Bangla posts into `brand_voice_examples` for a given team; idempotent on re-run.
- **Language instruction in prompts** — `contentGeneration.prompt.ts` and `chat.prompt.ts` emit an explicit Bangla-script writing rule when examples exist; cold-start (no examples) stays English.
- **Team voice profile** — `Team` model gains `voice_profile: { default_language, custom_instructions? }`; editable via existing `PATCH /teams/:teamId`. Per-request `language` override on `POST /content/generate` and `POST /chat` so one team can write Bangla on Facebook and English on LinkedIn.
- **`GeneratedContent` module** (Phase 2, after Analytics/Report) — persists auto-generated drafts; daily cron picks top-opportunity news per team and generates in their voice; draft CRUD endpoints feed a Drafts tab in the Generate page.
- **UI additions** — Brand Voice settings page (CRUD for examples), language toggle in Generate/Chat pages, default language + custom instructions in Team settings.

## Capabilities

### New Capabilities
- `bangla-voice-rag`: Bangla-script content generation via brand voice seed data + explicit language prompt instruction + team voice profile (language override, custom standing instructions).
- `generated-content`: Persisted generated draft module with daily auto-generation job (top-opportunity news × team voice), draft CRUD, and admin manual trigger — delivers the "full week of content in 5 minutes" pitch.

### Modified Capabilities
- `team-management`: Add `voice_profile` sub-document to Team model (default_language, custom_instructions). **BREAKING** for clients that expect the Team object schema to be stable — no field removals, additive only.
- `content-generation`: `POST /content/generate` gains optional `language` override; system prompt gains language instruction when team has examples.
- `growth-studio-chat`: `POST /chat` respects team `voice_profile.default_language` and per-request `language` override; system prompt updated identically to content generation.

## Impact

- **New files:** `backend/src/scripts/seedBrandVoice.ts`, `backend/src/app/modules/GeneratedContent/` (model, interface, service, controller, route, validation, job)
- **Modified files:** `backend/src/app/modules/Team/team.model.ts` (voice_profile field), `backend/src/app/modules/ContentGeneration/contentGeneration.prompt.ts` (language instruction), `backend/src/app/modules/Chat/chat.prompt.ts` (language instruction), `backend/src/app/modules/ContentGeneration/contentGeneration.validation.ts` (language param), `backend/src/app/modules/Chat/chat.validation.ts` (language param), `backend/src/app/lib/scheduler.ts` (auto-gen cron), `backend/src/app/routes/index.ts` (new module routes)
- **Frontend:** Brand Voice settings page, language toggle in Generate + Chat, Team settings language/instructions fields
- **Dependencies:** no new packages; reuses existing `embed()`, `chatCompletion()`, `fetchTopBrandVoiceExamples()`, `computeAudienceMatch()`
