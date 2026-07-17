import { Types } from 'mongoose';
import { EmbeddedNewsItem, RecentPoolEntry, dedupeSemantic } from '../app/modules/NewsIngestion/newsIngestion.utils';

// Two-band router (D2): below `floor` accepted; at/above `ceiling` hard duplicate (no LLM);
// in between a gray pair deferred to adjudication. This offline check only exercises the pure
// routing at the band edges — the LLM judge is covered by the live harness.
const floor = 0.88;
const ceiling = 0.9443;

const item = (overrides: Partial<EmbeddedNewsItem>): EmbeddedNewsItem => ({
  source: 'test',
  source_id: overrides.source_id ?? 'id',
  title: 'title',
  url: overrides.url ?? 'https://example.com',
  raw_points: 0,
  raw_comments: 0,
  raw_stars_delta: 0,
  content_hash: overrides.content_hash ?? 'hash',
  embedding: [1, 0, 0],
  ...overrides,
});

const poolEntry = (embedding: number[]): RecentPoolEntry => ({
  _id: new Types.ObjectId(),
  embedding,
  title: 'stored',
});

// Same direction, different magnitude => cosine similarity ~1 (>= ceiling => hard duplicate)
const near = [0.99, 0.01, 0.01];
// A gray-band vector: cosine ~0.90 against [1,0,0] (between floor and ceiling)
const gray = [1, 0.48, 0];
// Orthogonal => cosine similarity 0 (< floor => accepted)
const distinct = [0, 1, 0];

let failures = 0;

const check = (name: string, condition: boolean) => {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${name}`);
  } else {
    console.log(`PASS: ${name}`);
  }
};

// Two in-run items at/above the ceiling -> in-run hard duplicate, higher-engagement one survives.
{
  const low = item({ source_id: 'a', url: 'a', content_hash: 'a', embedding: [1, 0, 0], raw_points: 10 });
  const high = item({ source_id: 'b', url: 'b', content_hash: 'b', embedding: near, raw_points: 100 });
  const result = dedupeSemantic([low, high], [], floor, ceiling);
  check(
    'in-run hard duplicate: only higher-engagement item survives, loser corroborates it',
    result.accepted.length === 1 &&
      result.accepted[0].source_id === 'b' &&
      (result.accepted[0].corroborations?.length ?? 0) === 1,
  );
}

// Item at/above the ceiling against the recent pool -> hard drop (corroborate stored match).
{
  const highEngagement = item({ source_id: 'c', url: 'c', content_hash: 'c', embedding: [1, 0, 0], raw_points: 1000 });
  const result = dedupeSemantic([highEngagement], [poolEntry(near)], floor, ceiling);
  check(
    'recent-pool hard duplicate dropped despite high engagement',
    result.accepted.length === 0 && result.hardStoredDrops.length === 1,
  );
}

// Item in the gray band against the recent pool -> deferred to adjudication (not auto-dropped).
{
  const candidate = item({ source_id: 'g', url: 'g', content_hash: 'g', embedding: gray });
  const result = dedupeSemantic([candidate], [poolEntry([1, 0, 0])], floor, ceiling);
  check(
    'gray-band candidate routed to adjudication, not dropped',
    result.accepted.length === 0 && result.grayPairs.length === 1 && result.grayPairs[0].match.kind === 'stored',
  );
}

// Items below the floor -> both accepted.
{
  const a = item({ source_id: 'd', url: 'd', content_hash: 'd', embedding: [1, 0, 0] });
  const b = item({ source_id: 'e', url: 'e', content_hash: 'e', embedding: distinct });
  const result = dedupeSemantic([a, b], [], floor, ceiling);
  check('distinct items both accepted', result.accepted.length === 2 && result.grayPairs.length === 0);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll semantic dedup checks passed.');
