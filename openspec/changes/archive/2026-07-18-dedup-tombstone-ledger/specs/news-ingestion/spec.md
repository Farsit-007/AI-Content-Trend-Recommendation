## MODIFIED Requirements

### Requirement: Hash Dedup Consults Deleted-Item Tombstones
During ingestion hash-dedup, a candidate whose `content_hash` matches either a
stored news item or a `news_dedup_ledger` tombstone SHALL be dropped, in
addition to the existing in-run duplicate check. If the ledger lookup fails,
ingestion SHALL log the failure and continue using stored-item dedup only —
the ledger check SHALL NOT cause an ingestion run to fail.

#### Scenario: Deleted trending repo does not resurrect
- **WHEN** a `github_trending` item is deleted (tombstoned) and the same repo appears in the next run's fetch
- **THEN** the candidate is dropped at hash-dedup and no new row or LLM/embedding call is made for it

#### Scenario: Ledger unavailable
- **WHEN** the ledger query throws during a run
- **THEN** the run completes using stored-item dedup alone and the failure is logged

#### Scenario: Undeleted item still dedupes normally
- **WHEN** a candidate's `content_hash` matches a currently-stored (non-deleted) item, with no matching ledger tombstone
- **THEN** the candidate is dropped exactly as it was before this change
