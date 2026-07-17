# Growth Studio — Vision Alignment: Deep Analysis & Roadmap

**Date:** 2026-07-17
**Scope:** Full audit of backend + frontend against the product vision (daily.dev-style trend feed → per-team categories → full-content storage → lifecycle management → one-click Bangla content in real BD tech-writer styles → Canva-like tweak-and-copy editor for Facebook/LinkedIn).
**Method:** Every claim below was verified directly in the code on 2026-07-17. File references are given so each can be re-checked. Existing planning docs (`RAG-BANGLA-PLAN.md`, `FARSIT-*` retention/dedup plans, `project-ida-requirments.md`) were cross-read so this report builds on them instead of duplicating them.

---

## 1. Executive Summary — Is the system serving the idea?

**Partially — the trend-intelligence backend is strong and close to the vision; the content-side and the entire user experience are not there yet.**

| # | Vision requirement | Status | One-line verdict |
|---|---|---|---|
| V1 | Daily.dev-style trending aggregation (AI/programming/SWE) | ✅ ~90% | 10 live sources, dedup, scoring, cron — genuinely good |
| V2 | Per-team selected categories drive what each team sees | ❌ ~15% | `custom_categories` exists as a label list but filters nothing |
| V3 | Show resources with trend/opportunity metrics | 🟡 50% | Backend computes everything; the Feed page is a "Coming soon" placeholder |
| V4 | Store description + full content of each resource | ❌ ~10% | Only short snippets stored; 2 sources store no real text at all |
| V5 | Resources refreshed; finished trends removed | ❌ 0% impl | Fully **planned** (FARSIT retention + dedup plans) but zero code shipped |
| V6 | Select a resource → generate Bangla content from it | 🟡 55% | Backend endpoint works (snippet-grounded as of today); no UI to trigger it |
| V7 | RAG trained on popular Bangla tech writers' styles | 🟡 35% | Per-team brand-voice RAG shipped; global "writer style pack" corpus doesn't exist |
| V8 | Canva-like editor: click, tweak, copy-paste | ❌ 0% | Generate page is a placeholder; no editing/regenerate/copy flow anywhere |
| V9 | Output must not feel AI-generated (PH-style Bangla) | 🟡 25% | Language+voice prompts exist; no humanization pass, free-tier model, fluency unverified |
| V10 | Big/long-form content for Facebook + LinkedIn | 🟡 30% | Formats exist but one JSON call for 5 formats caps length; no length/structure control |

**The four load-bearing gaps, in order of how much they block the vision:**

1. **The user-facing product does not exist.** `Feed.tsx`, `Generate.tsx`, `Chat.tsx` are all "Coming soon" placeholders (`frontend/src/pages/dashboard/`). Nobody can experience any backend value today. The "Canva for content writers" is 100% frontend work that hasn't started.
2. **Full content storage is missing** — and it's the foundation for good generation. Snippets today are tiny (see §4.4 table); Stack Overflow stores a *tag list*, Product Hunt a *tagline*. The generation LLM can now see the snippet (shipped today in `content-generation-news-grounding`), but a 1-line snippet cannot ground a 300-word Bangla post.
3. **Lifecycle (refresh + removal) is designed but unbuilt.** Two complete OpenSpec execution plans exist (`2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md`, `3-FARSIT-NEWS-DEDUP-UPDATES-OPENSPEC-PLAN.md`, 9 changes total) — none of the 9 have been proposed/implemented (confirmed: no matching entries in `openspec/changes/` or its archive).
4. **The Bangla style system is one level shallower than the vision.** What's shipped is *per-team brand voice* (team's own posts as few-shot examples). The vision asks for *a curated, shared corpus of popular Bangladeshi tech writers' content, in multiple tones, selectable as a style* — that's a different data model (global style packs), a different retrieval path, and a stronger model requirement.

---

## 2. The Vision, restated as testable requirements

From your description, verbatim intent → requirement:

- **V1** — "work like daily dev extension and get us the most trending blogs, news, articles and resources regarding ai, programming, software engineering"
- **V2** — "…to different team according to their selected categories"
- **V3** — "show them those resources with trending score, opportunity score and etc metrics"
- **V4** — "while we are storing the resources, we also want to store the description and all the parts of the content of that resource in our db"
- **V5** — "regularly the resources are going to be updated and finished trend resources needs to get removed"
- **V6** — "when a team member will select a resource we want our system to make a bangla content out of that"
- **V7** — "using rag we will train our ai about different bangla blogs, articles, contents of different tones of popular bangla tech writers so that our system can produce contents like that same styles, tone, accent in bangla"
- **V8** — "like a canva for content writers… just click, tweak, copy paste with no extra efforts"
- **V9** — "should not feel like ai generated. Just like how our bangladeshi tech writers would have written" (mostly Programming Hero ed-tech style)
- **V10** — "mainly for facebook and linkedin. So big content is needed"

---

## 3. Verified System Inventory (what exists today)

### 3.1 Ingestion pipeline — the strongest subsystem ✅

`backend/src/app/modules/NewsIngestion/` — 4-layer pipeline (`newsIngestion.service.ts:160-294`), cron every 3h (`NEWS_INGESTION_CRON=0 */3 * * *`) + manual admin trigger:

1. **Fetch & normalize** — 10 adapters running in parallel, each isolated so one failure can't kill the run (`adapters/index.ts`): HackerNews (Algolia front page + risers), Dev.to (top + rising), GitHub Trending (HTML scrape + Search API dual-path), Reddit (OAuth, optional), RSS fleet (21 feeds configured: TechCrunch, Verge, Ars, Wired, Medium tags, InfoQ, TheNewStack, Smashing, SO Blog, Cloudflare, Changelog, MIT TR, 5 GitHub release feeds, arXiv cs.AI), Lobsters, Mastodon trending links, Product Hunt (GraphQL), StackOverflow hot, GNews.
2. **Dedup & freshness** — 72h window; sha256(`source:url`) hash dedup vs stored + in-run; **semantic dedup** via embeddings (cosine ≥ 0.88 vs 72h pool, greedy keep-higher-engagement in-run) (`newsIngestion.utils.ts`).
3. **Scoring** — relevance = max cosine vs pooled brand-voice embeddings ×10 (cold-start skips filtering); trend = `log10(points + 2·comments + 3·stars + 1)×3` clamped 0-10; both deterministic (`newsIngestion.scoring.ts`).
4. **Categorize & opportunity** — LLM batch-of-10 → category (fixed taxonomy: AI / Web Dev / Career / Security / DevOps / Other), `impact_note` (1-sentence audience fit), confidence, audience_fit; robust fallback on parse failure; opportunity = `0.4·relevance + 0.3·trend + 0.3·fit×10`; `needs_review` when confidence < 0.6.

**Observability**: every run persisted as `IngestionRun` (per-source, per-layer counts, 30-day TTL), zero-streak source-health alerts, Admin UI table wired (`frontend/src/pages/dashboard/Admin.tsx`). This is production-grade for a hackathon.

### 3.2 Content generation ✅ backend / ❌ frontend

`POST /content/generate` (`ContentGeneration/`): team-scoped RAG (top-3 brand-voice examples + top-3 top-performing platform posts by topic cosine), cold-start brand-neutral path, voice profile (language bangla/banglish/english, default **bangla**; `custom_instructions` ≤500 chars), per-request language override, and — as of today's `content-generation-news-grounding` change — the news item's `snippet` + `url` in the prompt plus an anti-hallucination instruction. Output: one strict-JSON call producing `facebook_post`, `facebook_reel_script`, `linkedin_post`, `youtube_idea{...}`, `caption`. Redis-cached 24h per team+item.

**Auto-generation** (`GeneratedContent/generatedContent.job.ts`): daily 06:00, picks global top-3 news by opportunity, drafts for every team that has brand-voice examples, 10-call cap, draft/approved/dismissed workflow + admin trigger endpoint.

### 3.3 The Bangla layer 🟡

Shipped (per `RAG-BANGLA-PLAN.md` Phase 1, archived change `2026-07-15-rag-bangla`):
- Bangla-script language instruction with English tech-term code-switching (`lib/voiceProfile.ts:15-23`), default `bangla`.
- `seedBrandVoice.ts` script + `seed/brand-voice.example.json` containing real PH-style Bangla FB posts.
- Team voice profile + per-request override.

Not shipped: the model fluency check (`RAG-BANGLA-PLAN.md` §1.4 — flagged there as "⚠️ the critical step") has no recorded outcome; every LLM role (`LLM_MODEL_STANDARD/CONTENT/FALLBACK`) currently points at the same free model (`nvidia/nemotron-3-ultra-550b-a55b:free`), which also **silently disables the fallback failover** (`llmClient.ts:53` throws when `fallbackModel === model`).

### 3.4 Teams, RBAC, analytics ✅ (out of this vision's critical path)

Multi-team RBAC (user/admin/super_admin, memberships), platform catalog + per-team enablement, encrypted per-team credentials, Meta OAuth (FB/IG) + LinkedIn OAuth, analytics rollups + report LLM, "Ask Growth Studio" chat backend (intent → news/performance retrieval → answer). Report + Platforms settings pages are the only fully-wired user-facing pages besides Admin.

### 3.5 Frontend reality ❌

- Wired: Landing, Login, About, dashboard shell + role-based sidebar, **Report**, **Admin (ingestion runs)**, **Settings/Platforms (OAuth)**.
- Placeholders ("Coming soon"): **Feed**, **Generate**, **Chat**, Overview (welcome text only).
- No team switcher (`useTeamId.ts`: env var or first membership), no brand-voice management UI, no team settings UI (language/custom instructions/categories), no drafts list UI.
- Note: `CLAUDE.md`'s frontend file map (`components/feed/`, `lib/mock/news.ts`, etc.) no longer matches the actual tree (`routes/`-based, no mock dir) — worth updating so future agent/dev work doesn't follow a stale map.

---

## 4. Gap Analysis, requirement by requirement

### V1 — Trending aggregation ✅ (minor gaps)

Done and healthy. Remaining polish, already known: Reddit disabled unless creds set; GitHub Trending scrape-path items have `published_at: undefined` (bypass freshness — flagged in retention plan §0.1); progressive-trend stories get killed by semantic dedup (the whole subject of the dedup-updates plan).

### V2 — Per-team category subscriptions ❌

- `Team.custom_categories` is a CRUD'd **label list** (`team.service.ts:100-130`) used only to validate category overrides. **Nothing filters the feed by it.**
- `GET /news-items` accepts an explicit `?category=` query param (QueryBuilder pass-through) but never applies team preferences automatically.
- The categorization taxonomy is fixed at 6 values (`NEWS_CATEGORIES`, `newsIngestion.interface.ts:13`) — a team adding custom category "Robotics" gets a label the ingestion LLM will never assign, so it matches zero items. The two halves don't meet.
- Auto-generation ignores categories entirely: `NewsItem.find().sort({opportunity_score:-1, trend_score:-1}).limit(3)` (`generatedContent.job.ts:40-44`) — global top-3, **no age filter either**, so the same 3 all-time-highest items stay eligible forever (only the per-team unique index stops re-drafting).

### V3 — Metrics-rich feed 🟡

Backend: trend/opportunity/relevance/category/impact_note/high_opportunity annotation (audience-match vs team's own post embeddings, threshold 0.6, fallback opportunity ≥ 7.5) all present in `GET /news-items` (`newsItem.service.ts:54-99`).
Missing: the entire Feed UI. Plus one real backend bug: **the feed's default sort is a no-op** — QueryBuilder defaults to `-createdAt` but the schema field is `created_at` (`QueryBuilder.ts:58` vs `newsItem.model.ts:33`), so unsorted requests return natural (insertion) order. A trending feed should default-sort by something meaningful (decayed trend/opportunity — see Phase B).

### V4 — Full content storage ❌ (the deepest data gap)

What each adapter actually stores as `snippet` today:

| Source | Stored text | Reality |
|---|---|---|
| hackernews | `story_text` (Ask/Show HN only) | Link posts (the majority) → **no snippet at all** |
| devto | `description` | ~140-char preview |
| github_trending | repo description | 1 line |
| reddit | `selftext.slice(0, 500)` | Truncated at 500 chars |
| rss:* | `contentSnippet` (rss-parser) | Summary field; **`content:encoded` full body is ignored** |
| lobsters | description (≤500) or tag list | Often tags only |
| mastodon | link-card description | 1-2 lines |
| producthunt | `tagline` | ~60 chars; the API's fuller `description` field is not requested |
| stackoverflow | `tags.join(', ')` | **Not prose at all** — question body never fetched |
| gnews | `description` | 1-2 lines; GNews `content` field is paywalled/truncated |

- No adapter fetches the linked page. There is no readability/extraction layer anywhere. No `content` field exists on `INewsItem` (`newsItem.interface.ts`).
- Today's `content-generation-news-grounding` change (proposal §"out of scope") explicitly deferred widening what adapters store — that deferred decision is exactly requirement V4.
- Knock-on effect: categorization (`title + snippet`), embeddings (`title + snippet`), chat retrieval context, and generation grounding are all only as good as these thin snippets.

### V5 — Update + remove finished trends ❌ implementation / ✅ design

Verified still true today: nothing deletes from `news_items` (no TTL, no cleanup cron — `scheduler.ts` has exactly 3 jobs); engagement + trend_score written once at ingest and frozen; hash dedup actively *prevents* refreshing a stored item from a re-fetch.
The design work is already done and high quality:
- `2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md` — 4 changes: engagement re-polling job, trend decay, lifecycle states (`active/archived`) with archive-then-delete + tombstones (resurrection hazard), feed defaults.
- `3-FARSIT-NEWS-DEDUP-UPDATES-OPENSPEC-PLAN.md` — 5 changes: same-URL refresh at hash-dedup, two-band semantic dedup with LLM adjudication (update vs duplicate), story chains.
**None of the 9 changes have been executed** (no matching `openspec/changes/` entries). This is shovel-ready work.

### V6 — Select resource → Bangla content 🟡

Backend chain works end-to-end (verified live today: PH item with snippet → grounded Bangla-capable output; auto-gen job clean). Gaps:
- **No UI.** No feed item → "Generate" button → editor flow.
- The 24h Redis cache (`contentGeneration.service.ts:55-59`) returns the identical result on every retry — there is no "regenerate" or variant mechanism, which the tweak-loop UX requires.
- One call must produce 5 formats in one JSON blob — this caps per-format length (V10) and mixes concerns (a YouTube outline steals token budget from the LinkedIn post).

### V7 — RAG on popular Bangla tech writers ❌ (as specified) / 🟡 (foundation)

What exists is *team* brand voice: `BrandVoiceExample {team_id, platform, category, content, embedding, engagement_hint}` — the team's own posts, 3 retrieved per generation. The vision wants something structurally different:
- A **shared, curated corpus** of multiple *named writer/tone styles* ("different tones of popular bangla tech writers"), not tied to any team's identity.
- **Selectable per generation** ("tweak the contents according to pure bangladeshi style… mostly Programming Hero style") — i.e., a style dimension independent of the team's brand voice.
- Enough examples per style for reliable long-form imitation (3 few-shots is thin for "doesn't feel AI" long-form; style packs want 30-100 examples each with topic-similar retrieval of ~5-6).
No model, no API, no ingestion tooling, no UI exists for this today. (The good news: embeddings, vector retrieval, ranking, and prompting infrastructure are all reusable as-is.)

### V8 — Canva-like tweak UX ❌

Nothing exists. Required end-state: feed card → Generate → per-format editable drafts → inline tweak actions ("shorter", "more casual", "add CTA", regenerate) → copy button → save draft. All frontend + 2 small backend endpoints (regenerate-with-instruction, save draft from manual flow — note `GeneratedContent` today is only written by the auto job; the manual generate response is never persisted).

### V9 — "Doesn't feel AI-generated" 🟡

Present: Bangla-script instruction with natural English tech-term code-switching, team custom_instructions, few-shot voice examples, anti-hallucination grounding rule (today). Missing:
- **Model quality assurance.** The single biggest determinant. Free Nemotron for Bangla long-form creative writing is unvalidated (`RAG-BANGLA-PLAN.md` §1.4 was never signed off). The "stay free tier" decision was scoped to the hackathon demo — the vision as now stated (PH-grade Bangla, human-indistinguishable) almost certainly needs a stronger paid model for `LLM_MODEL_CONTENT` (a one-line env change; test candidates via OpenRouter A/B).
- **Humanization techniques**: no style-card (distilled per-style writing rules), no anti-AI-tell instructions (varied sentence lengths, no formulaic openers/closers, natural Bangla idioms), no optional second-pass critique/rewrite, no native-speaker eval loop.
- Fallback model misconfiguration (same as primary → failover dead) hurts reliability, which reads as quality.

### V10 — Long-form FB/LinkedIn 🟡

`facebook_post` / `linkedin_post` exist but: no length targets, no structure guidance (hook line, spacing, hashtags/emoji policy), and the 5-formats-in-one-JSON design economically caps length. For "big content," FB (~150-400 words) and LinkedIn (~1,200-2,500 chars) need dedicated calls with format-specific instructions and format-matched few-shots.

---

## 5. What's already planned vs genuinely new

| Work | Existing plan? | Status |
|---|---|---|
| More sources | `1-FARSIT-NEW-SOURCES-OPENSPEC-PLAN.md` | ✅ Executed (7 changes archived Jul 16-17) |
| Engagement refresh, decay, lifecycle, deletion | `2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md` (4 changes) | ⬜ Not started — execute as written |
| Update-aware dedup, story chains | `3-FARSIT-NEWS-DEDUP-UPDATES-OPENSPEC-PLAN.md` (5 changes) | ⬜ Not started — execute as written |
| Bangla per-team voice (Phase 1) | `RAG-BANGLA-PLAN.md` | ✅ Backend done; UI tasks (§1.3b) + fluency check (§1.4) open |
| Snippet→prompt grounding | `content-generation-news-grounding` | ✅ Done today (unarchived) |
| **Full content storage & extraction (V4)** | **No plan exists** | 🆕 This report, Phase A |
| **Team category subscriptions wired to feed (V2)** | No plan | 🆕 Phase C |
| **Writer style packs (V7)** | No plan (RAG-BANGLA covers team voice only) | 🆕 Phase D |
| **Long-form per-format generation + regenerate/variants (V6/V10)** | No plan | 🆕 Phase E |
| **Feed + Generate editor UI (V3/V8)** | MASTER-PLAN assigned mock-data UI (never built) | 🆕 Phase F |

---

## 6. Roadmap — how to close each gap, in detail

> Ordering rationale: A (content) unlocks E (long-form grounded generation) and improves categorization; B is independent and shovel-ready; C is small; D is data + model work that can proceed in parallel; F is the demo-visible layer and can start immediately against existing APIs.

### Phase A — Full content storage & extraction (V4) — ~2-3 days

**A1. Schema.** Add to `INewsItem` + model: `content?: string` (extracted plain text, capped — recommend 20,000 chars), `content_status: 'none' | 'partial' | 'full' | 'failed'`, `content_fetched_at?: Date`, `word_count?: number`. Keep `snippet` as the short display/embedding text. No migration needed (all optional).

**A2. Per-source API upgrades first (cheap, reliable, ToS-clean).** Before generic scraping, use the sources' own APIs for full text:
- **dev.to**: `GET /api/articles/{id}` → `body_markdown` (full article).
- **reddit**: stop slicing at 500 — store full `selftext` in `content`, keep 500-char `snippet`.
- **stackoverflow**: add `&filter=withbody` to the existing hot-questions call → `body` (HTML → strip) as `content`; keep tags in `snippet`.
- **producthunt**: add `description` to the GraphQL query → `content`; keep `tagline` as `snippet`.
- **hackernews**: `story_text` already full for text posts → `content`; link posts fall to A3.
- **rss**: read `item['content:encoded'] ?? item.content` (rss-parser exposes both) → many feeds (Medium, Smashing, Cloudflare, arXiv abstracts) carry full/long bodies; fall to A3 otherwise.
- **lobsters**: full `description` (drop the 500 cap) for text posts.
- **github_trending**: optional README fetch (`GET /repos/{full_name}/readme`, Accept raw) capped at ~10k chars — decide if wanted; a repo's README is its "content."

**A3. Generic extractor for link-only items** (HN links, Mastodon, GNews, RSS summaries, Lobsters links): new `newsIngestion.contentFetch.ts` layer that runs **after** semantic dedup and relevance filtering (only fetch pages for items that will actually be stored — typically 20-60/run, not 700):
- `fetch` with 10s timeout, 2-3 concurrent max, realistic User-Agent; skip non-HTML content types and >2MB bodies.
- Extraction: `@mozilla/readability` + `linkedom` (lightweight DOM, no jsdom weight) — or `@extractus/article-extractor` (bundles both). Strip nav/boilerplate, collapse whitespace, cap 20k chars, set `content_status` (`failed` on paywall/JS-only pages is fine — item keeps its snippet, generation degrades gracefully exactly as today).
- Never let extraction failure drop an item — it's enrichment, not gating.
- Persist per-run extraction counts into `IngestionRun` (add `content_fetched`/`content_failed` — additive fields) so the Admin page shows extraction health.

**A4. Downstream consumers (deliberately conservative).**
- **Embeddings: unchanged** (`title + snippet`) — full text would shift the vector space, invalidate the 0.88 dedup calibration, and cost more. Revisit only with evidence.
- **Categorization: feed it `title + snippet + first ~500 chars of content`** — materially better category/impact accuracy for link-only items, bounded token cost.
- **Generation: see Phase E** (the real consumer).
- **Chat retrieval**: include first ~300 chars of content in context blocks.

**A5. Tests.** Fixture-HTML extractor tests; per-adapter tests asserting `content` mapping; pipeline test that extraction failure still stores the item.

### Phase B — Lifecycle: refresh, decay, removal (V5) — ~3-4 days

**Execute the two existing FARSIT plans as written** — they were verified against this exact codebase on 2026-07-16 and their baseline facts still hold (re-confirmed today). Sequence:
1. Retention plan Change 1-2 (engagement re-polling job + decayed trend) — makes "out of trend" *detectable*.
2. Retention plan Change 3 (lifecycle `active/archived` + tombstone ledger + safe delete) — makes "finished trend removed" real, without the resurrection loop (GH-trending `published_at: undefined` hazard is handled there).
3. Retention plan Change 4 (feed defaults: default `lifecycle=active` filter + **fix the `-createdAt` default-sort no-op** → default sort by decayed trend/opportunity).
4. Dedup-updates plan (5 changes) after — it explicitly fulfills obligations the retention plan hands over (same-URL engagement refresh at hash-dedup; story-liveness archive protection).

One addition to those plans: when an item is archived/deleted, leave `GeneratedContent` rows untouched (they already store their own `topic`/`formats`) — verify with a test.

### Phase C — Team category subscriptions → personalized feed (V2) — ~1 day backend

**C1.** Add `Team.subscribed_categories: string[]` (subset of `NEWS_CATEGORIES`; empty = all). Keep `custom_categories` for the override feature it already serves — don't overload it.
**C2.** `GET /news-items`: when a team context exists (query `team_id` or user's team) and no explicit `?category=`, apply `category: { $in: subscribed }`. Explicit query param always overrides.
**C3.** Auto-generation: replace global top-3 with per-team `NewsItem.find({ category: { $in: team.subscribed_categories }, created_at: { $gte: 72h ago }, lifecycle: 'active' })` top-N — fixes both the category gap and the "same 3 items forever" bug in one move.
**C4.** PATCH /teams/:id accepts `subscribed_categories`; team-settings UI in Phase F.
**C5 (later, optional).** True custom interests: embed each custom category phrase and rank feed items by cosine — gives "Robotics" meaning without touching the fixed LLM taxonomy.

### Phase D — Bangla writer style packs (V7, feeds V9) — ~2-3 days backend/data + ongoing curation

**D1. Data model.** New module `StylePack`:
- `StylePack { name, slug, description, language: 'bangla'|'banglish'|'english', tone_tags: string[], style_card?: string, is_active, created_by }`
- `StyleExample { style_pack_id, content, embedding, platform: 'facebook'|'linkedin'|..., source_ref?: string, engagement_hint?: string }`
Global (not team-scoped), super_admin-curated. Teams get `Team.default_style_pack_id?` and requests get `style_pack_id?` override.

**D2. Corpus ingestion.** Bulk-import script mirroring `seedBrandVoice.ts` (`seed:style-pack -- <slug> <file.json>`) + admin CRUD endpoints. Curation is human work: collect 30-100 posts per pack from public pages of PH-style writers, spanning your fixed categories. **Store for internal style-reference retrieval only — never republish the examples themselves** (see Risks §8.3).
Launch packs (suggestion): `programming-hero` (energetic edtech), `casual-community` (dev-community bhai-tone), `formal-thought-leader` (LinkedIn-ish Bangla), `storyteller` (narrative hooks).

**D3. Style cards (the "accent" distillation).** One-time LLM analysis per pack (script): feed all examples → produce a ~300-word style card: sentence rhythm, hook patterns, emoji policy, Bangla/English code-switch ratio, CTA habits, signature phrases, what it *never* does. Store on the pack; regenerate when examples change. This gives the generation prompt cheap always-on style pressure beyond the few-shots.

**D4. Retrieval & prompt integration.** In `generateContent`: if a style pack resolves → fetch top 5-6 `StyleExample`s by topic cosine (same pattern as `fetchTopBrandVoiceExamples`) filtered to the target platform where possible. Prompt order: style card → style examples (labeled "write exactly like these") → team brand-voice examples (labeled "this team's own past posts — blend their specifics") → custom_instructions → grounding rules. Team voice examples stay relevant (product names, audience specifics) but the style pack owns tone.

**D5. Embedding note.** `text-embedding-3-small` handles Bangla acceptably for topic-similarity, but validate: embed 10 Bangla examples, query with related/unrelated topics, eyeball rankings. If poor, embed style examples by their *English topic summary* (LLM-extracted at import) instead — retrieval quality matters more than embedding purity here. Keep 1536-dim either way to reuse the index pattern.

### Phase E — Long-form, grounded, regenerable generation (V6, V9, V10) — ~2-3 days

**E1. Split generation per format.** Replace the single 5-format JSON call:
- Primary call(s): `facebook_post` and `linkedin_post` (can be 2 calls or 1 call with 2 keys — prefer 2 for length headroom and per-format few-shots). Explicit targets: FB 150-400 words with hook-first-line + spacing + emoji per style card; LinkedIn 1,200-2,500 chars, line-broken, 3-5 hashtags.
- Secondary formats (reel script, YouTube idea, caption) generated **on demand** from the editor ("also create a reel script"), not by default — saves tokens and focuses quality where the vision points (FB/LinkedIn).
- API shape: `POST /content/generate` gains `formats?: string[]` (default `['facebook_post','linkedin_post']`).

**E2. Facts-then-write pipeline (uses Phase A's `content`).** For items with `content_status: full|partial`:
- Call 1 (cheap `standard` model): extract from full content a bounded fact sheet — 5-10 key facts/numbers/quotes + a 3-sentence neutral summary.
- Call 2 (`content` model): write the post in style, given the fact sheet + snippet + url + style few-shots.
This is what makes "big content" *truthful* — long-form from a 1-line snippet forces either fluff or hallucination; the fact sheet fixes the input side, the (already shipped) grounding instruction guards the output side. When `content` is absent, skip call 1 (today's behavior, general-not-fabricated).

**E3. Regenerate & tweak endpoints (Canva loop).**
- `POST /content/generate` gains `regenerate: true` (cache-bypass; vary seed/temp) — cache key gains a variant counter.
- New `POST /content/refine`: `{ team_id, format, current_text, instruction }` — instruction from preset chips ("ছোট করো / shorter", "আরো casual", "stronger hook", "add CTA", "more emojis") or free text; rewrites preserving style/language; not cached.
- Persist manual generations: on success, upsert into `GeneratedContent` with `source: 'manual'` so the drafts list (already built for auto) covers both and "tweak → save" has a home. (Today manual results are never stored — only Redis.)

**E4. Model & reliability.**
- Fix the dead failover: set `LLM_MODEL_FALLBACK` to a *different* model.
- Run the deferred Bangla fluency bake-off (RAG-BANGLA §1.4) with the style packs in place: 3-4 candidate `LLM_MODEL_CONTENT` values × 5 topics, native-speaker review (Bangla correctness, PH-vibe, AI-tell absence). Budget reality: the free-tier decision expired with the demo; a paid mid-tier model per post is likely a fraction of a cent and is the single highest-leverage quality lever for V9. Env-only change either way.
- Add anti-AI-tell instructions to the system prompt (varied sentence lengths; no formulaic openers like "আজকের যুগে"; no summary-closers; concrete over abstract; write like the examples' rhythm).

**E5. Optional polish pass.** A `critique-and-rewrite` second call ("find AI-sounding sentences and rewrite them in this style") behind a flag — evaluate whether it's worth latency/cost after E4's bake-off.

### Phase F — The product surface: Feed + Editor (V3, V6, V8) — ~3-5 days frontend

**F1. Feed page** (`/dashboard/feed`) against existing `GET /news-items`:
- Card list (daily.dev-style grid/rows): title, source badge + favicon, age, category chip, trend + opportunity scores (visual meters), `high_opportunity` highlight (emerald), engagement counts, snippet preview.
- Controls: category tabs (team's subscribed set + All), sort (Opportunity / Trending / Newest — pass explicit `sort=-opportunity_score` etc. until Phase B fixes the default), search box (`searchTerm`), pagination/infinite scroll.
- Item detail drawer: full snippet/content preview, impact note, link out, **"✨ Generate content" CTA** → routes to Generate with `news_item_id`.
**F2. Generate page** — the Canva flow:
- Entry: from feed item (preloaded context card) or manual topic input.
- Controls row: language (team default preselected), style pack selector (Phase D), format checkboxes (FB/LinkedIn default).
- Output: per-format cards with editable textarea (auto-height), character/word counter (platform-aware), **Copy** button (with copied-state), **Regenerate** (E3), tweak chip row → `/content/refine`, "Save draft".
- Loading: per-card skeleton + streaming later if SSE is added.
**F3. Drafts page**: list `GeneratedContent` (auto + manual) with status workflow (existing PATCH), filter by status/source.
**F4. Settings**: Brand Voice CRUD page (backend fully done — `RAG-BANGLA-PLAN.md` §1.3b flagged this as the missing input surface), team voice profile (language + custom instructions), subscribed categories, default style pack; team switcher in the shell (replace first-team-only `useTeamId`).
**F5. Wire Chat page** to the existing chat backend.

### Phase G — Small fixes to fold into the above (each ≤1h)

1. `-createdAt` default-sort no-op → covered in B; if B is deferred, fix standalone (`QueryBuilder` default or explicit sort in `newsItem.service.ts`).
2. `LLM_MODEL_FALLBACK` = primary → failover dead (`.env`).
3. Auto-gen: age + category + lifecycle filters (folded into C3).
4. `CLAUDE.md` frontend map is stale → rewrite to match `routes/`-based reality.
5. Auto-gen `summary.skipped` conflates "no examples" teams with already-drafted items — minor observability cleanup.
6. Consider raising `TOP_NEWS_PER_TEAM`/`AUTO_GENERATION_MAX_PER_RUN` once per-team category feeds exist.

---

## 7. Suggested OpenSpec change breakdown (when you're ready to propose)

Ordered; each is one `/opsx:propose` → `/opsx:apply` → verify → archive cycle:

| # | Change id (suggested) | Covers | Depends on |
|---|---|---|---|
| 1 | `news-full-content-api-sources` | Phase A1 + A2 (schema + per-source API upgrades) | — |
| 2 | `news-content-extraction` | Phase A3 + A4 + A5 (readability layer, categorize widening, run counts) | 1 |
| 3-6 | retention plan changes 1-4 | Phase B — **use `2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md` as the proposal input, as its header instructs** | — |
| 7 | `team-category-subscriptions` | Phase C | — |
| 8 | `style-packs-model-and-seed` | Phase D1 + D2 + D5 | — |
| 9 | `style-packs-generation-integration` | Phase D3 + D4 | 8 |
| 10 | `generation-longform-formats` | Phase E1 + E4 fixes | — |
| 11 | `generation-facts-then-write` | Phase E2 | 1, 2, 10 |
| 12 | `generation-refine-and-regenerate` | Phase E3 | 10 |
| 13 | `frontend-feed-page` | Phase F1 | none (API exists) |
| 14 | `frontend-generate-editor` | Phase F2 + F3 | 10, 12 for full power (can ship against current API first) |
| 15 | `frontend-team-settings-voice` | Phase F4 | 7, 8 |
| 16-20 | dedup-updates plan changes 1-5 | Phase B tail | 3-6 |

Parallelization: {1,2} ∥ {3-6} ∥ {7} ∥ {8,9} ∥ {13} — five independent tracks. The frontend track (13, 14) can start **immediately** against today's APIs and absorb backend improvements as they land.

**If a demo is imminent** (RAG-BANGLA-PLAN notes demo 2026-07-18): the only work that changes what an audience *sees* is track 13-14 (Feed + Generate UI) plus seeding brand-voice examples for the demo team. Everything else is invisible on a projector.

---

## 8. Risks & decisions needed from you

1. **Model budget (decision).** "Not feel AI-generated" in pure Bangla long-form vs "free tier only" are in real tension. Recommendation: run the E4 bake-off, expect to move `LLM_MODEL_CONTENT` to a paid mid-tier model (env-only change; generation volume is low — interactive requests + ≤10 auto-drafts/day).
2. **Bangla embedding quality (validate, D5).** Topic-retrieval over Bangla style examples with `text-embedding-3-small` needs a 30-minute eyeball test before building on it; fallback design included above.
3. **Copyright/ethics of the writer corpus (accept/scope).** Storing public posts as internal style references for retrieval is standard RAG practice, but generated output must imitate *tone*, never reproduce sentences; keep packs internal, attribute nothing publicly, and be ready to drop a pack if a writer objects. Style cards (D3) reduce leakage risk versus raw few-shots alone.
4. **Scraping ToS/paywalls (accept).** A3 extraction hits publisher pages (TechCrunch, Wired…). Read-only, low-volume (tens/run), honoring timeouts — normal aggregator behavior (daily.dev does the same), but paywalled/JS-only pages will land `content_status: failed`; the system must (and does, by design) degrade to snippet-grounded generality.
5. **Retention semantics (product decision, cheap).** "Finished trend removed" — removed from the *feed* (archive, recoverable, still generatable from history) vs *deleted from DB*. The FARSIT plan's archive-then-delete-with-tombstones supports both; pick the archive window (e.g., archive at 3-4 days out-of-trend, hard-delete at 30) when proposing change #5.
6. **Taxonomy evolution (defer-able).** Six fixed categories serve the demo; if teams need real custom interests, C5's embedding-match approach avoids destabilizing the categorization LLM contract.
7. **Free-tier LLM rate limits during ingestion** already bit once (embed batching comment in `newsIngestion.utils.ts:48-51`) — Phase A's categorization widening slightly grows tokens/run; watch `IngestionRun` errors after shipping.

---

## 9. Bottom line

The **trend-intelligence half** of your idea (V1, V3-backend, V5-design) is genuinely well built — better than typical hackathon quality, with observability and tests. The **content-intelligence half** (full text, writer-style RAG, long-form humanized Bangla) exists as a thin but correctly-shaped skeleton: every needed primitive (embeddings, vector retrieval, few-shot prompting, voice profiles, grounding) is already in the codebase — what's missing is the *data* (full content, style corpora), the *depth* (per-format long-form, facts-then-write, refine loop), and above all the *surface* (Feed + Generate editor), without which the platform cannot serve anyone regardless of backend quality.

Nothing in the current architecture fights the vision — no rewrites are needed, only additions. The fastest path to "the system serves the idea": **ship the Feed + Generate UI against today's APIs (track 13-14), execute the already-written retention plans (track 3-6), and build full-content + style packs (tracks 1-2, 8-9) as the quality multiplier underneath.**
