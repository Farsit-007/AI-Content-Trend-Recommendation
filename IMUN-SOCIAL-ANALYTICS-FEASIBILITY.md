# Social Media Analytics Integration — Feasibility Report

**Project:** Growth Studio — AI Content & Trend Intelligence Platform
**Date:** 2026-07-16
**Question:** Can we legally/technically pull performance & reach analytics (FB, IG, LinkedIn, X, YouTube, TikTok, …) for a team's connected social handles? If a platform doesn't allow it, can n8n get around that? What should we actually build?

---

## 1. What we have built today (codebase audit)

The analytics feature is already scaffolded end-to-end in `backend/src/app/modules/Analytics/`:

| Piece | File | State |
|---|---|---|
| Adapter registry | `adapters/index.ts` | Real adapters for `facebook`, `youtube`, `linkedin`; everything else falls back to mock |
| Facebook adapter | `adapters/facebook.ts` | Calls Graph API `me/posts` + `insights.metric(post_impressions, post_engaged_users, post_clicks)` |
| YouTube adapter | `adapters/youtube.ts` | Calls Data API v3 `search?forMine=true` with an **API key** |
| LinkedIn adapter | `adapters/linkedin.ts` | Stub — always returns `pending_approval` |
| Mock adapter | `adapters/mock.ts` | Deterministic seeded fake posts/metrics per team+platform |
| Rollup engine | `analytics.rollup.ts` | Computes overview, top posts, best posting times, format breakdown from adapter posts |
| Refresh job | `analytics.service.ts` + `lib/scheduler.ts` | Cron `0 */6 * * *`, iterates teams × enabled platforms, embeds new posts for RAG, caches rollups |
| Credentials | `PlatformCredential` module + `lib/platformCredentials.ts` | Team-submitted, AES-encrypted, per-platform slug — any platform string allowed |
| Status model | `analytics.interface.ts` | `ok / not_connected / pending_approval / error` — degrades gracefully |

**Key fact: `ANALYTICS_USE_MOCK_ADAPTERS` defaults to `'true'`** (`config/index.ts:78`), so today *every* platform — including the three "real" adapters — serves mock data. The architecture is good; the real-data path is what this report is about.

### Bugs found in the real adapters (must fix before going live)

1. **YouTube adapter cannot work as written.** `search?forMine=true` requires **OAuth 2.0 user authorization** — it is rejected when called with a bare API key. An API key only reads *public* data. The adapter needs an OAuth access/refresh token flow, or switch to `channels?part=contentDetails` + uploads playlist for public metrics of a known channel ID.
2. **Facebook adapter metrics are partly deprecated.** Meta deprecated `post_engaged_users` (and several other Page insights metrics; more are scheduled for removal by **June 15, 2026** across all API versions). `post_clicks` availability is also affected. The adapter must migrate to the surviving metric set (e.g. `post_impressions_unique` for reach → verify against the current changelog).
3. **Facebook adapter hardcodes `likes/comments/shares` to 0**, so engagement rate for FB will always be 0 — it should request `reactions.summary(true),comments.summary(true),shares` fields.
4. **`me/posts` implies a user token.** For Pages analytics you need a **Page access token** and the post list should come from `/{page-id}/posts` (or `/{page-id}/published_posts`).

---

## 2. The core question: will platforms let us pull reach/performance analytics?

**Short answer: yes for a team's *own* accounts, via OAuth — but each platform gates it differently. No platform allows pulling private analytics for accounts you don't own. "Reach/impressions" are private metrics everywhere; public metrics (likes, comments, view counts) are easier.**

### Per-platform reality (verified July 2026)

| Platform | Private analytics (reach, impressions) | How | Gate / cost | Verdict for us |
|---|---|---|---|---|
| **YouTube** | ✅ Yes | YouTube **Analytics API** (`channel==MINE`), OAuth 2.0 only — views, watch time, impressions, CTR, subscriber deltas | Free. OAuth consent from channel owner. No app review needed for basic scopes at small scale | **Easiest win. Do this first.** |
| **Facebook Pages** | ✅ Yes | Graph API Page Insights (`/{page}/insights`, post-level `insights`) with `read_insights` + `pages_read_engagement` | Free, but **Meta App Review required** for production (typically 4–6 weeks); Business verification; metric deprecations landing June 2026 | Feasible, plan 4–6 weeks lead time |
| **Instagram** | ✅ Yes (Business/Creator accounts only) | Instagram Graph API `/{ig-user}/insights`, `/{media}/insights` — reach, impressions, saves, profile visits | Same Meta App Review path; IG account must be Business/Creator + linked to a FB Page; ~200 req/hr/account; several metrics deprecated since v21 | Feasible, same review as FB — bundle them |
| **LinkedIn** | ⚠️ Yes, but hard | **Community Management API** — org page analytics, follower stats, post reactions/comments | Partner-program style approval; **registered legal organizations only**; Development tier → Standard tier upgrade needs a screencast + use-case review; months of lead time | Our `pending_approval` stub is honest. Long-term item, not hackathon-viable |
| **X / Twitter** | ⚠️ Yes, but expensive | API is now **pay-per-use** (Feb 2026): ~$0.005/post read, owned-account reads $0.001; no free tier; legacy Basic ($200/mo) closed to new signups | Money, not approval. A team's own recent posts ≈ dollars/month, but it adds up across teams | Feasible if budget exists; deprioritize |
| **TikTok** | ⚠️ Partial | **Display API** (OAuth per creator): profile + video list with view/like/comment/share counts. Deeper analytics (audience, traffic sources) not exposed outside the restricted Research API | Free; developer app review 3–7 days | Public-ish metrics only — still useful for our rollups |
| **Others (Reddit, Threads, Bluesky…)** | Varies | Reddit: post scores via OAuth, no impressions for normal accounts. Threads API: basic insights exist. Bluesky: open API, public metrics | Low | Keep on mock until demanded |

### The universal pattern

Every platform follows the same rule: **the account owner must OAuth-consent to *your registered app*, and you get only *their* data.** Our credential model (team pastes a token) is close but not quite right — for Meta/YouTube/TikTok production access we need a proper **OAuth connect flow** ("Connect Facebook" button → redirect → we store the access+refresh token), not manual token paste. Manually pasted tokens expire (Meta user tokens: ~60 days max; YouTube access tokens: 1 hour without a refresh token).

---

## 3. The n8n question — answered honestly

**n8n does not change what platforms allow.** It's a workflow orchestrator; its Facebook/LinkedIn/YouTube nodes call the *same official APIs* with the *same OAuth credentials and the same approval gates* we face calling them ourselves. If the API requires App Review, n8n's node requires App Review.

**"Can n8n pull the data even if it isn't allowed?"** — that means scraping (headless browser or unofficial-API HTTP calls behind the login wall), and the answer is: technically sometimes, but **we should not do it**:

1. **ToS violation → account bans are near-certain over time.** Platforms detect automated logged-in access; the *team's real social account* is what gets banned — we'd be putting our users' business assets at risk, not just our app.
2. **Reach/impressions live behind login.** Scraping public pages can't see them anyway (public pages show likes/comments, not impressions). To scrape analytics dashboards you'd need to automate a logged-in session — exactly the behavior courts and platforms treat most harshly. Public-data scraping has some legal cover (the Meta/BrightData outcome); behind-login scraping has none.
3. **Legal/regulatory exposure.** Behind-login scraping risks CFAA-type claims and, where personal data is involved, GDPR/CCPA exposure.
4. **Fragility.** Login walls, 2FA, bot detection, DOM changes — a scraping pipeline breaks weekly. Terrible foundation for a product feature.

**Where n8n *is* legitimately useful for us:**
- Rapid prototyping of the official-API flows (its Meta/Google/LinkedIn OAuth nodes handle token refresh for you) before we port the calls into our adapters.
- Webhook-based ingestion glue: an n8n workflow polls an official API on a schedule and POSTs normalized results to our `POST /analytics/refresh`-style endpoint.
- Non-analytics automation (publishing, notifications).

So: **n8n = yes as an integration convenience over official APIs; no as a bypass.** There is no compliant bypass.

---

## 4. If a platform won't give us the data, what are the real solutions?

Ordered by effort-to-value for this project:

### Option A — Official OAuth integrations, staged by difficulty ✅ recommended core
1. **YouTube Analytics API** (free, no review, richest metrics) — replace the broken API-key adapter with OAuth + refresh tokens.
2. **Meta (FB + IG together)** — build the OAuth connect flow now, run in Dev Mode for our own test pages immediately (works without review for app admins/testers — fine for the demo), submit App Review in parallel for production.
3. **TikTok Display API** — quick review, per-creator OAuth, public metrics feed our existing rollup fine.
4. **LinkedIn Community Management API** — apply early (needs a registered legal org), keep `pending_approval` status until granted.
5. **X** — enable only when a customer justifies the per-read cost.

### Option B — Unified aggregator API 💰 fastest to "all platforms", costs money
Services like **Ayrshare** (13+ networks, normalized analytics schema, ~$499/mo business tier) or **Phyllo** (creator-focused, OAuth-based, custom pricing in the $1000s/mo) have already done every app review and maintain every adapter. Our architecture fits perfectly: one new `aggregator` adapter behind `getAdapter()` and every platform lights up at once. Right choice if/when this is a funded product; wrong choice for a hackathon budget.

### Option C — Owner-side data export (no API approval needed at all) 🆓 pragmatic fallback
Every platform gives *account owners* free native analytics (Meta Business Suite export, YouTube Studio CSV, LinkedIn page analytics XLS, `analytics.x.com` CSV). Build a **CSV/XLS upload endpoint** that maps exports into `IAdapterPost[]` → the entire rollup/RAG/report pipeline works unchanged. Zero approval, zero ToS risk, works for *every* platform including X without paying. Manual, but demo-honest and production-legal.

### Option D — Keep the mock adapter for demo day ✅ already done
`ANALYTICS_USE_MOCK_ADAPTERS=true` stays the demo path. It's deterministic and the whole report/chat pipeline runs on it. Just label the dashboard "demo data" to keep the pitch honest.

### Recommended stack
**Demo day:** D (mock) + A1 (real YouTube on our own channel — a live "this is real data" moment).
**Post-hackathon:** A1–A3 + C (CSV import) as the free tier; evaluate B (Ayrshare) when there's revenue; A4/A5 when approvals/budget land.

---

## 5. Concrete engineering roadmap

### Phase 0 — fixes to current code (hours)
- [ ] Fix `youtube.ts`: OAuth token instead of API key, or public-channel fallback via uploads playlist.
- [ ] Fix `facebook.ts`: Page token + `/{page-id}/published_posts`, non-deprecated metrics, real reactions/comments/shares.
- [ ] Add `token_expires_at` + refresh-token storage to `PlatformCredential` (schema supports opaque strings today; refresh needs structure).

### Phase 1 — OAuth connect flow (days)
- [ ] `GET /platforms/:platform/connect` → provider auth URL; `GET /platforms/:platform/callback` → store encrypted access+refresh tokens on the team.
- [ ] Frontend "Connect" buttons in team platform settings replacing raw token paste (keep paste as an advanced escape hatch).
- [ ] Token refresh inside `getPlatformToken()` when expired.

### Phase 2 — real integrations in order: YouTube → Meta (dev mode) → TikTok
- [ ] Per-platform adapter + integration test behind `ANALYTICS_USE_MOCK_ADAPTERS`.
- [ ] Meta App Review submission checklist (privacy policy URL, screencast, business verification) — start early, it's the long pole.

### Phase 3 — CSV import fallback (1–2 days)
- [ ] `POST /analytics/import` accepting platform-native CSV exports → parse to `IAdapterPost[]` → existing `computeRollup` + `embedNewPosts`.
- [ ] Per-platform column mappings (Meta Business Suite, YouTube Studio, LinkedIn, X).

### Phase 4 — LinkedIn & X (when unblocked)
- [ ] LinkedIn Community Management API application (needs legal-org details).
- [ ] X pay-per-use adapter gated by a per-team budget flag.

---

## 6. Bottom line

- **Platforms do allow it — for owned accounts, via OAuth, through registered apps.** Reach/impressions are never available for accounts you don't own, on any platform, by any compliant means.
- **The blocker is process (Meta review, LinkedIn approval) and money (X), not technology.** Our adapter architecture is already the right shape.
- **n8n is not a loophole.** It uses the same official APIs; using it (or anything) to scrape behind login walls risks banning our users' real business accounts and creates legal exposure. Hard no.
- **Fastest honest path:** fix the YouTube adapter (free, no review) for one real integration, keep mock for the demo, add CSV import as the universal free fallback, and start the Meta review clock now.

---

## Sources

- [Meta — Instagram Insights](https://developers.facebook.com/docs/instagram-platform/insights/) · [Meta — Page Insights reference](https://developers.facebook.com/docs/graph-api/reference/insights/) · [Meta — Permissions reference](https://developers.facebook.com/docs/permissions/)
- [Elfsight — Instagram Graph API guide 2026](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/) · [Zernio — Instagram API options 2026](https://zernio.com/blog/instagram-api)
- [Google — YouTube Analytics API channel reports](https://developers.google.com/youtube/analytics/channel_reports) · [Google — YouTube Analytics & Reporting APIs](https://developers.google.com/youtube/analytics)
- [Microsoft Learn — LinkedIn Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview?view=li-lms-2026-06) · [Microsoft Learn — LinkedIn increasing access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-05) · [Phyllo — LinkedIn API access 2026](https://www.getphyllo.com/post/linkedin-api-access-in-2026-partner-program-approval-timeline-alternatives)
- [Sorsa — X API pricing 2026](https://api.sorsa.io/blog/twitter-api-pricing-2026) · [Netrows — X API tiers 2026](https://www.netrows.com/blog/x-twitter-api-pricing-tiers-2026)
- [TikTok — Display API overview](https://developers.tiktok.com/doc/display-api-overview) · [TikTok — API scopes](https://developers.tiktok.com/doc/tiktok-api-scopes)
- [SocialCrawl — social media scraping legal & technical primer](https://www.socialcrawl.dev/blog/social-media-scraping-legal-technical-guide) · [ScrapeCreators — what happens if platforms catch you scraping](https://scrapecreators.com/blog/caught-scraping-by-platform) · [Latenode — n8n web scraping legal considerations](https://latenode.com/blog/n8n-web-scraping-guide-2025-tutorial-legal-considerations-better-alternatives)
- [Ayrshare — unified social media API](https://www.ayrshare.com/) · [Phyllo — creator data APIs](https://www.getphyllo.com/) · [Outstand — best unified social APIs 2026](https://www.outstand.so/blog/best-unified-social-media-apis-for-devs)
