"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const newsIngestion_utils_1 = require("../app/modules/NewsIngestion/newsIngestion.utils");
const threshold = 0.93;
const item = (overrides) => {
    var _a, _b, _c;
    return (Object.assign({ source: 'test', source_id: (_a = overrides.source_id) !== null && _a !== void 0 ? _a : 'id', title: 'title', url: (_b = overrides.url) !== null && _b !== void 0 ? _b : 'https://example.com', raw_points: 0, raw_comments: 0, raw_stars_delta: 0, content_hash: (_c = overrides.content_hash) !== null && _c !== void 0 ? _c : 'hash', embedding: [1, 0, 0] }, overrides));
};
// Same direction, different magnitude => cosine similarity 1
const near = [0.99, 0.01, 0.01];
// Orthogonal => cosine similarity 0
const distinct = [0, 1, 0];
let failures = 0;
const check = (name, condition) => {
    if (!condition) {
        failures++;
        console.error(`FAIL: ${name}`);
    }
    else {
        console.log(`PASS: ${name}`);
    }
};
// 3.3: two in-run items above threshold -> lower-engagement one discarded
{
    const low = item({ source_id: 'a', url: 'a', content_hash: 'a', embedding: [1, 0, 0], raw_points: 10 });
    const high = item({ source_id: 'b', url: 'b', content_hash: 'b', embedding: near, raw_points: 100 });
    const result = (0, newsIngestion_utils_1.dedupeSemantic)([low, high], [], threshold);
    check('in-run duplicate: only higher-engagement item survives', result.length === 1 && result[0].source_id === 'b');
}
// 3.4: item above threshold against recent-pool embedding -> discarded regardless of engagement
{
    const highEngagement = item({ source_id: 'c', url: 'c', content_hash: 'c', embedding: [1, 0, 0], raw_points: 1000 });
    const result = (0, newsIngestion_utils_1.dedupeSemantic)([highEngagement], [near], threshold);
    check('recent-pool duplicate discarded despite high engagement', result.length === 0);
}
// 3.5: items below threshold -> both survive
{
    const a = item({ source_id: 'd', url: 'd', content_hash: 'd', embedding: [1, 0, 0] });
    const b = item({ source_id: 'e', url: 'e', content_hash: 'e', embedding: distinct });
    const result = (0, newsIngestion_utils_1.dedupeSemantic)([a, b], [], threshold);
    check('distinct items both survive', result.length === 2);
}
if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
}
console.log('\nAll semantic dedup checks passed.');
