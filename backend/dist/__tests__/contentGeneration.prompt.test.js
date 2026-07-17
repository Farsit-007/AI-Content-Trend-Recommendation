"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const contentGeneration_prompt_1 = require("../app/modules/ContentGeneration/contentGeneration.prompt");
describe('buildUserPrompt', () => {
    it('falls back to the bare-topic prompt when no news context is given', () => {
        expect((0, contentGeneration_prompt_1.buildUserPrompt)('AI agents in marketing')).toBe('Generate content about: "AI agents in marketing"');
    });
    it('falls back to the bare-topic prompt when the news context has nothing set', () => {
        const newsContext = {};
        expect((0, contentGeneration_prompt_1.buildUserPrompt)('AI agents in marketing', newsContext)).toBe('Generate content about: "AI agents in marketing"');
    });
    it('includes category and impact_note when present', () => {
        const newsContext = { category: 'AI/ML', impact_note: 'Relevant to dev-tool audiences' };
        const prompt = (0, contentGeneration_prompt_1.buildUserPrompt)('New framework release', newsContext);
        expect(prompt).toContain('category: AI/ML');
        expect(prompt).toContain('why it matters: Relevant to dev-tool audiences');
    });
    it('includes snippet and url text when present', () => {
        const newsContext = {
            snippet: 'A new open-source tool for streaming LLM output with backpressure support.',
            url: 'https://example.test/launch-post',
        };
        const prompt = (0, contentGeneration_prompt_1.buildUserPrompt)('New streaming tool launch', newsContext);
        expect(prompt).toContain('source snippet: "A new open-source tool for streaming LLM output with backpressure support."');
        expect(prompt).toContain('source: https://example.test/launch-post');
    });
    it('still includes the snippet when category and impact_note are both absent', () => {
        const newsContext = { snippet: 'Tag list: javascript, react, hooks' };
        const prompt = (0, contentGeneration_prompt_1.buildUserPrompt)('Obscure Stack Overflow question', newsContext);
        expect(prompt).not.toBe('Generate content about: "Obscure Stack Overflow question"');
        expect(prompt).toContain('source snippet: "Tag list: javascript, react, hooks"');
    });
});
