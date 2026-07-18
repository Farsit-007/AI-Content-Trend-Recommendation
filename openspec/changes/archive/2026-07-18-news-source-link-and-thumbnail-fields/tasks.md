## 1. Schema & interface

- [x] 1.1 `newsIngestion.interface.ts`: `RawNewsItem` gains `discussion_url?: string`, `thumbnail_url?: string`
- [x] 1.2 `newsItem.interface.ts`: `INewsItem` gains the same two optional fields
- [x] 1.3 `newsItem.model.ts`: corresponding schema fields (`{ type: String }`, no validation constraints)
- [x] 1.4 `newsIngestion.service.ts`: add `discussion_url: item.discussion_url, thumbnail_url: item.thumbnail_url,` to the explicit `payloads` map (design.md decision 6 — the non-obvious required touch point; confirm via a test that these fields actually persist end-to-end, not just compile)

## 2. Adapter fixes

- [x] 2.1 `reddit.ts`: add `url`, `is_self`, `thumbnail` to `RedditPost`; map `url`/`discussion_url`/`thumbnail_url` per design.md decision 1
- [x] 2.2 `producthunt.ts`: add `website`, `thumbnail { url }` to the GraphQL query and `ProductHuntNode`; map `url`/`discussion_url`/`thumbnail_url` per design.md decision 2
- [x] 2.3 `hackerNews.ts`: add `discussion_url` unconditionally per design.md decision 3
- [x] 2.4 `lobsters.ts`: add `discussion_url: story.comments_url` unconditionally per design.md decision 3
- [x] 2.5 `devto.ts`: add `thumbnail_url: article.cover_image ?? article.social_image` (extend `DevToArticle`)
- [x] 2.6 `gnews.ts`: add `thumbnail_url: article.image` (extend `GNewsArticle`)
- [x] 2.7 `rss.ts`: add `media:thumbnail`/`enclosure` to `customFields`, resolve `thumbnail_url` per design.md decision 5

## 3. API documentation

- [x] 3.1 `docs/schemas.ts`: `NewsItem` schema gains `discussion_url`/`thumbnail_url`
- [x] 3.2 `docs/newsItemPaths.ts`: confirm response examples/descriptions reflect the new fields where relevant (no inline field examples exist there — covered entirely by the shared schema)

## 4. Frontend

- [x] 4.1 `lib/api/news.ts`: `NewsItemDto` gains `discussion_url?: string`, `thumbnail_url?: string`
- [x] 4.2 `NewsCard.tsx`: render `item.thumbnail_url` as an image when present; category-based placeholder icon (per design.md decision 7) when absent
- [x] 4.3 `NewsItemDrawer.tsx`: render `discussion_url` as a second, visually distinct link when present, alongside the existing primary resource link

## 5. Tests

- [x] 5.1 Per-adapter unit tests (extend `newsIngestion.reddit.test.ts`, `.producthunt.test.ts`, `.hackernews.test.ts`, `.lobsters.test.ts`, `.devto.test.ts`, `.gnews.test.ts`, `.rss.test.ts`): assert the new field mappings for each of the scenarios in specs/news-ingestion/spec.md — Reddit link-post vs self-post, Product Hunt url/website/discussion_url split, HN/Lobsters discussion_url always present, Dev.to/GNews thumbnail capture, RSS best-effort thumbnail present/absent, Reddit thumbnail sentinel filtering
- [x] 5.2 `newsIngestion.service.ts` integration test (extend existing pipeline test): confirm `discussion_url`/`thumbnail_url` on a `RawNewsItem` survive all the way through to the actual inserted `NewsItem` document — the specific regression this change's design.md decision 6 exists to prevent
- [x] 5.3 `cd backend && npm test && npm run build` (418/418 tests pass, build clean)

## 6. Verification

- [x] 6.1 `cd backend && npm test` (418/418 passed)
- [x] 6.2 `cd backend && npm run build` (clean)
- [x] 6.3 `cd frontend && npm run build && npm run lint` (build clean; the 3 pre-existing lint errors are in unrelated files not touched by this change's diff)
- [x] 6.4 Live check: ran each adapter directly against its real external API (GNews, Dev.to, HackerNews, Lobsters — no Docker/Redis dependency) via a scratch ts-node script, deleted after. GNews: 10/10 items with a real thumbnail_url; Dev.to: 62/62 with a real thumbnail_url; HackerNews: 61/61 items with discussion_url populated; Lobsters: 25/25 items with discussion_url populated. Product Hunt's schema (url/website/thumbnail split) was already independently live-verified earlier this session against the real GraphQL API (recorded in design.md's Context section) — not re-run here since its token caching needs Redis, which isn't running locally (Docker Desktop not started). Full end-to-end pipeline run (adapters → embed → categorize → insert) was not exercised against production Atlas/OpenRouter for this task — the field-survival risk that would matter for that is already covered by the `newsIngestion.service` integration test (task 5.2), which proves discussion_url/thumbnail_url survive the exact insertMany step design.md flagged as the risk.
- [ ] 6.5 Live check: Reddit credentials (`REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`) are still unset in this deployment's `.env` — the `thumbnail` sentinel-string behavior remains unverified live; still relies on documented Reddit API behavior per design.md's Open Question. Re-check when credentials become available.
- [x] 6.6 Browser check (Playwright against the real dev servers, logged in as super admin): seeded 2 scratch `NewsItem` docs directly in the dev DB (one with a real `thumbnail_url`, one without), confirmed on the Feed page that the thumbnailed item renders the actual `<img>` (picsum.photos loaded correctly) and the un-thumbnailed item renders its DevOps category placeholder icon (0 `<img>` elements, icon present); opened the drawer and confirmed the `discussion_url` renders as a second, visually distinct "Discussion" link (MessageCircle icon) alongside the primary source link, with the correct href. No console errors beyond the pre-existing, expected refresh-token 401s (see `tokenStore.ts`). Also incidentally confirmed the category-based placeholder icons render correctly on real, non-scratch production feed items (Sparkles/AI, Code2/Web Dev, Briefcase/Career, Shield/Security, Server/DevOps all visible in the full feed screenshot). Scratch items deleted from the DB afterward; scratch scripts removed.
