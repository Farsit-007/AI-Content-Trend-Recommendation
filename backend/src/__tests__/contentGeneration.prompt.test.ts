import { buildUserPrompt } from '../app/modules/ContentGeneration/contentGeneration.prompt';
import { NewsItemContext } from '../app/modules/ContentGeneration/contentGeneration.interface';

describe('buildUserPrompt', () => {
  it('falls back to the bare-topic prompt when no news context is given', () => {
    expect(buildUserPrompt('AI agents in marketing')).toBe('Generate content about: "AI agents in marketing"');
  });

  it('falls back to the bare-topic prompt when the news context has nothing set', () => {
    const newsContext: NewsItemContext = {};
    expect(buildUserPrompt('AI agents in marketing', newsContext)).toBe(
      'Generate content about: "AI agents in marketing"',
    );
  });

  it('includes category and impact_note when present', () => {
    const newsContext: NewsItemContext = { category: 'AI/ML', impact_note: 'Relevant to dev-tool audiences' };
    const prompt = buildUserPrompt('New framework release', newsContext);

    expect(prompt).toContain('category: AI/ML');
    expect(prompt).toContain('why it matters: Relevant to dev-tool audiences');
  });

  it('includes snippet and url text when present', () => {
    const newsContext: NewsItemContext = {
      snippet: 'A new open-source tool for streaming LLM output with backpressure support.',
      url: 'https://example.test/launch-post',
    };
    const prompt = buildUserPrompt('New streaming tool launch', newsContext);

    expect(prompt).toContain('source snippet: "A new open-source tool for streaming LLM output with backpressure support."');
    expect(prompt).toContain('source: https://example.test/launch-post');
  });

  it('still includes the snippet when category and impact_note are both absent', () => {
    const newsContext: NewsItemContext = { snippet: 'Tag list: javascript, react, hooks' };
    const prompt = buildUserPrompt('Obscure Stack Overflow question', newsContext);

    expect(prompt).not.toBe('Generate content about: "Obscure Stack Overflow question"');
    expect(prompt).toContain('source snippet: "Tag list: javascript, react, hooks"');
  });
});
