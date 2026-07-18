## ADDED Requirements

### Requirement: The category taxonomy is global, not per-team, and grows during ingestion
The set of categories a news item may be assigned SHALL be a single, global taxonomy shared by every
team, seeded with the existing fixed six (`AI`, `Web Dev`, `Career`, `Security`, `DevOps`, `Other`)
and grown over time by the ingestion pipeline's categorization step, independent of any single
team's own configuration.

#### Scenario: Categorization proposes a genuinely new category
- **WHEN** the categorization step judges that none of the currently-known categories fit an item
  well and proposes a new, more specific one
- **THEN** that category is added to the global taxonomy and is thereafter available to every team,
  not only the team that happened to trigger its discovery (ingestion has no team context at all)

#### Scenario: A team that never configured anything still benefits
- **WHEN** a new category is discovered during a cron-triggered ingestion run
- **THEN** every team's `GET /teams/:id/categories` response includes it, with no per-team action
  required

### Requirement: Duplicate categories are ignored, not re-added
A proposed category that already exists in the taxonomy (case-insensitive, whitespace-normalized
comparison) SHALL NOT create a second entry; the existing canonical entry is reused.

#### Scenario: LLM proposes a case/whitespace variant of an existing category
- **WHEN** categorization proposes `"ai"` or `" AI "` and `"AI"` already exists in the taxonomy
- **THEN** the item is assigned the existing canonical `"AI"` entry, and no duplicate taxonomy entry
  is created

### Requirement: Every category maps to exactly one broad group
Every taxonomy entry, fixed or discovered, SHALL have exactly one broad group drawn from the
original fixed six — a fixed-six entry's group is itself; a discovered entry's group is assigned at
the time it's proposed.

#### Scenario: A newly discovered fine-grained category
- **WHEN** categorization proposes a new category `"LLM Tooling"` under the broad group `"AI"`
- **THEN** the taxonomy records `"LLM Tooling"` with broad group `"AI"`

### Requirement: Teams can subscribe to any taxonomy entry, not only the original fixed six
`Team.subscribed_categories` SHALL accept any category name present in the global taxonomy (fixed
or discovered), not only the original fixed six.

#### Scenario: Team subscribes to a discovered category
- **WHEN** a team sets `subscribed_categories` to include a category that was discovered during
  ingestion (not one of the original fixed six)
- **THEN** the update succeeds (previously this would have been rejected by the fixed-enum
  validator)
