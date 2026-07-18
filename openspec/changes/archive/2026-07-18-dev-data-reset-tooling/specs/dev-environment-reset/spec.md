# dev-environment-reset

## ADDED Requirements

### Requirement: Full reset preserves only super admin users
`npm run dev:reset-data` SHALL delete every document in every application collection except `User`
documents with `role: 'super_admin'`, including cascading deletes of dependent collections
(`team_memberships` with `teams`, `style_examples` with `style_packs`).

#### Scenario: Full reset run
- **WHEN** the script completes successfully
- **THEN** the only remaining `User` documents have `role: 'super_admin'`, and `teams`,
  `team_memberships`, `news_items`, `news_dedup_ledger`, `news_item_category_overrides`,
  `ingestion_runs`, `maintenance_runs`, `generated_content`, `style_packs`, `style_examples`,
  `brand_voice_examples`, `chat_messages`, `llm_providers`, `llm_models`, and `llm_task_defaults`
  are all empty

### Requirement: News-only reset is scoped narrowly
`npm run dev:clear-news` SHALL delete only `news_items` and `news_dedup_ledger` documents, leaving
every other collection untouched.

#### Scenario: News-only reset run
- **WHEN** the script completes successfully
- **THEN** `news_items` and `news_dedup_ledger` are empty and `teams`, `users`, `style_packs`, and
  `brand_voice_examples` are unchanged

### Requirement: Both reset scripts refuse to run unsafely
Both scripts SHALL refuse to execute when `NODE_ENV === 'production'`, and SHALL require either an
explicit `--yes` CLI flag or an interactive typed confirmation before deleting anything. Both SHALL
print the target database host and a per-collection document count before any deletion occurs.

#### Scenario: Production environment
- **WHEN** either script is run with `NODE_ENV=production`
- **THEN** the script exits without deleting any data

#### Scenario: No confirmation supplied
- **WHEN** either script is run non-interactively without `--yes`
- **THEN** the script exits without deleting any data

#### Scenario: Confirmed run
- **WHEN** either script is run with `--yes` (or the interactive confirmation is completed) outside
  production
- **THEN** the pre-deletion summary is printed, deletion proceeds, and a final per-collection
  deleted-count summary is printed
