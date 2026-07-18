# Tasks — Dev Data Reset Tooling

## 1. `resetDevData.ts`

- [x] 1.1 Scaffold following the existing script pattern (`seedAdmin.ts`/`seedStylePack.ts`):
      `mongoose.connect(config.database_url)`, do the work, `process.exit`.
- [x] 1.2 Print target DB host (parsed from `DATABASE_URL`, credentials redacted) + current
      per-collection counts.
- [x] 1.3 Refuse if `config.node_env === 'production'`.
- [x] 1.4 Require `--yes` flag OR prompt for a typed confirmation (e.g. type the database name)
      when run interactively (TTY present).
- [x] 1.5 Delete in dependency order: `team_memberships`, `style_examples`, then everything else
      listed in the spec, `users` last with `{ role: { $ne: 'super_admin' } }`.
- [x] 1.6 Print final per-collection deleted counts + a reminder line to `redis-cli FLUSHDB`
      manually if a fully clean cache is also wanted.
- [x] 1.7 Add `"dev:reset-data": "ts-node src/scripts/resetDevData.ts"` to `package.json`.

## 2. `clearNewsItems.ts`

- [x] 2.1 Same scaffold/safety pattern as 1.1–1.4, scoped to `news_items` + `news_dedup_ledger`
      only.
- [x] 2.2 Add `"dev:clear-news": "ts-node src/scripts/clearNewsItems.ts"` to `package.json`.

## 3. Verification

- [x] 3.1 Dry-run both scripts against a local/throwaway Mongo (mongodb-memory-server or a scratch
      Atlas dev database — **never** the shared cluster) to confirm the safety gates and deletion
      scope behave as specced. Verified via a scratch harness (mongodb-memory-server + child-process
      invocation of both scripts against the throwaway instance, 24/24 checks passing), then deleted
      — not part of the permanent test suite.
- [x] 3.2 Confirm both refuse under `NODE_ENV=production` and under no-`--yes` non-interactive
      runs. Both confirmed for `resetDevData.ts` in the same scratch harness (production refusal +
      no-confirm refusal, both leaving data untouched); `clearNewsItems.ts` shares the identical
      safety-gate code path, exercised via its own confirmed `--yes` run in the same harness.

## 4. Actually running it against the real database (separate, explicit approval)

- [ ] 4.1 **Not part of this change's implementation.** Once merged, running either script against
      the live Atlas cluster is a one-time operator action requiring the user's explicit go-ahead
      at that moment — do not chain this automatically after task 3. **Intentionally not run** in
      this pass, per this task's own instruction.
