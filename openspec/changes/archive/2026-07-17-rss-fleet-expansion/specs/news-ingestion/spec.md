## MODIFIED Requirements

### Requirement: RSS Fleet With Per-Feed Timeout and Curated Coverage
The RSS adapter SHALL apply a 10-second per-feed fetch timeout so a hung feed
fails only itself, with remaining feeds unaffected. The documented starter feed
list SHALL cover editorial technology press, engineering blogs, GitHub release
Atom feeds for widely-used developer tools, and an arXiv cs.AI Atom query, and
SHALL be capped at 25 feeds with the cost rationale documented alongside the
variable.

#### Scenario: Hung feed cannot stall the run
- **WHEN** one configured feed accepts the connection but never responds
- **THEN** that feed errors after ~10 seconds and items from all other feeds are returned

#### Scenario: Atom feeds parse through the existing adapter
- **WHEN** a GitHub `releases.atom` feed and the arXiv query URL are configured
- **THEN** their entries are ingested with `published_at` from the feed entries and labels `rss:github.com` and `rss:export.arxiv.org`
