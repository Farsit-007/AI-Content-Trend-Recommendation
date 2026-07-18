import {
  BrandVoiceCandidate,
  rankBrandVoiceExamples,
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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll content generation retrieval checks passed.');
