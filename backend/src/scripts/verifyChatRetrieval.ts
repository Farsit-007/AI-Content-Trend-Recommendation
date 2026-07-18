import { NewsCandidate, rankNewsItems } from '../app/modules/Chat/chat.retrieval';

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

// News ranking: pure semantic similarity wins — no trend-score pre-filter starves a topically
// relevant, low-trend item just because a higher-trend item exists elsewhere in the pool.
{
  const candidates: NewsCandidate[] = [
    { title: 'off-topic-high-trend', trend_score: 9, embedding: orthogonal },
    { title: 'on-topic-low-trend', trend_score: 1, embedding: similar },
  ];
  const result = rankNewsItems(candidates, topic, 1);
  check(
    'news: similarity ranking wins regardless of trend score',
    result.context.length === 1 && result.context[0].content.includes('on-topic-low-trend'),
  );
}

// News ranking: the entire candidate pool is ranked — nothing is excluded by a pool-size
// pre-filter before similarity ranking runs (that pre-filter no longer exists).
{
  const candidates: NewsCandidate[] = [
    { title: 'top-trend', trend_score: 10, embedding: topic },
    { title: 'low-trend-but-on-topic', trend_score: 0, embedding: topic },
  ];
  const result = rankNewsItems(candidates, topic, 5);
  check(
    'news: both equally-similar candidates are eligible regardless of trend score',
    result.context.length === 2,
  );
}

// News ranking: empty pool returns empty result, no throw.
{
  const result = rankNewsItems([], topic, 5);
  check('news: empty pool returns empty result', result.context.length === 0 && result.topSimilarity === 0);
}

// News ranking: topSimilarity/poolSize are reported for retrieval-quality logging.
{
  const candidates: NewsCandidate[] = [{ title: 'exact-match', trend_score: 1, embedding: topic }];
  const result = rankNewsItems(candidates, topic, 5);
  check('news: topSimilarity reflects the best match', Math.abs(result.topSimilarity - 1) < 1e-9);
  check('news: poolSize reflects the full candidate count', result.poolSize === 1);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll chat retrieval checks passed.');
