import {
  BrandVoiceCandidate,
  PlatformPostCandidate,
  rankBrandVoiceExamples,
  rankPlatformPosts,
} from '../app/modules/ContentGeneration/contentGeneration.retrieval';

const topic = [1, 0, 0];
const similar = [0.99, 0.01, 0.01];
const orthogonal = [0, 1, 0];

let failures = 0;

const check = (name: string, condition: boolean) => {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${name}`);
  } else {
    console.log(`PASS: ${name}`);
  }
};

// Brand voice: most-similar examples win, capped at the limit.
{
  const candidates: BrandVoiceCandidate[] = [
    { content: 'off-topic', embedding: orthogonal },
    { content: 'on-topic-1', embedding: similar },
    { content: 'on-topic-2', embedding: topic },
  ];
  const result = rankBrandVoiceExamples(candidates, topic, 2);
  check(
    'brand voice: top-2 by similarity, off-topic excluded',
    result.length === 2 && result.every((r) => r.content !== 'off-topic'),
  );
  check('brand voice: exact match ranked first', result[0].content === 'on-topic-2');
}

// Brand voice: empty pool => empty result, no throw.
{
  const result = rankBrandVoiceExamples([], topic, 3);
  check('brand voice: empty pool returns empty result', result.length === 0);
}

// Platform posts: high engagement but off-topic is excluded once pool is small enough
// that similarity ranking (stage 2) determines the final picks.
{
  const candidates: PlatformPostCandidate[] = [
    {
      content_snippet: 'high-engagement-off-topic',
      embedding: orthogonal,
      metrics: { reach: 10000, likes: 5000, comments: 500, shares: 500 },
    },
    {
      content_snippet: 'low-engagement-on-topic',
      embedding: topic,
      metrics: { reach: 10, likes: 1, comments: 0, shares: 0 },
    },
  ];
  const result = rankPlatformPosts(candidates, topic, 1, 20);
  check(
    'platform posts: on-topic post wins similarity stage within engagement pool',
    result.length === 1 && result[0].content === 'low-engagement-on-topic',
  );
}

// Platform posts: engagement pre-filter actually excludes items before similarity ranking.
{
  const candidates: PlatformPostCandidate[] = [
    { content_snippet: 'top-engagement', embedding: topic, metrics: { reach: 100, likes: 0, comments: 0, shares: 0 } },
    {
      content_snippet: 'excluded-by-engagement-pool',
      embedding: topic,
      metrics: { reach: 0, likes: 0, comments: 0, shares: 0 },
    },
  ];
  const result = rankPlatformPosts(candidates, topic, 5, 1);
  check(
    'platform posts: engagement pool size caps candidates before similarity ranking',
    result.length === 1 && result[0].content === 'top-engagement',
  );
}

// Platform posts: fewer candidates than the engagement pool size still ranks all of them.
{
  const candidates: PlatformPostCandidate[] = [
    { content_snippet: 'only-post', embedding: topic, metrics: { reach: 1, likes: 0, comments: 0, shares: 0 } },
  ];
  const result = rankPlatformPosts(candidates, topic, 3, 20);
  check('platform posts: fewer than pool size still returns available candidates', result.length === 1);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll content generation retrieval checks passed.');
