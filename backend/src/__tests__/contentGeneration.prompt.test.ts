import { buildMessages, buildRefineMessages, buildSystemPrompt, buildUserPrompt, StyleContext } from '../app/modules/ContentGeneration/contentGeneration.prompt';
import { FewShotExample, NewsItemContext } from '../app/modules/ContentGeneration/contentGeneration.interface';
import { VoiceOptions } from '../app/lib/voiceProfile';

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

  it('renders the fact sheet block after the existing context line', () => {
    const newsContext: NewsItemContext = {
      snippet: 'A new open-source tool for streaming LLM output with backpressure support.',
      url: 'https://example.test/launch-post',
    };
    const factSheet = {
      summary: 'A tool for streaming LLM output.',
      facts: ['Supports backpressure.', 'Open-source.'],
    };
    const prompt = buildUserPrompt('New streaming tool launch', newsContext, factSheet);

    expect(prompt).toBe(
      'Generate content about: "New streaming tool launch"\n\n' +
        'Additional context (source snippet: "A new open-source tool for streaming LLM output with backpressure support."; source: https://example.test/launch-post)\n\n' +
        'Key facts from the source (ground your claims in these; do not invent beyond them):\n' +
        '- Supports backpressure.\n' +
        '- Open-source.\n' +
        'Summary: A tool for streaming LLM output.',
    );
  });

  it('renders the fact sheet block even with no other news context', () => {
    const factSheet = { summary: 'Short summary.', facts: ['Fact one.', 'Fact two.'] };
    const prompt = buildUserPrompt('Some topic', undefined, factSheet);

    expect(prompt).toBe(
      'Generate content about: "Some topic"\n\n' +
        'Key facts from the source (ground your claims in these; do not invent beyond them):\n' +
        '- Fact one.\n' +
        '- Fact two.\n' +
        'Summary: Short summary.',
    );
  });
});

describe('buildSystemPrompt', () => {
  const voiceOptions: VoiceOptions = { language: 'bangla' };
  const teamExample: FewShotExample = { source: 'brand_voice_example', content: 'team post content' };
  const styleExample: FewShotExample = { source: 'style_pack_example', content: 'pack post content' };

  it('produces the byte-identical brand-neutral prompt with no examples and no style context', () => {
    const prompt = buildSystemPrompt([], voiceOptions);
    expect(prompt).toContain('this team has not yet submitted brand-voice examples');
    expect(prompt).not.toContain('Style examples');
    expect(prompt).not.toContain('How this style writes');
  });

  it('produces the byte-identical team-voice prompt (no style context) when brand-voice examples exist', () => {
    const prompt = buildSystemPrompt([teamExample], voiceOptions);
    expect(prompt).toContain('Brand voice examples:\n1. [brand_voice_example]\nteam post content');
    expect(prompt).not.toContain('Style examples');
    expect(prompt).not.toContain("This team's own past posts");
  });

  it('orders style card before style examples before team examples when a style pack resolves', () => {
    const styleContext: StyleContext = { card: 'Energetic edtech tone.', examples: [styleExample] };
    const prompt = buildSystemPrompt([teamExample], voiceOptions, styleContext);

    const cardIndex = prompt.indexOf('How this style writes');
    const styleExamplesIndex = prompt.indexOf('Style examples');
    const teamExamplesIndex = prompt.indexOf("This team's own past posts");

    expect(cardIndex).toBeGreaterThan(-1);
    expect(styleExamplesIndex).toBeGreaterThan(cardIndex);
    expect(teamExamplesIndex).toBeGreaterThan(styleExamplesIndex);
    expect(prompt).toContain('pack post content');
    expect(prompt).toContain('team post content');
  });

  it('renders only the style examples block (no card line) when the pack has no style_card', () => {
    const styleContext: StyleContext = { examples: [styleExample] };
    const prompt = buildSystemPrompt([], voiceOptions, styleContext);

    expect(prompt).not.toContain('How this style writes');
    expect(prompt).toContain('Style examples — write exactly in this style, tone, and rhythm:');
    expect(prompt).toContain('pack post content');
  });

  it('uses the styled branch, not the brand-neutral fallback, for a cold-start team with a resolved pack', () => {
    const styleContext: StyleContext = { card: 'Energetic edtech tone.', examples: [styleExample] };
    const prompt = buildSystemPrompt([], voiceOptions, styleContext);

    expect(prompt).not.toContain('this team has not yet submitted brand-voice examples');
    expect(prompt).toContain('How this style writes');
  });
});

describe('buildMessages (per-format)', () => {
  const voiceOptions: VoiceOptions = { language: 'bangla' };

  it('includes the anti-AI-tell instruction for text-kind formats', () => {
    for (const format of ['facebook_post', 'linkedin_post', 'facebook_reel_script', 'caption'] as const) {
      const messages = buildMessages(format, 'topic', [], voiceOptions);
      expect(messages[0].content).toContain('Vary sentence lengths naturally');
    }
  });

  it('omits the anti-AI-tell instruction for youtube_idea', () => {
    const messages = buildMessages('youtube_idea', 'topic', [], voiceOptions);
    expect(messages[0].content).not.toContain('Vary sentence lengths naturally');
  });

  it('includes each format\'s own length/structure directive and no other format\'s', () => {
    const fbPrompt = buildMessages('facebook_post', 'topic', [], voiceOptions)[0].content;
    const liPrompt = buildMessages('linkedin_post', 'topic', [], voiceOptions)[0].content;
    const captionPrompt = buildMessages('caption', 'topic', [], voiceOptions)[0].content;

    expect(fbPrompt).toContain('150-400 words');
    expect(fbPrompt).not.toContain('1,200-2,500 characters');
    expect(liPrompt).toContain('1,200-2,500 characters');
    expect(liPrompt).not.toContain('150-400 words');
    expect(captionPrompt).toContain('at most 200 characters');
  });

  it('includes the youtube_idea JSON shape contract only for that format', () => {
    const ytPrompt = buildMessages('youtube_idea', 'topic', [], voiceOptions)[0].content;
    const fbPrompt = buildMessages('facebook_post', 'topic', [], voiceOptions)[0].content;

    expect(ytPrompt).toContain('"thumbnail_concept"');
    expect(fbPrompt).not.toContain('"thumbnail_concept"');
  });

  it('user message is unaffected by which format is requested', () => {
    const fbUser = buildMessages('facebook_post', 'my topic', [], voiceOptions)[1].content;
    const liUser = buildMessages('linkedin_post', 'my topic', [], voiceOptions)[1].content;
    expect(fbUser).toBe(liUser);
  });
});

describe('buildRefineMessages', () => {
  const voiceOptions: VoiceOptions = { language: 'bangla' };

  it('includes the language instruction and anti-AI-tell instruction', () => {
    const messages = buildRefineMessages('Original draft text.', 'make it shorter', voiceOptions);
    expect(messages[0].content).toContain('Bengali (বাংলা script)');
    expect(messages[0].content).toContain('Vary sentence lengths naturally');
  });

  it('includes the fixed editing contract', () => {
    const messages = buildRefineMessages('Original draft text.', 'make it shorter', voiceOptions);
    expect(messages[0].content).toContain('Change no more than the instruction requires');
    expect(messages[0].content).toContain('Return ONLY the revised text');
  });

  it('includes the style card when present', () => {
    const messages = buildRefineMessages('Original draft text.', 'make it shorter', voiceOptions, 'Energetic edtech tone.');
    expect(messages[0].content).toContain('How this style writes');
    expect(messages[0].content).toContain('Energetic edtech tone.');
  });

  it('omits the style card block when absent', () => {
    const messages = buildRefineMessages('Original draft text.', 'make it shorter', voiceOptions);
    expect(messages[0].content).not.toContain('How this style writes');
  });

  it('places the draft text and instruction in the user message', () => {
    const messages = buildRefineMessages('Original draft text.', 'make it shorter', voiceOptions);
    expect(messages[1].content).toBe('Draft:\nOriginal draft text.\n\nInstruction: make it shorter');
  });
});
