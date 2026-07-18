## ADDED Requirements

### Requirement: Resource URL Fidelity
For every ingested news item, `url` SHALL identify the actual original resource (the article, repository,
product page, or discussion that is the substantive content), not a purely intermediary or tracking link,
for every configured source. Where a source's own real resource differs from an aggregator-specific
discussion or listing page it also provides, the item SHALL additionally carry an optional `discussion_url`
pointing at that aggregator page.

#### Scenario: Reddit link-post resolves to the real external resource
- **WHEN** a Reddit item is ingested for a post that links to an external page (not a self/text post)
- **THEN** `url` is that external page's address, and `discussion_url` is the Reddit thread's permalink

#### Scenario: Reddit self-post has no separate discussion link
- **WHEN** a Reddit item is ingested for a genuine self/text post with no external link
- **THEN** `url` and `discussion_url` both resolve to the Reddit thread

#### Scenario: Product Hunt item resolves to the real product site
- **WHEN** a Product Hunt item is ingested
- **THEN** `url` is the product's actual website (via Product Hunt's redirect link), and `discussion_url` is the Product Hunt post page

#### Scenario: HackerNews and Lobsters always carry a discussion link
- **WHEN** a HackerNews or Lobsters item is ingested
- **THEN** `discussion_url` is present and resolves to that item's discussion/comments page, regardless of what `url` resolved to

### Requirement: Source-Native Thumbnail Capture
When a source's own API response includes an image intended to represent the item (a cover image, social
image, or thumbnail field), the ingested item SHALL capture it as `thumbnail_url`. No source without a native
thumbnail field SHALL be scraped or otherwise probed for one; such items SHALL have `thumbnail_url` absent.

#### Scenario: Dev.to article captures its cover image
- **WHEN** a Dev.to item is ingested for an article with a `cover_image`
- **THEN** `thumbnail_url` is set to that cover image's URL

#### Scenario: Source with no native thumbnail field leaves it absent
- **WHEN** a GitHub Trending, Mastodon, or StackOverflow item is ingested
- **THEN** `thumbnail_url` is absent, not populated via any fallback fetch

#### Scenario: A non-image thumbnail sentinel is not captured as a thumbnail
- **WHEN** a source's thumbnail-like field holds a non-URL sentinel value rather than a real image address
- **THEN** `thumbnail_url` is left absent for that item rather than storing the sentinel value
