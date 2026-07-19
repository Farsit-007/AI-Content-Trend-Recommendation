jest.mock('../app/lib/openrouterClient');

import config from '../app/config';
import {
  critiqueText,
  hasStableScriptRatio,
  isCritiqueEligible,
  isCritiqueStructurallyEligible,
  isNonEmpty,
  isWithinLengthBand,
} from '../app/modules/ContentGeneration/contentGeneration.critique';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { mockChatCompletion, mockChatCompletionFailureOnce } from './support/openrouterMock';

// critiqueText now resolves its model via chatCompletionForTask, which reads LlmTaskDefault/Team
// from Mongo even on the bootstrap (no LlmProvider records configured) path.
beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('isNonEmpty', () => {
  it('rejects empty and whitespace-only strings', () => {
    expect(isNonEmpty('')).toBe(false);
    expect(isNonEmpty('   ')).toBe(false);
    expect(isNonEmpty('a')).toBe(true);
  });
});

describe('isWithinLengthBand', () => {
  const draft = 'x'.repeat(100);

  it('accepts the exact boundaries (0.5x and 1.6x)', () => {
    expect(isWithinLengthBand(draft, 'x'.repeat(50))).toBe(true);
    expect(isWithinLengthBand(draft, 'x'.repeat(160))).toBe(true);
  });

  it('rejects just outside the boundaries', () => {
    expect(isWithinLengthBand(draft, 'x'.repeat(49))).toBe(false);
    expect(isWithinLengthBand(draft, 'x'.repeat(161))).toBe(false);
  });

  it('rejects when the draft itself is empty (nothing to compare against)', () => {
    expect(isWithinLengthBand('', 'anything')).toBe(false);
  });
});

describe('hasStableScriptRatio', () => {
  const banglaDraft = 'এটি একটি বাংলা বাক্য যা পরীক্ষার জন্য ব্যবহার করা হচ্ছে।';

  it('passes when the Bangla-script ratio is stable', () => {
    const candidate = 'এটি একটি নতুন বাংলা বাক্য যা পরীক্ষার জন্য ব্যবহার করা হচ্ছে।';
    expect(hasStableScriptRatio(banglaDraft, candidate, 'bangla')).toBe(true);
  });

  it('fails when the candidate drifts heavily toward English', () => {
    const candidate = 'This is now almost entirely an English sentence with just one word বাংলা left.';
    expect(hasStableScriptRatio(banglaDraft, candidate, 'bangla')).toBe(false);
  });

  it('skips the check entirely for non-bangla languages', () => {
    expect(hasStableScriptRatio('any draft', 'completely different english text', 'english')).toBe(true);
  });

  it('does not block when the draft itself has no Bangla script to compare against', () => {
    expect(hasStableScriptRatio('an english draft', 'a different english candidate', 'bangla')).toBe(true);
  });
});

describe('isCritiqueStructurallyEligible', () => {
  const pack = { style_card: 'a card' };

  it('requires a text-kind format', () => {
    expect(isCritiqueStructurallyEligible('facebook_post', pack)).toBe(true);
    expect(isCritiqueStructurallyEligible('youtube_idea', pack)).toBe(false);
  });

  it('requires a resolved pack', () => {
    expect(isCritiqueStructurallyEligible('facebook_post', null)).toBe(false);
  });

  it('is independent of the live config flag', () => {
    const original = config.content_generation.critique_enabled;
    config.content_generation.critique_enabled = false;
    try {
      expect(isCritiqueStructurallyEligible('facebook_post', pack)).toBe(true);
    } finally {
      config.content_generation.critique_enabled = original;
    }
  });
});

describe('isCritiqueEligible', () => {
  const pack = { style_card: 'a card' };
  let originalEnabled: boolean;
  let originalFormats: typeof config.content_generation.critique_formats;

  beforeEach(() => {
    originalEnabled = config.content_generation.critique_enabled;
    originalFormats = config.content_generation.critique_formats;
  });

  afterEach(() => {
    config.content_generation.critique_enabled = originalEnabled;
    config.content_generation.critique_formats = originalFormats;
  });

  it('requires the flag to be enabled', () => {
    config.content_generation.critique_enabled = false;
    config.content_generation.critique_formats = ['facebook_post'];
    expect(isCritiqueEligible('facebook_post', pack)).toBe(false);
  });

  it('requires the format to be in the configured list', () => {
    config.content_generation.critique_enabled = true;
    config.content_generation.critique_formats = ['linkedin_post'];
    expect(isCritiqueEligible('facebook_post', pack)).toBe(false);
  });

  it('requires a text-kind format', () => {
    config.content_generation.critique_enabled = true;
    config.content_generation.critique_formats = ['youtube_idea'] as never;
    expect(isCritiqueEligible('youtube_idea', pack)).toBe(false);
  });

  it('requires a resolved pack', () => {
    config.content_generation.critique_enabled = true;
    config.content_generation.critique_formats = ['facebook_post'];
    expect(isCritiqueEligible('facebook_post', null)).toBe(false);
  });

  it('is true only when every condition holds', () => {
    config.content_generation.critique_enabled = true;
    config.content_generation.critique_formats = ['facebook_post', 'linkedin_post'];
    expect(isCritiqueEligible('facebook_post', pack)).toBe(true);
  });
});

describe('critiqueText', () => {
  const draft = 'এটি একটি সাধারণ পোস্ট যা পরীক্ষার জন্য ব্যবহার করা হচ্ছে আজকে।';

  it('returns the critiqued text when the LLM call succeeds and passes the guards', async () => {
    const revised = 'এটি একটি নতুন পোস্ট যা পরীক্ষার জন্য ব্যবহার করা হচ্ছে আজকে।';
    mockChatCompletion(revised);

    const result = await critiqueText(draft, 'Energetic edtech tone.', { language: 'bangla' });

    expect(result).toBe(revised);
  });

  it('falls back to the draft when the LLM call fails (both primary and fallback)', async () => {
    mockChatCompletionFailureOnce();
    mockChatCompletionFailureOnce();

    const result = await critiqueText(draft, 'a card', { language: 'bangla' });

    expect(result).toBe(draft);
  });

  it('falls back to the draft when the response is oversized', async () => {
    mockChatCompletion(draft.repeat(3));

    const result = await critiqueText(draft, 'a card', { language: 'bangla' });

    expect(result).toBe(draft);
  });

  it('falls back to the draft when the response is empty', async () => {
    mockChatCompletion('   ');

    const result = await critiqueText(draft, 'a card', { language: 'bangla' });

    expect(result).toBe(draft);
  });

  it('falls back to the draft when the response drifts away from Bangla script', async () => {
    mockChatCompletion('This response is now almost entirely English with no meaningful script left.');

    const result = await critiqueText(draft, 'a card', { language: 'bangla' });

    expect(result).toBe(draft);
  });
});
