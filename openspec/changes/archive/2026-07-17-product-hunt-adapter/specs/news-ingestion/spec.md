## ADDED Requirements

### Requirement: Product Hunt Source via OAuth2 Client Credentials
The pipeline SHALL include a `producthunt` adapter that authenticates with the
Product Hunt API v2 via the OAuth2 client-credentials grant using
`PRODUCTHUNT_CLIENT_ID`/`PRODUCTHUNT_CLIENT_SECRET`, caches the bearer token in
Redis for 24 hours, and fetches the top-voted posts of the last 24 hours via one
GraphQL query, mapping votes to points and comments to comments and enriching
the item title with the product tagline. A GraphQL response carrying an
`errors` array SHALL be treated as a failure. On HTTP 401 the adapter SHALL
invalidate the cached token and retry once. When credentials are not configured
the adapter SHALL make no network calls and report itself unconfigured, and the
server SHALL boot normally.

#### Scenario: Launches normalized with engagement
- **WHEN** the adapter runs with valid credentials and a post has `votesCount: 312`, `commentsCount: 41`
- **THEN** the emitted item has `source: "producthunt"`, `raw_points: 312`, `raw_comments: 41`, title `"<name> — <tagline>"`, and `published_at` from `createdAt`

#### Scenario: Token cached across runs
- **WHEN** a second run starts within 24 hours
- **THEN** the adapter reuses the Redis-cached token without calling the token endpoint

#### Scenario: Expired token
- **WHEN** the GraphQL request returns HTTP 401
- **THEN** the adapter invalidates the cache, obtains a fresh token, and retries the query exactly once

#### Scenario: GraphQL-level error
- **WHEN** the GraphQL response is HTTP 200 but contains an `errors` array
- **THEN** the adapter throws with the error message and the run history records it

#### Scenario: Credentials absent
- **WHEN** `PRODUCTHUNT_CLIENT_ID` or `PRODUCTHUNT_CLIENT_SECRET` is unset
- **THEN** the adapter makes no network requests and the run's `producthunt` entry shows a "not configured" reason
