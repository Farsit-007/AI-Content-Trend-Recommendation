## Why

The feed's news-item sidebar (`NewsItemDrawer.tsx`) links out to `item.url` as "the resource," but for several
sources that URL is not actually the original resource at all. Confirmed by direct code and live-API
inspection: Reddit's adapter stores only the Reddit discussion permalink, discarding Reddit's own separate
`url` field that points at the real external link entirely — every Reddit link-post today is unreachable
except via its comment thread. Product Hunt's adapter queries only its `url` field, which (confirmed live
against Product Hunt's real GraphQL API) is the PH-hosted product page, while a separate `website` field
(also confirmed live) is the tracking-redirect link to the actual external site — currently unqueried.
HackerNews and Lobsters have real, always-available discussion links (HN item page, Lobsters `comments_url`)
that are either discarded once a "primary" URL wins or only used as a URL fallback, never surfaced as their
own thing. Separately, four sources (Dev.to `cover_image`, Reddit `thumbnail`, GNews `image`, Product Hunt
`thumbnail.url` — all confirmed present in their real API responses) carry a thumbnail image that nothing in
this pipeline captures, so the feed has no visual preview for any item even when the source freely provides one.

## What Changes

- Add `discussion_url?: string` and `thumbnail_url?: string` to the news-ingestion pipeline's data model,
  from `RawNewsItem` through to `INewsItem`, including the explicit final insert-payload construction in
  `newsIngestion.service.ts` (a spread-free field list that would otherwise silently drop both new fields).
- Fix the 7 adapters with a real, confirmed gap:
  - **Reddit**: capture the API's real `url` field as the item's `url` (falling back to the permalink only
    for genuine self/text posts, which have no external link); set `discussion_url` to the permalink always;
    set `thumbnail_url` from the API's `thumbnail` field when it's a real image URL (Reddit returns sentinel
    strings like `"self"`/`"default"`/`"nsfw"` for non-image cases — filter those out).
  - **Product Hunt**: query `website` (the redirect-to-real-site link) as `url`; keep the existing `url`
    field's value as `discussion_url` (the PH product page); query `thumbnail { url }` as `thumbnail_url`.
  - **HackerNews**: set `discussion_url` to the always-constructible HN item page
    (`https://news.ycombinator.com/item?id={objectID}`) regardless of what `url` resolved to.
  - **Lobsters**: set `discussion_url` to `comments_url` unconditionally (not just as a fallback when there's
    no external `url`).
  - **Dev.to**: capture `cover_image` (or `social_image` when the former is absent) as `thumbnail_url`.
  - **GNews**: capture `image` as `thumbnail_url`.
  - **RSS**: best-effort `thumbnail_url` from `<enclosure>`/`media:thumbnail` via `rss-parser` `customFields`
    (same mechanism already used for `content:encoded`) — absent on feeds that don't provide either, which is
    expected and fine.
- Feed UI: `NewsCard.tsx` renders `thumbnail_url` when present, a category-based placeholder icon when not;
  `NewsItemDrawer.tsx` renders a second, visually distinct "Discussion" link alongside the primary resource
  link when `discussion_url` is present.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-ingestion`: the ingested-item shape gains two optional fields and several adapters' field-mapping
  behavior changes per the audit above; no change to the pipeline's dedup/scoring/categorization logic itself.

## Impact

- **Backend:** `newsIngestion.interface.ts` (`RawNewsItem`), `newsItem.interface.ts`/`.model.ts`
  (`INewsItem`), `newsIngestion.service.ts` (final payload construction), 7 adapter files
  (`reddit.ts`, `producthunt.ts`, `hackerNews.ts`, `lobsters.ts`, `devto.ts`, `gnews.ts`, `rss.ts`), API docs
  (`newsItemPaths.ts`/`schemas.ts`).
- **Frontend:** `NewsCard.tsx`, `NewsItemDrawer.tsx`, `lib/api/news.ts` (`NewsItemDto`), a new category-based
  placeholder-icon mapping.
- **Dedup implication (accepted, documented):** Reddit and Product Hunt's `content_hash` is `sha256(source:url)`;
  fixing what `url` means for these two sources means newly-ingested items hash differently than
  already-stored ones from before this change. Old items are not retroactively re-hashed — they age out via
  the existing retention pipeline. No forced backfill or migration.
- **No breaking API changes** — both new fields are optional additions to existing response shapes.
