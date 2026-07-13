# Robayat Kalam Farsit — API Contract & Platform Analytics

**Role:** API design, platform analytics (Facebook/YouTube/LinkedIn), reporting, opportunity scoring  
**Owns:** `backend/analytics/**`, `backend/reports/**`, `openapi/**`  
**Deadline:** July 16, 2026

---

## Task Board

### ⚡ July 13 FIRST — External Dependency (before any code)
| Status | Task | Notes |
|--------|------|-------|
| ⬜ Todo | Ping Mursalin for platform tokens | **Mursalin (page admin) is not on the dev team** — he must generate the Meta page token, YouTube API key, and LinkedIn app access. This blocks all three analytics changes. Chase TODAY. |

### July 13 (Today) — API Contract + Credentials
| Status | Change | Branch | Notes |
|--------|--------|--------|-------|
| ⬜ Todo | `api-contract-openapi` | `feat/api-contract-openapi` | Define all REST endpoints + **stub server** so Mehedi can build UI immediately. Merge ASAP. |
| ⬜ Todo | `platform-api-credentials` | `feat/platform-api-credentials` | Meta / YouTube / LinkedIn app setup. **Submit LinkedIn app NOW — approval takes 2–3 days.** |

### July 14 — Platform Analytics
| Status | Change | Branch | FRs | Notes |
|--------|--------|--------|-----|-------|
| ⬜ Todo | `facebook-analytics` | `feat/facebook-analytics` | FR-06, FR-26 | Meta Graph API: reach, engagement, top posts, best times; 6h refresh. **Include manual refresh endpoint (FR-26) for Mehedi's admin UI. Start here — slowest API.** |
| ⬜ Todo | `youtube-analytics` | `feat/youtube-analytics` | FR-07 | YouTube Data API v3: views, watch time, CTR, top videos |
| ⬜ Todo | `linkedin-analytics` | `feat/linkedin-analytics` | FR-08 | LinkedIn API: impressions, engagement, demographics. **Cut first if behind — Should Have, approval may not arrive.** |

### July 15 — Scoring + Reporting
| Status | Change | Branch | FRs | Notes |
|--------|--------|--------|-----|-------|
| ⬜ Todo | `opportunity-scoring` | `feat/opportunity-scoring` | FR-24 | Embed posts → vectorSearch → opportunity_score = trend × audience |
| ⬜ Todo | `cross-platform-report` | `feat/cross-platform-report` | FR-09–12 | Unified 30-day report + AI insight + content-opportunity ranking; Redis 6h |

### July 16 — Integration
| Status | Change | Branch | Notes |
|--------|--------|--------|-------|
| ✦ | Integration testing | — | Verify analytics data flows into Mehedi's report-ui correctly |

---

### Status Key
| Symbol | Meaning |
|--------|---------|
| ⬜ Todo | Not started |
| 🔄 In Progress | Branch open, work ongoing |
| 👀 In Review | PR open, awaiting review |
| ✅ Done | Merged to `main` |

---

## Independence Notes
- You are **independent from Samin's features** — you only need his `.env` values (Mongo URI, Redis URL) to wire connections, not his completed features.
- Mehedi builds against your **stub server from Day 1** — he doesn't need the real analytics to be working.
- LinkedIn approval is your biggest risk — start the app registration today even before any code.

---

## API Credentials Tracker

| Platform | App Created | Token Generated | Added to `.env` |
|----------|:-----------:|:---------------:|:---------------:|
| Facebook / Meta | ⬜ | ⬜ | ⬜ |
| YouTube | ⬜ | ⬜ | ⬜ |
| LinkedIn | ⬜ | ⬜ | ⬜ |

> Share tokens securely (never commit to git). Whoever has page-admin access generates them.

---

## Daily Workflow

```bash
# Start of day
git checkout main && git pull --rebase origin main
git checkout feat/<change-name> && git rebase main

# Plan + implement
/opsx:propose <change-name>
/opsx:apply <change-name>

# Before PR
cd backend && npm run typecheck

# Ship
git push -u origin feat/<change-name>
gh pr create --fill
```

---

## Notes
<!-- Add blockers, decisions, or progress notes here -->
