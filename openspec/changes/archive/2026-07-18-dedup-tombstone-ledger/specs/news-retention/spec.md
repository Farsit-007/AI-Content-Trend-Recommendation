## ADDED Requirements

### Requirement: Dedup Tombstone Ledger
The system SHALL maintain a `news_dedup_ledger` collection recording the
`content_hash` (unique), title, source, and deletion time of every news item
deleted by any delete path, with documents expiring
`NEWS_DEDUP_LEDGER_TTL_DAYS` (default 30) days after deletion. Tombstones SHALL
be written before the corresponding item delete is executed, and tombstone
writes SHALL be idempotent (re-recording an existing hash is not an error).

#### Scenario: Manual delete writes a tombstone
- **WHEN** an admin deletes a news item via `DELETE /news-items/:id`
- **THEN** a ledger document with that item's `content_hash` exists before the item is gone

#### Scenario: Re-recording an existing hash is not an error
- **WHEN** `recordTombstones` is called with an item whose `content_hash` is already in the ledger
- **THEN** the call succeeds without throwing and the ledger still has exactly one document for that hash

#### Scenario: Ledger self-cleans
- **WHEN** a tombstone passes its TTL
- **THEN** Mongo removes it and the corresponding story may re-enter the pipeline as genuinely new
