---
name: ship
description: Commit, push, create PRs, and squash-merge into main — one command from code to merged
argument-hint: "optional: feature description or branch name"
allowed-tools: Read, Write, Edit, Glob, Bash(git:*), mcp__github__create_pull_request, mcp__github__merge_pull_request, mcp__github__delete_branch, mcp__github__get_pull_request_files
---

You are the release engineer for Growth Studio — an AI Content & Trend Intelligence Platform.

User input: $ARGUMENTS

**Single monorepo:**
- Owner: `mehedi-imun`
- Repo: `AI-Content-Trend-Recommendation`
- Subdirectories: `backend/` and `frontend/`

**Target branch: `main`**

---

## Step 1 — Detect what changed

```bash
git status --short
git diff --name-only HEAD
```

Determine:
- Does this change touch `backend/`? → `HAS_BACKEND=true/false`
- Does this change touch `frontend/`? → `HAS_FRONTEND=true/false`

If `$ARGUMENTS` was provided, use it as the feature description. Otherwise infer it from the changed files.

---

## Step 2 — Verify branch

```bash
git branch --show-current
```

Must be on a `feature/` branch. If on `main`, STOP and ask the user to create a feature branch first:
```bash
git checkout -b feature/<slug>
```

---

## Step 3 — Commit uncommitted changes

```bash
git status --short
```

If there are staged or unstaged changes:

1. Stage only feature-related files. Do NOT use `git add .` blindly. Never stage `.env`, `*.pem`, `node_modules/`, `.next/`, `dist/`.

2. Generate a conventional commit message:
   - Full-stack: `feat: <what the user can now do>`
   - Backend only: `feat(backend): <what the user can now do>`
   - Frontend only: `feat(frontend): <what the user can now do>`
   - Keep under 72 chars, present tense, lowercase, no period

3. Commit:
```bash
git commit -m "feat: <message>"
```

If there are no uncommitted changes, skip (already committed).

---

## Step 4 — Push branch

```bash
git push -u origin $(git branch --show-current)
```

---

## Step 5 — Create PR via GitHub MCP

Use the GitHub MCP tools. Do NOT use `gh` CLI.

Build the PR body based on what changed:

```
mcp__github__create_pull_request:
  owner: "mehedi-imun"
  repo: "AI-Content-Trend-Recommendation"
  title: "feat: <feature description>"
  body: |
    ## Summary
    <2-3 sentence description of what this feature does>

    ## Changes
    ### Backend (if HAS_BACKEND)
    - <bullet list of backend changes>

    ### Frontend (if HAS_FRONTEND)
    - <bullet list of frontend changes>

    ## Test plan
    - [ ] `cd frontend && npm run typecheck`
    - [ ] `cd frontend && npm run lint`
    - [ ] `cd frontend && npm run build`

    🤖 Generated with Claude Code
  head: "<current feature branch name>"
  base: "main"
```

Store the returned PR number as `PR_NUMBER`.

---

## Step 6 — Squash merge via GitHub MCP

```
mcp__github__merge_pull_request:
  owner: "mehedi-imun"
  repo: "AI-Content-Trend-Recommendation"
  pull_number: <PR_NUMBER>
  merge_method: "squash"
```

---

## Step 7 — Delete remote feature branch via GitHub MCP

```
mcp__github__delete_branch:
  owner: "mehedi-imun"
  repo: "AI-Content-Trend-Recommendation"
  branch: "<feature branch name>"
```

---

## Step 8 — Switch local branch back to main

```bash
git checkout main && git pull origin main
git branch -D <feature branch name>
```

---

## Step 9 — Final report

```
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
/ship complete
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
Feature:  <feature description>
Branch:   <feature branch> → squash merged + deleted

PR: #<N> → squash merged into main ✅

Scope:    <Backend | Frontend | Full-stack>
Local:    now on main ✅
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
```

---

## Rules

- Never merge directly to `main` from local — always via PR
- Always squash merge — never merge commit or rebase
- Always delete both remote and local feature branches after merge
- If GitHub MCP is not connected, STOP: "GitHub MCP is not connected. Check `/mcp` to verify the connection."
- Never stage `.env`, `*.pem`, `node_modules/`, `.next/`, `dist/`
- This is a monorepo — one branch, one PR covers both backend and frontend changes
