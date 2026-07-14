# Mehedi Imun — Frontend (Next.js 16)

**Role:** All UI — dashboard, content generator, reports, chat, admin  
**Owns:** `frontend/app/**`, `frontend/components/**`  
**Deadline:** July 16, 2026

---

## Independence Strategy — Mock Data First

> **You don't wait on anyone.** Build every screen with realistic hardcoded mock data from Day 1.  
> On **July 15**, do one pass to swap `mockData` → `fetch('/api/...')` across all screens — behind a `USE_MOCK` flag.  
> This way your UI is 100% done before the backend even needs to be finished.

```ts
// Day 1–2: use this pattern
const data = MOCK_NEWS_ITEMS   // hardcoded realistic data

// Day 3: swap to this — with mock fallback for demo day
const data = process.env.NEXT_PUBLIC_USE_MOCK === "true"
  ? MOCK_NEWS_ITEMS
  : await fetch('/api/news').then(r => r.json())
```

---

## Task Board

### Already Done
| Status | Change | Notes |
|--------|--------|-------|
| ✅ Done | `landing-page` | Merged |
| ✅ Done | `about-us` | Merged |

### July 13 (Today) — Feed + Content Generator UI
| Status | Change | Branch | FRs | Notes |
|--------|--------|--------|-----|-------|
| ⬜ Todo | `news-feed-dashboard` | `feat/news-feed-dashboard` | FR-05, FR-24 | daily.dev-style card feed, tabs, sort, 🔥 trend + "High opportunity" badges — **use mock data** |
| ⬜ Todo | `content-generator-ui` | `feat/content-generator-ui` | FR-13–17, FR-21 | Generate button → 5 format panels, copy-to-clipboard — **use mock data** |

### July 14 — Report + Chat + Admin UI
| Status | Change | Branch | FRs | Notes |
|--------|--------|--------|-----|-------|
| ⬜ Todo | `report-ui` | `feat/report-ui` | FR-09–11 | 30-day report: overview, per-platform charts, AI insight — **use mock data** |
| ⬜ Todo | `chat-ui` | `feat/chat-ui` | FR-22 | Ask Growth Studio chat panel — **use mock data** |
| ⬜ Todo | `admin-triggers-ui` | `feat/admin-triggers-ui` | FR-25, FR-26 | "Run ingestion" + "Refresh analytics" buttons — **use mock data** |
| ⬜ Todo | Brand-voice seed posts | — | FR-18 | Collect 25–30 real high-engagement posts from PH Facebook/LinkedIn (needs Mursalin's access) — **unblocks Samin's RAG work tomorrow** |

### July 15 — Wire Up Real API
| Status | Change | Branch | Notes |
|--------|--------|--------|-------|
| ⬜ Todo | `api-wiring` | `feat/api-wiring` | Swap mock data → real `fetch()` calls behind a `USE_MOCK` env flag. One PR covers all screens. **Keep the mock folder — it's the demo-day fallback.** |

### July 16 — Polish + Demo (NO feature work)
| Status | Change | Branch | Notes |
|--------|--------|--------|-------|
| ⬜ Todo | UI polish | — | Loading states, error handling, empty states, responsive check |
| ⬜ Todo | Demo script + run-through | — | Write the walkthrough script; full happy-path run with team; warm app 5 min before presenting |

---

### Status Key
| Symbol | Meaning |
|--------|---------|
| ⬜ Todo | Not started |
| 🔄 In Progress | Branch open, work ongoing |
| 👀 In Review | PR open, awaiting review |
| ✅ Done | Merged to `main` |

---

## Mock Data Location
Put all mock data in `frontend/lib/mock/`:
```
frontend/lib/mock/
├─ news.ts          # mock news feed items
├─ report.ts        # mock analytics report data
├─ content.ts       # mock generated content
└─ chat.ts          # mock chat responses
```
**Do NOT delete this folder on July 15** — keep it as the `USE_MOCK` fallback for demo day. Remove only after the demo.

---

## Component Conventions
- Feature components: `frontend/components/<feature>/ComponentName.tsx`
- Landing sections: `frontend/components/landing/`
- Shared UI (shadcn): `frontend/components/ui/` — never modify, just import
- Pages: `frontend/app/<route>/page.tsx`
- Icons: `lucide-react`

---

## Shared Files to Handle Carefully

| File | Rule |
|------|------|
| `frontend/app/page.tsx` | Append-only at end of list — never reorder existing lines |
| `frontend/components/landing/Navbar.tsx` | Add one new line to `navLinks` — don't touch others' entries |
| `frontend/package.json` / lockfile | Announce dep additions in chat; PR the dep separately first |

---

## Daily Workflow

```bash
# Start of day
git checkout main && git pull --rebase origin main
git checkout feat/<change-name> && git rebase main

# Plan + implement
/opsx:propose <change-name>
/opsx:apply <change-name>

# Before PR (must pass)
cd frontend && npm run typecheck && npm run lint

# Ship
git push -u origin feat/<change-name>
gh pr create --fill
```

---

## Notes
<!-- Add blockers, decisions, or progress notes here -->
- **2026-07-14**: The backend gained real auth + multi-team + roles this session (`multi-team-rbac`, `super-admin-platform-catalog` — see `SAMIN.md`). Doesn't change anything for your mock-data screens today, but it does change what `api-wiring` (July 15) and `admin-triggers-ui` need to account for:
  - Every real API call now needs `Authorization: Bearer <token>` from `POST /auth/login` — no more open, unauthenticated endpoints.
  - There's no public sign-up screen to build — accounts are created by an admin/super_admin (`POST /users`), so `api-wiring` needs a login screen, not a register screen.
  - Three roles now exist: `user` (sees only their own team's data), `admin` (manages users/teams), `super_admin` (also manages the platform catalog — which social platforms exist system-wide). If `admin-triggers-ui` grows to include user/team/platform management, that's role-gated UI, not just buttons.
  - Data is per-team now (news feed stays global, but platform posts / brand voice / credentials are per-team) — worth keeping in mind if the dashboard ever needs a team switcher.
  - Full live contract, incl. all the new endpoints, is always at `/api/v1/docs`; a matching Postman collection is at `backend/Hackathon process.postman_collection.json`.
- **2026-07-14**: Samin's `news-ingestion-pipeline` (see `SAMIN.md`) touched **your file**, `frontend/components/admin/AdminPanel.tsx` — the "Run News Ingestion" card now calls the real `POST /news-items/ingest` instead of the mock `setTimeout`, and shows the real per-source summary in the toast. "Refresh Analytics" is untouched (still mock — that's Robayat's endpoint, not built yet). Two things to know before you pick `admin-triggers-ui` back up:
  - Added `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:5000/api/v1` if unset — matches the backend's actual dev `PORT=5000` from `.env`, not the `3001` fallback baked into `backend/src/app/config/index.ts`).
  - The call reads a Bearer token from `localStorage.getItem('auth_token')` — but **nothing sets that key yet**, since there's no login screen anywhere in the frontend. Until `api-wiring` builds a login flow that stores the token there, clicking the button in a real (non-mocked) run will hit the endpoint unauthenticated and get a 401. This was a deliberate call (confirmed with the user) to keep the wiring mechanically correct and ready, rather than block this change on building auth UI that's really `api-wiring`'s job.
