## 1. Schema & types

- [x] 1.1 `newsItem.interface.ts`: add `content?: string`, `content_status: 'none' | 'partial' | 'full' | 'failed'`, `content_fetched_at?: Date`, `word_count?: number` to `INewsItem`
- [x] 1.2 `newsItem.model.ts`: add the four fields (`content_status` as `{ type: String, enum: ['none','partial','full','failed'], default: 'none' }`)
- [x] 1.3 `newsIngestion.interface.ts`: add `content?: string` to `RawNewsItem`
- [x] 1.4 `config/index.ts`: add `NEWS_CONTENT_MAX_CHARS` (zod string, default `'20000'`) → `config.news_ingestion.content_max_chars: Number(...)`

## 2. Adapter upgrades (snippet untouched in every one)

- [x] 2.1 `adapters/reddit.ts`: emit `content: post.selftext || undefined` alongside the existing sliced snippet
- [x] 2.2 `adapters/stackoverflow.ts`: append `&filter=withbody` to `BASE_URL`; add `body?: string` to the `StackExchangeQuestion` interface; emit `content: question.body ? decodeEntities(stripHtml(question.body)) : undefined`
- [x] 2.3 `adapters/producthunt.ts`: add `description` to the GraphQL `QUERY` node selection and to the `ProductHuntNode` interface; emit `content: node.description || undefined`
- [x] 2.4 `adapters/lobsters.ts`: emit `content` as the full `decodeEntities(stripHtml(story.description))` when a description exists (no 500-char cap); leave `buildSnippet`/`snippet` unchanged
- [x] 2.5 `adapters/rss.ts`: construct the parser with `customFields: { item: [['content:encoded', 'contentEncoded']] }`; define a local interface extending `Parser.Item` with `contentEncoded?: string`; emit `content: item.contentEncoded ? stripHtml(item.contentEncoded) : undefined`
- [x] 2.6 `adapters/hackerNews.ts`: emit `content: hit.story_text ? stripHtml(hit.story_text) : undefined`

## 3. Pipeline mapping

- [x] 3.1 `newsIngestion.service.ts`: add a local helper (e.g. `withContentMeta(item)`) that, given raw `content` and `config.news_ingestion.content_max_chars`, returns `{ content, content_status, word_count, content_fetched_at }` — truncating and marking `'partial'` when over the cap, `'full'` when present and under the cap, `'none'` (with `content: undefined`) when absent; `content_fetched_at: new Date()` whenever content is present. Spread this into the `payloads` array alongside the existing fields.

## 4. API hygiene & validation

- [x] 4.1 `newsItem.service.ts`: in `getAllNewsItems`'s `annotate` step, delete `embedding` and `content` from the plain object after `high_opportunity` is computed, before returning; in `getSingleNewsItem`, delete `embedding` from the returned plain object before returning
- [x] 4.2 `newsItem.validation.ts`: add `content` (string, optional), `content_status` (enum, optional), `word_count` (non-negative integer, optional) to both `createNewsItemValidation` and `updateNewsItemValidation`
- [x] 4.3 `docs/schemas.ts`: add `content`, `content_status`, `word_count`, `content_fetched_at` to the NewsItem schema's properties

## 5. Tests

- [x] 5.1 `newsIngestion.reddit.test.ts`: long `selftext` → full `content`, snippet still sliced to 500 chars
- [x] 5.2 `newsIngestion.stackoverflow.test.ts`: assert the fetched URL contains `filter=withbody`; a fixture response with `body` maps to stripped `content`; `snippet` is still the tag join
- [x] 5.3 `newsIngestion.producthunt.test.ts`: assert the GraphQL query string sent contains `description`; a fixture node with `description` maps to `content`
- [x] 5.4 `newsIngestion.rss.test.ts`: a fixture feed item with `content:encoded` → `content` set to its stripped text; a feed item without it → `content` undefined
- [x] 5.5 `newsIngestion.lobsters.test.ts` / `newsIngestion.hackernews.test.ts`: `content` mapped correctly; `snippet` byte-identical to the pre-change expectation
- [x] 5.6 New or extended pipeline-level unit test: an item whose content exceeds `NEWS_CONTENT_MAX_CHARS` is stored capped with `content_status: 'partial'`; an item with no content is stored with `content_status: 'none'`
- [x] 5.7 `newsItem.integration.test.ts`: `GET /news-items` list response objects contain no `embedding` and no `content` keys; `GET /news-items/:id` response contains `content` (when present) but no `embedding` key, and still no `embedding` when `content_status` is `'none'`

## 6. Verification

- [x] 6.1 `cd backend && npm test && npm run build`
- [x] 6.2 Live: restart the backend container (bind-mount picks up code) → trigger `POST /news-items/ingest` as admin → fetch a freshly stored Reddit/Stack Overflow/RSS item via `GET /news-items/:id` and confirm `content` is present with sane text and the correct `content_status`
- [x] 6.3 Live: confirm `GET /news-items` (list) responses are visibly smaller (no `embedding` field) for the same items
- [x] 6.4 Live: confirm a pre-existing item (ingested before this change was deployed) still lists and reads fine, showing `content_status: 'none'`
