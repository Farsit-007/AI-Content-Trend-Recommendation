## Context

Full per-adapter audit performed against the live tree and, where possible, live APIs (2026-07-18):

- **Product Hunt — verified live** against the real GraphQL API using this deployment's actual configured
  credentials: `Post.url` is `https://www.producthunt.com/products/<slug>?...` (a PH-hosted page); a separate
  `Post.website` field is `https://www.producthunt.com/r/<code>?...` — a PH tracking-redirect that resolves to
  the real external site (confirmed by fetching two real live posts and inspecting both fields); `Post.thumbnail
  { url }` is a real, working `ph-files.imgix.net` image URL. The adapter (`producthunt.ts`) queries only `url`
  today.
- **Reddit — NOT independently re-verified live this session**: direct outbound HTTPS to reddit.com was
  network-blocked in this sandbox (TLS handshake reset on both the OAuth-authenticated path, since no
  `REDDIT_CLIENT_ID`/`SECRET` are configured in this deployment's `.env`, and an unauthenticated public JSON
  probe). The design below relies on Reddit's long-stable, extensively documented Listing API schema instead:
  `data.url` (external link for link posts; equals `data.permalink`'s target for self/text posts when
  `data.is_self` is true), `data.permalink` (always present, relative path to the discussion), `data.thumbnail`
  (a real `https://` image URL, or one of the sentinel strings `"self"`/`"default"`/`"nsfw"`/`"spoiler"`, or
  an empty string, when no real thumbnail exists). **This specific detail should get a live re-check at
  `/opsx:apply` time** if Reddit credentials become available, per this plan's own "don't assume" standard —
  flagged explicitly rather than silently treated as equivalent to the Product Hunt verification.
- **HackerNews / Lobsters** — no external verification needed: the HN item-page URL is a deterministic
  function of `objectID` (`https://news.ycombinator.com/item?id={id}`, always constructible, no API call);
  Lobsters' `comments_url` is already present in every response the existing adapter already fetches (visible
  directly in `lobsters.ts`'s own `LobstersStory` interface, just not stored as its own field today).
- **Dev.to / GNews** — `cover_image`/`social_image` and `image` respectively are documented, stable fields on
  APIs this codebase already calls successfully; no separate live check needed beyond what the adapters
  already prove works (they already consume other fields from the same response shape).
- **The pipeline's final insert step is spread-free**: `newsIngestion.service.ts`'s `payloads` array (the
  literal argument to `NewsItem.insertMany`) is built as an explicit field-by-field object literal, not
  `{...item}` — confirmed by reading the code directly. Any new field on `RawNewsItem` that isn't also added
  to this explicit list is silently dropped before it ever reaches the database, regardless of whether every
  earlier pipeline stage (`scored`/`relevant`/`enrichedRelevant`/`categorized`/`finalized`) correctly carries
  it via their own `{...item}` spreads.

## Goals / Non-Goals

**Goals:**
- `url` always means "the actual original resource," consistently across every source.
- A separate, optional `discussion_url` captures an aggregator's comment/discussion thread when one
  meaningfully exists and differs from the resource itself.
- A separate, optional `thumbnail_url` captures a source-native preview image when the source's own API
  already provides one, with zero new scraping/fetching infrastructure.
- Every touch point in the pipeline that the two new fields must survive is identified and touched —
  including the easy-to-miss explicit-field final insert step.

**Non-Goals:**
- No OpenGraph-image scraping fallback for sources without a native thumbnail (explicit prior user decision,
  plan file 10 §0).
- No retroactive backfill/re-hash of already-stored Reddit/Product Hunt items whose `url` meaning changes
  (explicit prior user-accepted trade-off, plan file 10 §0 decision 2) — self-heals via retention.
- No change to `content_hash` computation logic itself, dedup thresholds, scoring, or categorization — this
  change is additive data capture plus a `url`-meaning fix, not a pipeline-behavior change.

## Decisions

### 1. Reddit: real external link when one exists, permalink only for genuine self-posts

```ts
interface RedditPost {
  id: string;
  title: string;
  permalink: string;
  url: string;        // NEW — the field the current adapter never reads
  is_self?: boolean;  // NEW
  thumbnail?: string;  // NEW
  selftext?: string;
  ups?: number;
  num_comments?: number;
  created_utc?: number;
}
```
`url: post.is_self ? \`https://www.reddit.com${post.permalink}\` : post.url` (self-posts have no external
resource — the Reddit thread *is* the resource, matching today's behavior for that case exactly).
`discussion_url: \`https://www.reddit.com${post.permalink}\`` unconditionally — even for self-posts, where it
duplicates `url`, for a consistent contract callers can rely on ("discussion_url is always the Reddit thread
when the item came from Reddit").
`thumbnail_url`: only when `post.thumbnail` starts with `http` (filters out the sentinel strings without
needing to enumerate all of them — any non-URL sentinel Reddit uses will naturally fail this same check).

### 2. Product Hunt: `website` becomes the resource, existing `url` becomes `discussion_url`

GraphQL query gains `website` and `thumbnail { url }`:
```graphql
node { id name tagline description url website thumbnail { url } votesCount commentsCount createdAt }
```
Mapping: `url: node.website`, `discussion_url: node.url`, `thumbnail_url: node.thumbnail?.url`. Both `url`
and `website` are non-nullable in Product Hunt's schema for a published post (confirmed live — neither field
was null in the sample fetched), so no additional fallback logic is needed for the common case; a defensive
`?? node.url` fallback for `website` is still worth keeping in case an edge-case post genuinely lacks one
(cheap insurance, not evidence of an observed failure).

### 3. HackerNews / Lobsters: `discussion_url` set unconditionally, independent of what `url` resolved to

HackerNews: `discussion_url: `https://news.ycombinator.com/item?id=${hit.objectID}`` added to every mapped
item — today's `url` logic (`hit.url ?? <same HN link>`) is untouched, since for text/Ask-HN posts where `url`
already *is* the HN link, `discussion_url` simply duplicates it (same "always present, consistent contract"
reasoning as Reddit decision 1).
Lobsters: `discussion_url: story.comments_url` added unconditionally; today's `url: story.url ||
story.comments_url` fallback logic is untouched (still correct — when a story has no external link, the
comments page remains the best available `url`).

### 4. Dev.to / GNews: direct field capture, no fallback complexity needed

Dev.to: `thumbnail_url: article.cover_image ?? article.social_image` (per Dev.to's documented API, articles
schema includes both; `cover_image` is the primary, `social_image` a secondary/derived one — prefer the
primary). GNews: `thumbnail_url: article.image`.

### 5. RSS: best-effort via `rss-parser` `customFields`, mirroring the existing `content:encoded` pattern exactly

```ts
customFields: {
  item: [
    ['content:encoded', 'contentEncoded'],
    ['media:thumbnail', 'mediaThumbnail'],
    ['enclosure', 'enclosureField'],
  ],
},
```
Resolution order: `mediaThumbnail`'s `$.url` attribute (if present) → `enclosureField`'s `url` attribute when
its `type` starts with `image/` → `undefined`. Both are genuinely absent on the majority of tech-blog feeds
this pipeline already ingests (per the existing feed list in `.env.example`) — `thumbnail_url` staying
`undefined` for most RSS items is the expected, accepted outcome, not a bug to chase further.

### 6. Pipeline plumbing: both fields added at every explicit touch point, including the non-obvious one

`RawNewsItem` (`newsIngestion.interface.ts`) gains `discussion_url?: string; thumbnail_url?: string`. Every
intermediate stage (`ScoredNewsItem`, `CategorizedNewsItem`, `ScoredCategorizedNewsItem`) already inherits
them via `extends`/spread, no changes needed there. The one **required** explicit edit beyond `RawNewsItem`
and the 7 adapters is `newsIngestion.service.ts`'s `payloads` map — add `discussion_url: item.discussion_url,
thumbnail_url: item.thumbnail_url,` to that literal, or the fields are silently dropped before insert despite
being correctly populated by every adapter and correctly carried through every intermediate stage. `INewsItem`/
`newsItem.model.ts` gain the same two optional fields (no validation constraints beyond `type: String` — these
are display-only, never scored or embedded on).

### 7. Frontend: placeholder icon mapping is category-based, not source-based

`NewsCard.tsx` renders `item.thumbnail_url` in an `<img>` when present; when absent, a small icon (not a full
placeholder image) keyed by `item.category` (`NEWS_CATEGORIES`: AI/Web Dev/Career/Security/DevOps/Other) —
reuses `lucide-react` icons already imported elsewhere in this codebase (e.g. `Sparkles` for AI, `Code2` for
Web Dev, etc. — exact icon choices are a small implementation-time decision, not a design fork). Uncategorized
items (rare — pre-categorization or `needs_review`) get a generic fallback icon.
`NewsItemDrawer.tsx` renders `discussion_url` as a second `<a>` beneath the existing primary-resource link,
visually distinguished (e.g. a `MessageCircle` icon + "Discussion" label vs the existing source-name link),
only rendered when present.

## Risks / Trade-offs

- **[Risk] Reddit's `thumbnail` sentinel-string list wasn't independently re-verified live this session**
  (network-blocked) — relies on long-stable, well-documented API behavior. → Mitigation: the `startsWith('http')`
  check (Decision 1) is defensive by construction — it doesn't need to enumerate every sentinel Reddit might
  use, any non-URL value simply fails the check and `thumbnail_url` stays `undefined`, degrading gracefully
  to the placeholder icon. A live re-check is still worth doing whenever Reddit credentials are configured.
- **[Risk] `content_hash` meaning shifts for Reddit/Product Hunt going forward** (Decision 1/2 changes what
  `url` is, which is a `content_hash` input) → Accepted per explicit prior decision; documented in proposal.md,
  self-heals via retention, no forced migration.
- **[Trade-off] RSS thumbnail coverage will be low** (most configured feeds don't carry `media:thumbnail`/
  `enclosure`) → Accepted; this is the nature of RSS, not a defect in the extraction attempt.

## Migration Plan

No data migration — every new field is optional, added to schemas with no `required` constraint, and no
backfill of existing stored items is performed (explicit prior decision). Rollback is a straightforward
revert of the adapter/schema/UI changes; nothing here is destructive or hard to reverse.

## Open Questions

- Reddit's `thumbnail` sentinel behavior (see Risk above) — flagged for a live re-check at apply time if
  credentials are available; the defensive `startsWith('http')` check means this doesn't block the change
  either way.
