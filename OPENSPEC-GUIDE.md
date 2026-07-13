# How to Use OpenSpec — Growth Studio Team Guide

---

## What Is OpenSpec?

Before writing any code, you generate a plan. OpenSpec stores that plan in a folder.  
Claude then reads the plan and builds the feature for you.

**One feature = one change folder = one branch.**

---

## The 6 Steps

### Step 1 — Propose (generate the plan)

```bash
/opsx:propose <change-name>
```

Claude automatically creates:

```
openspec/changes/<change-name>/
├── proposal.md   ← WHY (problem this solves)
├── design.md     ← HOW (technical decisions)
├── specs/        ← WHAT (requirements)
└── tasks.md      ← STEPS (checklist Claude will follow)
```

> Read the 4 files. If something looks wrong, fix it before moving on.

---

### Step 2 — Create your branch

```bash
git checkout main && git pull --rebase origin main
git checkout -b feat/<change-name>
```

> Branch name must match the change name.

---

### Step 3 — Apply (write the code)

```bash
/opsx:apply <change-name>
```

Claude reads `tasks.md` and implements every task one by one, checking them off as it goes.  
This is where the actual code gets written.

---

### Step 4 — Check quality

```bash
# Frontend
cd frontend && npm run typecheck && npm run lint

# Backend
cd backend && npm run typecheck
```

> Both must pass before opening a PR.

---

### Step 5 — Ship it

```bash
git push -u origin feat/<change-name>
gh pr create --fill
```

- Tag one teammate as reviewer
- They approve → squash merge on GitHub → delete the branch

---

### Step 6 — Archive (after merge)

```bash
git checkout main && git pull --rebase origin main
/opsx:archive <change-name>
```

Closes the change folder and moves specs to their permanent home.

---

## Quick Reference

| Command | When to use |
|---------|------------|
| `/opsx:propose <name>` | Start of every feature — generates the plan |
| `/opsx:apply <name>` | After branch is created — writes the code |
| `/opsx:explore` | When you're unsure about a feature — think it through first |
| `/opsx:update <name>` | When requirements change mid-build — revises the plan |
| `/opsx:sync <name>` | Syncs specs without archiving |
| `/opsx:archive <name>` | After PR is merged — closes the change |

---

## Real Examples — Your Features

### Mehedi

```bash
# Feature 1
/opsx:propose news-feed-dashboard
git checkout -b feat/news-feed-dashboard
/opsx:apply news-feed-dashboard

# Feature 2
/opsx:propose content-generator-ui
git checkout -b feat/content-generator-ui
/opsx:apply content-generator-ui

# Feature 3
/opsx:propose report-ui
# ... and so on
```

### Samin

```bash
# Day 1 — do this first, everyone is waiting
/opsx:propose backend-scaffold
git checkout -b feat/backend-scaffold
/opsx:apply backend-scaffold

# Day 1 — second
/opsx:propose db-vector-indexes
git checkout -b feat/db-vector-indexes
/opsx:apply db-vector-indexes
```

### Robayat

```bash
# Day 1 — do this first, Mehedi needs the stub server
/opsx:propose api-contract-openapi
git checkout -b feat/api-contract-openapi
/opsx:apply api-contract-openapi

# Day 1 — parallel with above
/opsx:propose platform-api-credentials
git checkout -b feat/platform-api-credentials
/opsx:apply platform-api-credentials
```

---

## Rules

1. **Never share a change folder.** One person per `openspec/changes/<name>/`.
2. **Propose before you apply.** Never run `/opsx:apply` without running `/opsx:propose` first.
3. **One change at a time.** Finish and merge before starting the next one.
4. **Read the plan before applying.** If `tasks.md` looks wrong, fix it — applying bad tasks wastes hours.

---

## What the Folder Looks Like After Propose

```
openspec/changes/news-feed-dashboard/
├── .openspec.yaml
├── proposal.md
├── design.md
├── specs/
│   └── news-feed-dashboard/
│       └── spec.md
└── tasks.md
```

You can see a real example already in the repo:
```
openspec/changes/about-us/         ← completed change
openspec/changes/add-landing-page-project-idea-requirements/   ← completed change
```

---

## Full Cycle — One Page

```
/opsx:propose <name>          →  plan is generated
git checkout -b feat/<name>   →  your isolated branch
/opsx:apply <name>            →  code is written
typecheck + lint              →  quality check
gh pr create --fill           →  teammate reviews
squash merge on GitHub        →  landed in main
/opsx:archive <name>          →  change closed
```
