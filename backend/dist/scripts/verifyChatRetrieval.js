"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chat_intent_1 = require("../app/modules/Chat/chat.intent");
const chat_retrieval_1 = require("../app/modules/Chat/chat.retrieval");
const topic = [1, 0, 0];
const similar = [0.99, 0.01, 0.01];
const orthogonal = [0, 1, 0];
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
// Intent: platform/performance keywords are detected.
{
    const intent = (0, chat_intent_1.classifyIntent)('How did our Facebook engagement do this week?');
    check('intent: facebook performance question detects performance only', intent.performance && !intent.news);
}
// Intent: news/trend keywords are detected.
{
    const intent = (0, chat_intent_1.classifyIntent)('What news is trending in AI right now?');
    check('intent: trend question detects news only', intent.news && !intent.performance);
}
// Intent: ambiguous question falls back to both.
{
    const intent = (0, chat_intent_1.classifyIntent)('What should I do today?');
    check('intent: ambiguous question defaults to both true', intent.news && intent.performance);
}
// Intent: Bengali keywords are detected.
{
    const intent = (0, chat_intent_1.classifyIntent)('আমাদের ফেসবুক পারফরম্যান্স কেমন?');
    check('intent: Bengali facebook question detects performance', intent.performance);
}
// News ranking: highest trend_score within similarity pool wins.
{
    const candidates = [
        { title: 'off-topic-high-trend', trend_score: 9, embedding: orthogonal },
        { title: 'on-topic-low-trend', trend_score: 1, embedding: similar },
    ];
    const result = (0, chat_retrieval_1.rankNewsItems)(candidates, topic, 1, 20);
    check('news: similarity ranking wins within the trend pool', result.length === 1 && result[0].content.includes('on-topic-low-trend'));
}
// News ranking: pool size excludes low-trend items before similarity ranking runs.
{
    const candidates = [
        { title: 'top-trend', trend_score: 10, embedding: topic },
        { title: 'excluded-by-pool', trend_score: 0, embedding: topic },
    ];
    const result = (0, chat_retrieval_1.rankNewsItems)(candidates, topic, 5, 1);
    check('news: pool size caps candidates before similarity ranking', result.length === 1 && result[0].content.includes('top-trend'));
}
// News ranking: empty pool returns empty result, no throw.
{
    const result = (0, chat_retrieval_1.rankNewsItems)([], topic, 5, 20);
    check('news: empty pool returns empty result', result.length === 0);
}
if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
}
console.log('\nAll chat retrieval checks passed.');
