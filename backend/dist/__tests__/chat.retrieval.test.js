"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chat_retrieval_1 = require("../app/modules/Chat/chat.retrieval");
const candidate = (overrides = {}) => (Object.assign({ title: 'A trending story', trend_score: 5, embedding: Array(1536).fill(0.01) }, overrides));
describe('rankNewsItems', () => {
    it('includes a Content line when the candidate has content', () => {
        const questionEmbedding = Array(1536).fill(0.01);
        const [result] = (0, chat_retrieval_1.rankNewsItems)([candidate({ content: 'Full article text.' })], questionEmbedding, 1, 1);
        expect(result.content).toContain('Content: Full article text.');
    });
    it('omits the Content line when the candidate has no content', () => {
        const questionEmbedding = Array(1536).fill(0.01);
        const [result] = (0, chat_retrieval_1.rankNewsItems)([candidate()], questionEmbedding, 1, 1);
        expect(result.content).not.toContain('Content:');
    });
    it('truncates a long content excerpt to 300 characters', () => {
        const questionEmbedding = Array(1536).fill(0.01);
        const longContent = 'x'.repeat(500);
        const [result] = (0, chat_retrieval_1.rankNewsItems)([candidate({ content: longContent })], questionEmbedding, 1, 1);
        expect(result.content).toContain(`Content: ${'x'.repeat(300)}`);
        expect(result.content).not.toContain('x'.repeat(301));
    });
});
