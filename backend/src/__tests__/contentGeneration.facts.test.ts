jest.mock('../app/lib/openrouterClient');

import { extractFactSheet } from '../app/modules/ContentGeneration/contentGeneration.facts';
import config from '../app/config';
import { getLastChatCompletionRequest, mockChatCompletion } from './support/openrouterMock';

const VALID_FACT_SHEET = {
  summary: 'A new open-source tool streams LLM output with backpressure support.',
  facts: [
    'The tool supports backpressure handling for streamed tokens.',
    'It is open-source and available on GitHub.',
    'It integrates with existing Node.js HTTP servers.',
    'The initial release targets Node 18+.',
    'Benchmarks show a 30% reduction in memory usage versus naive streaming.',
  ],
};

describe('extractFactSheet', () => {
  it('parses a valid JSON response', async () => {
    mockChatCompletion(JSON.stringify(VALID_FACT_SHEET));

    const result = await extractFactSheet('A new streaming tool', 'Full article body here.');

    expect(result).toEqual(VALID_FACT_SHEET);
  });

  it('parses a fenced JSON response', async () => {
    mockChatCompletion('```json\n' + JSON.stringify(VALID_FACT_SHEET) + '\n```');

    const result = await extractFactSheet('A new streaming tool', 'Full article body here.');

    expect(result).toEqual(VALID_FACT_SHEET);
  });

  it('returns null when facts is missing', async () => {
    mockChatCompletion(JSON.stringify({ summary: 'Only a summary.' }));

    const result = await extractFactSheet('Topic', 'Content');

    expect(result).toBeNull();
  });

  it('returns null when facts is not an array', async () => {
    mockChatCompletion(JSON.stringify({ summary: 'Summary.', facts: 'not an array' }));

    const result = await extractFactSheet('Topic', 'Content');

    expect(result).toBeNull();
  });

  it('returns null when summary is empty', async () => {
    mockChatCompletion(JSON.stringify({ summary: '', facts: VALID_FACT_SHEET.facts }));

    const result = await extractFactSheet('Topic', 'Content');

    expect(result).toBeNull();
  });

  it('returns null when facts has fewer than 5 items', async () => {
    mockChatCompletion(JSON.stringify({ summary: 'Summary.', facts: ['one', 'two'] }));

    const result = await extractFactSheet('Topic', 'Content');

    expect(result).toBeNull();
  });

  it('returns null on unparseable output', async () => {
    mockChatCompletion('not json at all');

    const result = await extractFactSheet('Topic', 'Content');

    expect(result).toBeNull();
  });

  it('caps the content sent to the model at CONTENT_FACTS_INPUT_MAX_CHARS', async () => {
    mockChatCompletion(JSON.stringify(VALID_FACT_SHEET));
    const longContent = 'x'.repeat(config.content_generation.facts_input_max_chars + 5000);

    await extractFactSheet('Topic', longContent);

    const userMessage = getLastChatCompletionRequest().messages[1].content;
    // "Title: Topic\n\nArticle:\n" prefix plus the capped content — assert it did not include the full length.
    expect(userMessage.length).toBeLessThan(longContent.length);
    expect(userMessage).toContain('x'.repeat(config.content_generation.facts_input_max_chars));
  });
});
