# Plan: Bangla + English Writing via RAG + Team-Specific Auto-Generated Posts

> Created 2026-07-15 · demo 2026-07-18
> Goal: (1) generated content writes in **Bangla or English per team choice**, always personalized from that team's own data (their data is the "fine-tuning" — the model itself is never trained), (2) the UI gives teams the options to feed that data in, (3) auto-generate posts per team from trending news — using the RAG that is already built.
> ⚠️ Note: the PRD (`project-ida-requirments.md` FR-11/FR-22) says "Banglish". The team decision on 2026-07-15 is **pure Bangla script** — update the PRD rows to match, so the docs don't contradict each other.

## Key idea (read this first)

We do NOT need a new RAG system for Bangla. The LLM does the writing; RAG feeds it examples. Our Brand Voice RAG already retrieves each team's own posts as few-shot examples — **if we seed Bangla-script examples, output comes back in Bangla script.** The plan below is: seed data → tighten the prompt → verify the model (the critical step for pure Bangla) → then automate generation per team.

---

## Phase 1 — Make Bangla writing work (demo-critical, ~half day)

### 1.1 Brand voice seed script

- **New:** `backend/src/scripts/seedBrandVoice.ts` + npm script `seed:brand-voice`
- Reads a JSON file: `[{ platform, category, content, engagement_hint }]`
- For a given team (arg: team id or email), embeds each post via existing `lib/embeddings.ts` and upserts into `brand_voice_examples` (idempotent — hash content to avoid duplicates on re-run).
- **Team task (blocker, human work):** collect 25–30 real **Bangla-script** posts from the actual Programming Hero pages, covering the main categories (AI, Web Dev, Career, Security). Fill `engagement_hint` with real numbers ("2.4k likes, 310 shares"). Posts that mix Bangla with English technical terms (the natural style of Bangla tech content) are exactly right — that mixing will be copied too.
- Why this is the core fix: retrieval picks the 3 most topic-similar of these for every generation (`contentGeneration.retrieval.ts`), and the model imitates their word choice, tone, emoji use, and language. Style in = style out.

### 1.2 Explicit language instruction in prompts

- **Edit:** `contentGeneration.prompt.ts` (`buildSystemPrompt`) — add one line when examples exist:
  *"Write in Bengali (বাংলা script), matching the language and style of the examples. Keep widely-used English technical terms (AI, JavaScript, framework) in English, as the examples do. Never write Bengali words in Latin letters."*
- **Edit:** `Chat/chat.prompt.ts` — same instruction for chat replies.
- Cold-start path (no examples yet) stays brand-neutral English — unchanged.

### 1.3 Team voice profile — the personalization contract

The principle: **the model is never fine-tuned; the team's data IS the tuning.** Everything that personalizes output lives in three team-owned data sources, all editable from the UI:

| Data source | What it controls | Where the team edits it |
|---|---|---|
| `brand_voice_examples` | Writing style, tone, emoji use, Bangla/English mixing | Brand Voice settings page (CRUD API already exists) |
| `team.voice_profile` (new) | Default language + standing instructions | Team settings page |

- **Edit:** `Team/team.model.ts` — add `voice_profile: { default_language: 'bangla' | 'english' | 'banglish', custom_instructions?: string }` (default language `'bangla'`). Editable via existing `PATCH /teams/:teamId`. `custom_instructions` is a free-text field ("always end with a question", "never use more than 2 emojis", "audience is beginner developers") appended to the system prompt — the team's standing rules, no deploy needed to change them.
- **Edit:** `contentGeneration.validation.ts` + service — optional `language?: 'bangla' | 'english'` on `POST /content/generate`, overriding the team default per request. Same for `POST /chat`. One team writes Bangla on Facebook and English on LinkedIn — same RAG, per-request switch.
- **Edit:** `buildSystemPrompt(examples, voiceProfile, languageOverride?)` — emits the language instruction (resolved: request override → team default) + `custom_instructions`.

### 1.3b UI options so teams can feed the RAG (frontend tasks)

For personalization to work, the UI must expose the data inputs:

1. **Brand Voice page** (`/dashboard/settings/voice` or a tab) — list/add/edit/delete brand voice examples; fields: content (textarea), platform, category, engagement hint. Backend is done (`/api/v1/brand-voice-examples` CRUD); this is pure frontend work. Include an empty-state explaining: "Add 25–30 of your real posts — every generation copies your style from these."
2. **Language selector in the Generate page** — Bangla / English toggle (defaults to team setting), passed as `language` to the generate call. Same in Chat.
3. **Team settings** — default language dropdown + custom instructions textarea (`PATCH /teams/:teamId`).
4. (Phase 3) "Save as voice example" button on any generated draft the team liked — feeds the loop.

### 1.4 Model fluency check — ⚠️ the critical step for pure Bangla (1 hour)

Pure Bangla script is meaningfully harder for small models than Banglish: an 8B free model can produce wrong conjuncts (যুক্তবর্ণ), awkward grammar, or drift back into English mid-sentence. So this step is mandatory, not optional:

- Seed the examples first, then generate 3–4 topics and have a native speaker judge the Bangla.
- Test 2–3 free OpenRouter models via the `LLM_MODELS.content` env var (no code change): current Llama 3.1 8B baseline, then stronger multilingual free options (e.g. a Qwen 2.5 variant or a larger Llama free tier — Qwen-family models are typically the strongest at Bangla among free options; verify what's currently free on openrouter.ai/models).
- Keep the best one for `content` and `standard` (chat/report) models. If none is acceptable, fallback decision: ship Banglish for demo (matches original PRD) and revisit paid/larger models post-demo.
- **Decision (2026-07-15): stay 100% on OpenRouter free tier — no paid models for the hackathon.** Keeps the "$0 AI cost" pitch (NFR-08) intact. Paid models remain a documented one-minute env-var swap, post-demo option only.
- Diagnostic rule: **wrong tone → fix the examples; broken Bangla → fix the model; language drift (English creeping in) → strengthen the prompt line.**

### Verification (Phase 1)

- `npm run seed:brand-voice -- --team <id> --file seed/brand-voice.json`
- `POST /content/generate` for topics in different categories → output is Bangla script, sounds like the seeded posts, English tech terms preserved.
- Same call with `language: 'english'` → output flips to English but keeps the team's tone/structure (personalization is independent of language).
- Set a `custom_instructions` rule on the team → next generation obeys it.
- `POST /chat` → reply follows the team's default language.
- Native-speaker review of 5+ generations (grammar, conjuncts, naturalness) — automated tests can't judge Bangla quality.
- Integration test: extend `contentGeneration.integration.test.ts` with a Bangla-script fixture; assert the prompt contains the language instruction.

---

## Phase 2 — Team-specific auto-generated posts (demo nice-to-have)

Today generation is on-demand (user clicks a news card). This phase makes Growth Studio generate drafts **automatically, per team, in that team's voice** — the "full week of content in 5 minutes" pitch, without clicks.

### 2.1 Persist generated content — new module `modules/GeneratedContent/`

Follow the standard module pattern (model/interface/service/controller/route/validation):

- **Model** `generated_content`: `team_id, news_item_id?, topic, formats { facebook_post, facebook_reel_script, linkedin_post, youtube_idea, caption }, source ('auto' | 'manual'), status ('draft' | 'approved' | 'dismissed'), model_used, created_at`. Index `(team_id, created_at)`.
- This also satisfies **FR-20** better than the planned Redis-only cache: history survives restarts, and the manual `POST /content/generate` can save its result here too (with a `cached` fast-path on repeat topic).

### 2.2 Auto-generation job

- **New:** `generatedContent.job.ts` — `runAutoGeneration(teamId?)`:
  1. For each team with ≥1 brand voice example (cold-start teams are skipped — never auto-generate generic content),
  2. pick top N (default 3) news items for that team by opportunity — global `opportunity_score`, filtered to the team's subscribed categories,
  3. skip news items that already have a draft for this team (dedup on `(team_id, news_item_id)`),
  4. run the **existing** generation service per item (team-scoped brand voice RAG does the Bangla voice automatically),
  5. save as `status: 'draft'`.
- **Cron:** daily via `lib/scheduler.ts` (new `AUTO_GENERATION_CRON`, default `0 6 * * *`), same pattern as news ingestion. Per-team try/catch so one team's failure never blocks others.
- **Quota guard:** N×teams LLM calls per day — cap with `AUTO_GENERATION_MAX_PER_RUN` (default 10) to protect the OpenRouter free tier.

### 2.3 Endpoints

- `GET /generated-content?team_id=&status=` — list drafts (team member; feeds a "Drafts" tab in the Generate page).
- `POST /generated-content/run` — admin manual trigger (mirrors `POST /news-items/ingest`).
- `PATCH /generated-content/:id` — approve/dismiss.

### Verification (Phase 2)

- Integration test: seed team + brand voice → run job with openrouterMock → drafts created, cold-start team skipped, re-run creates no duplicates.
- Demo flow: trigger `POST /generated-content/run` live → open Drafts tab → show 3 ready Bangla posts per platform. Strong demo moment.

---

## Phase 3 — Quality loop + scale (post-demo)

1. **Self-improving voice:** "approve" on a draft (or a real published post that performed well) can insert it back into `brand_voice_examples` — the voice gets sharper with use. (One service call on the approve path.)
2. **Unified RAG service:** extract `lib/rag/` — `retrieve({ collection, teamId?, queryText, limit })` — used by chat, generation, and the auto-gen job. This is also where retrieval switches from in-app cosine to Atlas `$vectorSearch` (indexes already exist) when `news_items` grows large.
3. **Per-format examples:** tag brand voice examples by platform and prefer same-platform examples when generating (Facebook voice ≠ LinkedIn voice). Field already exists (`platform`); it's a one-line filter in `fetchTopBrandVoiceExamples`.

---

## Priorities vs. the rest of the backend

| When | What |
|---|---|
| **Now (Day 1)** | Phase 1 — seed script + prompt lines + language field + model check. Small, demo-critical, unblocks the "writes in OUR voice" pitch. **The 25–30 real posts collection is the human blocker — start today.** |
| **Day 2–3** | Phase 2 — auto-generation. A wow-feature, pre-agreed droppable if time runs out. |
| **Post-demo** | Phase 3 — approve-loop, `lib/rag/`, `$vectorSearch`. |

## What we are explicitly NOT doing

- ❌ PoRAG / LangChain / ChromaDB — solves Bengali-document *reading*, we need Bengali *writing*; would replace a working stack days before demo.
- ❌ Fine-tuning or self-hosting a Bangla LLM — breaks the $0 cost requirement (NFR-08); few-shot examples + model choice cover it.
- ❌ A separate RAG per team — team isolation already exists via `team_id` filters; per-team voice comes from per-team examples.
