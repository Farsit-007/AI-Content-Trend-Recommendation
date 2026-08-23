jest.mock('../app/lib/openrouterClient');

const mockOpenAIChatCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAIChatCreate } },
    embeddings: { create: jest.fn() },
  }));
});

import request from 'supertest';
import app from '../app';
import config from '../app/config';
import { encrypt } from '../app/lib/crypto';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser, testEmbedding } from './support/fixtures';
import { runBakeoffMatrix } from '../app/modules/ContentGeneration/contentGeneration.bakeoff';
import { LlmModel, LlmProvider } from '../app/modules/LlmProvider/llmProvider.model';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { StyleExample, StylePack } from '../app/modules/StylePack/stylePack.model';
import { Team } from '../app/modules/Team/team.model';
import { redis } from './support/redisMock';
import {
  getChatCompletionRequests,
  getLastChatCompletionRequest,
  getOpenRouterCallCounts,
  mockChatCompletion,
  mockChatCompletionByPrompt,
  mockChatCompletionFailureOnce,
  mockChatCompletionSequence,
  mockEmbedding,
} from './support/openrouterMock';

const createNewsItemDoc = (overrides: Partial<Record<string, unknown>> = {}) =>
  NewsItem.create({
    source: 'producthunt',
    source_id: `ph-${Date.now()}-${Math.random()}`,
    content_hash: `hash-${Date.now()}-${Math.random()}`,
    title: 'A new open-source tool for streaming LLM output',
    url: 'https://example.test/launch-post',
    embedding: testEmbedding(),
    category: 'AI/ML',
    ...overrides,
  });

beforeAll(connectTestDb);
afterEach(() => {
  mockOpenAIChatCreate.mockReset();
  return clearTestDb();
});
afterAll(disconnectTestDb);

const FB_TEXT = 'Check out our latest AI update! This changes how growth teams ship content.';
const LI_TEXT =
  'Excited to share how AI agents are reshaping content workflows.\n\nTeams that adopt this early win.\n\n#AI #ContentMarketing #GrowthStudio';
const CAPTION_TEXT = 'AI agents, meet your new best friend. #AI #GrowthStudio';
const YOUTUBE_IDEA = {
  title: 'How AI Agents Are Changing Content Creation',
  hook: 'What if your content strategy ran itself?',
  chapters: ['Intro', 'The problem', 'The AI solution', 'Results'],
  thumbnail_concept: 'A robot hand holding a glowing content calendar',
};

describe('POST /api/v1/content/generate', () => {
  it('generates the single default format for an authenticated user using the mocked LLM, without a real OpenRouter call', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-content-gen@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    // DEFAULT_FORMATS is deliberately a single format (contentGeneration.formats.ts) — omitting
    // `formats` must cost exactly one LLM call, not one per available format.
    mockChatCompletionByPrompt([{ match: 'Write a Facebook post', response: FB_TEXT }]);

    // No `formats` — resolution must fall back to DEFAULT_FORMATS.
    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing' });

    expect(res.status).toBe(200);
    expect(res.body.data.topic).toBe('AI agents in content marketing');
    expect(res.body.data.facebook_post).toBe(FB_TEXT);
    expect(res.body.data).not.toHaveProperty('linkedin_post');
    expect(res.body.data).not.toHaveProperty('youtube_idea');
    expect(res.body.data).not.toHaveProperty('caption');

    // Confirms the route went through the mock, not a real network call to OpenRouter — and that
    // exactly one call happened per requested format.
    const counts = getOpenRouterCallCounts();
    expect(counts.chatCompletionCalls).toBe(1);
    expect(counts.embeddingCalls).toBe(1);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/content/generate')
      .send({ team_id: '507f1f77bcf86cd799439011', topic: 'AI agents' });

    expect(res.status).toBe(401);
  });

  it('generates a single requested format', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-single-format@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(CAPTION_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['caption'] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ topic: 'AI agents', caption: CAPTION_TEXT, model_used: config.llm_model_content });
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(1);
  });

  it('generates youtube_idea as a structured object, not text', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-youtube-format@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(JSON.stringify(YOUTUBE_IDEA));

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['youtube_idea'] });

    expect(res.status).toBe(200);
    expect(res.body.data.youtube_idea).toEqual(YOUTUBE_IDEA);
  });

  it('rejects an unknown format', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-format-invalid@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['instagram_story'] });

    expect(res.status).toBe(400);
  });

  it('rejects an empty formats array', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-format-empty@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: [] });

    expect(res.status).toBe(400);
  });

  it('rejects duplicate formats', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-format-dup@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['facebook_post', 'facebook_post'] });

    expect(res.status).toBe(400);
  });

  it('rejects more than 5 formats', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-format-toomany@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: 'AI agents',
        formats: ['facebook_post', 'linkedin_post', 'facebook_reel_script', 'youtube_idea', 'caption', 'facebook_post'],
      });

    expect(res.status).toBe(400);
  });

  it('requesting a single additional format costs exactly one call, independent of a prior request', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-additional-format@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletionSequence([FB_TEXT, LI_TEXT]);
    const firstRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: 'AI agents in content marketing',
        formats: ['facebook_post', 'linkedin_post'],
      });
    expect(firstRes.status).toBe(200);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(2);

    mockChatCompletion(CAPTION_TEXT);
    const secondRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing', formats: ['caption'] });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data).toEqual({
      topic: 'AI agents in content marketing',
      caption: CAPTION_TEXT,
      model_used: config.llm_model_content,
    });
    // Only one more call happened — this request asked for `caption` only, so facebook_post/linkedin_post
    // were never re-requested (there is no response cache to serve or bypass either way).
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(3);
  });

  it('fails the whole request with 502 when one requested format errors', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-format-fail@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletionSequence([FB_TEXT]);
    // linkedin_post's primary call fails, and so does its automatic fallback-model retry —
    // simulating a genuine LLM outage for that format rather than relying on any mock default.
    mockChatCompletionFailureOnce();
    mockChatCompletionFailureOnce();

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: 'AI agents in content marketing',
        formats: ['facebook_post', 'linkedin_post'],
      });

    expect(res.status).toBe(502);

    // A follow-up request for facebook_post alone succeeds independently of the earlier failure.
    mockChatCompletion(FB_TEXT);
    const followUp = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing', formats: ['facebook_post'] });
    expect(followUp.status).toBe(200);
  });

  it('defaults the prompt to Bangla and includes the team custom instructions', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-voice-default@example.test' });
    const team = await createTestTeam({
      createdBy: admin._id.toString(),
      voiceProfile: { default_language: 'bangla', custom_instructions: 'Always end with a question.' },
    });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing', formats: ['facebook_post'] });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('Bengali (বাংলা script)');
    expect(systemPrompt).toContain('Always end with a question.');
  });

  it('lets the request language override the team default', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-voice-override@example.test' });
    const team = await createTestTeam({
      createdBy: admin._id.toString(),
      voiceProfile: { default_language: 'bangla' },
    });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', language: 'english', formats: ['facebook_post'] });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('Write in clear, natural English.');
    expect(systemPrompt).not.toContain('বাংলা');
  });

  it("includes the resolved news item's snippet and url in the generation prompt", async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-content-gen-snippet@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const newsItem = await createNewsItemDoc({
      snippet: 'A new open-source tool for streaming LLM output with backpressure support.',
      impact_note: 'Relevant to dev-tool audiences',
    });

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: newsItem.title,
        news_item_id: newsItem._id.toString(),
        formats: ['facebook_post'],
      });

    expect(res.status).toBe(200);
    const userPrompt = getLastChatCompletionRequest().messages[1].content;
    expect(userPrompt).toContain('source snippet: "A new open-source tool for streaming LLM output with backpressure support."');
    expect(userPrompt).toContain(`source: ${newsItem.url}`);

    // Confirms resolveNewsItemContext used the news item's stored embedding, not a fresh embed call.
    const counts = getOpenRouterCallCounts();
    expect(counts.embeddingCalls).toBe(0);
  });

  it('includes the anti-hallucination grounding instruction in the system prompt', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-content-gen-grounding@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing', formats: ['facebook_post'] });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('do not invent specific facts, numbers, quotes, features, or dates');
  });

  it('falls back to the topic-only prompt when the news_item_id does not resolve', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-content-gen-invalid-id@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    // A topic string unique to this test (not reused elsewhere in this file) — the topic-embedding
    // cache (contentGeneration.embedCache.ts) is keyed by topic text across the whole test run, so
    // reusing a shared topic like 'AI agents in content marketing' here would risk a cache hit from
    // an earlier test and silently zero out the embeddingCalls assertion below.
    const topic = 'AI agents in content marketing — dangling news_item_id fallback test';

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic,
        news_item_id: '507f1f77bcf86cd799439011',
        formats: ['facebook_post'],
      });

    expect(res.status).toBe(200);
    const userPrompt = getLastChatCompletionRequest().messages[1].content;
    expect(userPrompt).toBe(`Generate content about: "${topic}"`);

    // Falls back to embedding the raw topic text since the news item didn't resolve.
    const counts = getOpenRouterCallCounts();
    expect(counts.embeddingCalls).toBe(1);
  });

  it('rejects an invalid language value', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-voice-invalid@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', language: 'french' });

    expect(res.status).toBe(400);
  });
});

const createPackWithExample = async (content: string) => {
  const pack = await StylePack.create({
    name: 'Programming Hero',
    slug: `programming-hero-${Date.now()}-${Math.random()}`,
    language: 'bangla',
    is_active: true,
    created_by: 'test-seed',
  });
  await StyleExample.create({ style_pack_id: pack._id.toString(), content, embedding: testEmbedding() });
  return pack;
};

describe('POST /api/v1/content/generate — style pack conditioning', () => {
  it("includes the team's default style pack's example text in the system prompt", async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-stylepack-gen-1@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const pack = await createPackWithExample('একটা Programming Hero স্টাইলের পোস্ট');
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: pack._id.toString() });

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing', formats: ['facebook_post'] });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('একটা Programming Hero স্টাইলের পোস্ট');
    expect(systemPrompt).toContain('Style examples — write exactly in this style, tone, and rhythm:');
  });

  it("lets a request-level style_pack_id override the team's default", async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-stylepack-gen-2@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const defaultPack = await createPackWithExample('default pack example text');
    const overridePack = await createPackWithExample('override pack example text');
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: defaultPack._id.toString() });

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: 'AI agents in content marketing',
        style_pack_id: overridePack._id.toString(),
        formats: ['facebook_post'],
      });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('override pack example text');
    expect(systemPrompt).not.toContain('default pack example text');
  });

  it('soft-fails on a dangling default pack: 200 response, no style block', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-stylepack-gen-3@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const pack = await createPackWithExample('will be deleted');
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: pack._id.toString() });
    await StylePack.findByIdAndDelete(pack._id);

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing', formats: ['facebook_post'] });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).not.toContain('will be deleted');
    expect(systemPrompt).not.toContain('How this style writes');
    expect(systemPrompt).not.toContain('Style examples');
  });
});

describe('POST /api/v1/content/generate — platform-aware style retrieval', () => {
  const createTaggedPack = async (
    fbContents: string[],
    liContents: string[],
  ): Promise<InstanceType<typeof StylePack>> => {
    const pack = await StylePack.create({
      name: 'Programming Hero',
      slug: `programming-hero-platform-${Date.now()}-${Math.random()}`,
      language: 'bangla',
      is_active: true,
      created_by: 'test-seed',
    });
    await StyleExample.insertMany([
      ...fbContents.map((content) => ({
        style_pack_id: pack._id.toString(),
        content,
        embedding: testEmbedding(),
        platform: 'facebook' as const,
      })),
      ...liContents.map((content) => ({
        style_pack_id: pack._id.toString(),
        content,
        embedding: testEmbedding(),
        platform: 'linkedin' as const,
      })),
    ]);
    return pack;
  };

  it('gives facebook_post and linkedin_post distinct, platform-matched style example sets in one request', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-platform-1@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    // 5 of each platform — exactly the retrieval limit, so matches alone satisfy each format's
    // selection and no cross-platform backfill occurs, making the two prompts' example sets disjoint.
    const fbContents = Array.from({ length: 5 }, (_, i) => `FB-EXAMPLE-${i}`);
    const liContents = Array.from({ length: 5 }, (_, i) => `LI-EXAMPLE-${i}`);
    const pack = await createTaggedPack(fbContents, liContents);
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: pack._id.toString() });

    mockEmbedding();
    mockChatCompletionSequence([FB_TEXT, LI_TEXT]);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: 'AI agents in content marketing',
        formats: ['facebook_post', 'linkedin_post'],
      });

    expect(res.status).toBe(200);
    // Each format's chatCompletionForTask call now resolves its model via an async DB read before
    // the HTTP call, so the two concurrent calls' completion order is not guaranteed to match
    // `misses` array order — identify each call by its prompt content, not its position.
    const requests = getChatCompletionRequests();
    const fbCall = requests.find((r) => r.messages[0].content.includes('Write a Facebook post'));
    const liCall = requests.find((r) => r.messages[0].content.includes('Write a LinkedIn post'));
    expect(fbCall).toBeDefined();
    expect(liCall).toBeDefined();
    const fbPrompt = fbCall!.messages[0].content;
    const liPrompt = liCall!.messages[0].content;

    for (const content of fbContents) expect(fbPrompt).toContain(content);
    for (const content of liContents) expect(fbPrompt).not.toContain(content);

    for (const content of liContents) expect(liPrompt).toContain(content);
    for (const content of fbContents) expect(liPrompt).not.toContain(content);
  });

  it('fetches the style pack examples exactly once per request regardless of format count', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-platform-2@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const pack = await createTaggedPack(['fb one'], ['li one']);
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: pack._id.toString() });

    mockEmbedding();
    mockChatCompletionSequence([FB_TEXT, LI_TEXT]);

    const findSpy = jest.spyOn(StyleExample, 'find');
    try {
      const res = await request(app)
        .post('/api/v1/content/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
        team_id: team._id.toString(),
        topic: 'AI agents in content marketing',
        formats: ['facebook_post', 'linkedin_post'],
      });

      expect(res.status).toBe(200);
      expect(findSpy).toHaveBeenCalledTimes(1);
    } finally {
      findSpy.mockRestore();
    }
  });

  it('untagged (platform: other) examples still surface via backfill — no regression from platform-aware ranking', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-platform-3@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    // No platform passed — defaults to 'other' per the schema, matching pre-change corpora.
    const pack = await createPackWithExample('untagged legacy example text');
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: pack._id.toString() });

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing', formats: ['facebook_post'] });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('untagged legacy example text');
  });
});

describe('POST /api/v1/content/generate — fresh generation (no response cache)', () => {
  it('two identical generate requests produce independent drafts, each with its own LLM call', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-fresh-1@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const topic = 'fresh-generation-identical-requests unique topic';

    mockEmbedding();
    mockChatCompletion('First draft.');
    const firstRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic, formats: ['facebook_post'] });
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.facebook_post).toBe('First draft.');

    mockChatCompletion('Second draft — different from the first, and it should be served.');
    const secondRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic, formats: ['facebook_post'] });
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.facebook_post).toBe('Second draft — different from the first, and it should be served.');

    // Each identical request made its own LLM call — nothing was served from a response cache.
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(2);
  });

  it('the regenerate field is accepted and ignored, regardless of its value', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-fresh-2@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(FB_TEXT);
    const withTrueRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['facebook_post'], regenerate: true });
    expect(withTrueRes.status).toBe(200);

    const withFalseRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['facebook_post'], regenerate: false });
    expect(withFalseRes.status).toBe(200);

    const withoutFieldRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['facebook_post'] });
    expect(withoutFieldRes.status).toBe(200);

    // Every request produced its own LLM call — the flag's value made no difference.
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(3);
  });
});

describe('POST /api/v1/content/generate — per-format prompt directives', () => {
  it('includes the length/structure directive matching each requested format only', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-format-directives@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletionSequence([FB_TEXT, LI_TEXT]);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: 'AI agents in content marketing',
        formats: ['facebook_post', 'linkedin_post'],
      });

    expect(res.status).toBe(200);
    // See the platform-matched-examples test above for why this matches by content, not position.
    const requests = getChatCompletionRequests();
    const firstCall = requests.find((r) => r.messages[0].content.includes('Write a Facebook post'));
    const secondCall = requests.find((r) => r.messages[0].content.includes('Write a LinkedIn post'));
    expect(firstCall).toBeDefined();
    expect(secondCall).toBeDefined();
    const fbPrompt = firstCall!.messages[0].content;
    const liPrompt = secondCall!.messages[0].content;

    expect(fbPrompt).toContain('150-400 words');
    expect(fbPrompt).not.toContain('1,200-2,500 characters');
    expect(liPrompt).toContain('1,200-2,500 characters');
    expect(liPrompt).not.toContain('150-400 words');
  });
});

describe('POST /api/v1/content/generate — fact-grounded generation', () => {
  const RICH_CONTENT = 'A'.repeat(900);
  const THIN_CONTENT = 'A'.repeat(100);
  const FACT_SHEET = {
    summary: 'A new open-source tool streams LLM output with backpressure support.',
    facts: [
      'The tool supports backpressure handling for streamed tokens.',
      'It is open-source and available on GitHub.',
      'It integrates with existing Node.js HTTP servers.',
      'The initial release targets Node 18+.',
      'Benchmarks show a 30% reduction in memory usage versus naive streaming.',
    ],
  };

  it('extracts and injects a fact sheet into every requested format for a content-rich item', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-facts-1@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const newsItem = await createNewsItemDoc({ content: RICH_CONTENT, content_status: 'full' });

    mockEmbedding();
    mockChatCompletionSequence([JSON.stringify(FACT_SHEET), FB_TEXT, LI_TEXT]);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: newsItem.title,
        news_item_id: newsItem._id.toString(),
        formats: ['facebook_post', 'linkedin_post'],
      });

    expect(res.status).toBe(200);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(3);

    const [, fbCall, liCall] = getChatCompletionRequests();
    expect(fbCall.messages[1].content).toContain('Key facts from the source');
    expect(fbCall.messages[1].content).toContain(FACT_SHEET.facts[0]);
    expect(liCall.messages[1].content).toContain('Key facts from the source');
    expect(liCall.messages[1].content).toContain(FACT_SHEET.facts[0]);
  });

  it('reuses the cached fact sheet for a second team generating from the same item', async () => {
    const admin1 = await createTestUser({ role: 'super_admin', email: 'admin-facts-2a@example.test' });
    const team1 = await createTestTeam({ createdBy: admin1._id.toString() });
    const token1 = createAuthToken(admin1);
    const admin2 = await createTestUser({ role: 'super_admin', email: 'admin-facts-2b@example.test' });
    const team2 = await createTestTeam({ createdBy: admin2._id.toString() });
    const token2 = createAuthToken(admin2);
    const newsItem = await createNewsItemDoc({ content: RICH_CONTENT, content_status: 'full' });

    mockEmbedding();
    mockChatCompletionSequence([JSON.stringify(FACT_SHEET), FB_TEXT]);
    const firstRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        team_id: team1._id.toString(),
        topic: newsItem.title,
        news_item_id: newsItem._id.toString(),
        formats: ['facebook_post'],
      });
    expect(firstRes.status).toBe(200);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(2); // 1 extraction + 1 format call

    mockChatCompletion(LI_TEXT);
    const secondRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        team_id: team2._id.toString(),
        topic: newsItem.title,
        news_item_id: newsItem._id.toString(),
        formats: ['linkedin_post'],
      });
    expect(secondRes.status).toBe(200);
    // Only 1 more call (the second team's format) — no second extraction call.
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(3);

    const liCall = getChatCompletionRequests()[2];
    expect(liCall.messages[1].content).toContain('Key facts from the source');
  });

  it('skips extraction for content below the threshold, leaving the prompt shape unchanged', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-facts-3@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const newsItem = await createNewsItemDoc({ content: THIN_CONTENT, content_status: 'full', snippet: 'A short snippet.' });

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: newsItem.title,
        news_item_id: newsItem._id.toString(),
        formats: ['facebook_post'],
      });

    expect(res.status).toBe(200);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(1); // no extraction call
    const userPrompt = getLastChatCompletionRequest().messages[1].content;
    expect(userPrompt).not.toContain('Key facts from the source');
    expect(userPrompt).toContain('source snippet: "A short snippet."');
  });

  it('soft-fails when extraction returns garbage, generating without a facts block', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-facts-4@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const newsItem = await createNewsItemDoc({ content: RICH_CONTENT, content_status: 'full' });

    mockEmbedding();
    mockChatCompletionSequence(['not valid json', FB_TEXT]);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: newsItem.title,
        news_item_id: newsItem._id.toString(),
        formats: ['facebook_post'],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.facebook_post).toBe(FB_TEXT);
    const userPrompt = getChatCompletionRequests()[1].messages[1].content;
    expect(userPrompt).not.toContain('Key facts from the source');
  });
});

describe('POST /api/v1/content/refine', () => {
  const REVISED_TEXT = 'A shorter, punchier revision of the draft.';

  it('applies the instruction and returns the revised text without doing retrieval work', async () => {
    // Asserts on the *retrieval* caches specifically, not a global key count. Refine is a pure text
    // transform: it must not embed a topic or build a fact sheet. It may legitimately populate
    // unrelated read-through caches (the team's voice profile), and a global count would fail on
    // those and read as a regression in this endpoint.
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-refine-1@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const retrievalKeys = async () => [
      ...(await redis.keys('embed:topic:*')),
      ...(await redis.keys('facts:*')),
    ];
    const keysBefore = await retrievalKeys();

    mockChatCompletion(REVISED_TEXT);

    const res = await request(app)
      .post('/api/v1/content/refine')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        format: 'facebook_post',
        current_text: 'This is the original draft text that needs to be shorter.',
        instruction: 'make it shorter',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.revised_text).toBe(REVISED_TEXT);

    const keysAfter = await retrievalKeys();
    expect(keysAfter).toEqual(keysBefore);
  });

  it('rejects youtube_idea', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-refine-2@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/content/refine')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        format: 'youtube_idea',
        current_text: 'irrelevant',
        instruction: 'make it shorter',
      });

    expect(res.status).toBe(400);
  });

  it('rejects a user outside the team', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-refine-3@example.test' });
    const outsider = await createTestUser({ email: 'outsider-refine@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const outsiderToken = createAuthToken(outsider);

    const res = await request(app)
      .post('/api/v1/content/refine')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({
        team_id: team._id.toString(),
        format: 'facebook_post',
        current_text: 'Draft text.',
        instruction: 'make it shorter',
      });

    expect(res.status).toBe(403);
  });

  it('rejects oversized current_text and instruction', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-refine-4@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const tooLongText = await request(app)
      .post('/api/v1/content/refine')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        format: 'facebook_post',
        current_text: 'x'.repeat(6001),
        instruction: 'make it shorter',
      });
    expect(tooLongText.status).toBe(400);

    const tooLongInstruction = await request(app)
      .post('/api/v1/content/refine')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        format: 'facebook_post',
        current_text: 'Draft text.',
        instruction: 'x'.repeat(301),
      });
    expect(tooLongInstruction.status).toBe(400);
  });

  it("includes the resolved style pack's card but not its examples in the refine prompt", async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-refine-5@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const pack = await StylePack.create({
      name: 'Programming Hero',
      slug: `programming-hero-refine-${Date.now()}`,
      language: 'bangla',
      is_active: true,
      created_by: 'test-seed',
      style_card: 'Energetic edtech tone with short punchy sentences.',
    });
    await StyleExample.create({
      style_pack_id: pack._id.toString(),
      content: 'this pack example text should not appear in refine',
      embedding: testEmbedding(),
    });
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: pack._id.toString() });

    mockChatCompletion(REVISED_TEXT);

    const res = await request(app)
      .post('/api/v1/content/refine')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        format: 'facebook_post',
        current_text: 'Draft text.',
        instruction: 'make it shorter',
      });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('Energetic edtech tone with short punchy sentences.');
    expect(systemPrompt).not.toContain('this pack example text should not appear in refine');
  });
});

describe('bake-off harness prompt-assembly fidelity', () => {
  it('builds the identical system prompt as a live request for the same topic/format/pack and a brand-voice-cold team', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-bakeoff-parity@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const pack = await StylePack.create({
      name: 'Bakeoff Parity Pack',
      slug: `bakeoff-parity-${Date.now()}`,
      language: 'bangla',
      is_active: true,
      created_by: 'test-seed',
      style_card: 'Energetic edtech tone with short punchy sentences.',
    });
    await StyleExample.insertMany([
      { style_pack_id: pack._id.toString(), content: 'fb parity example', embedding: testEmbedding(), platform: 'facebook' },
      { style_pack_id: pack._id.toString(), content: 'li parity example', embedding: testEmbedding(), platform: 'linkedin' },
    ]);

    const topic = 'AI agents in content marketing';

    mockEmbedding();
    mockChatCompletion(FB_TEXT);
    const liveRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic,
        style_pack_id: pack._id.toString(),
        formats: ['facebook_post'],
        // runBakeoffMatrix defaults to Bangla; parity is only meaningful for the same language.
        language: 'bangla',
      });
    expect(liveRes.status).toBe(200);
    const liveSystemPrompt = getLastChatCompletionRequest().messages[0].content;

    mockEmbedding();
    mockChatCompletion('harness output — irrelevant to this assertion');
    const run = await runBakeoffMatrix({
      models: ['harness-model'],
      topics: [{ topic }],
      formats: ['facebook_post'],
      packSlug: pack.slug,
    });

    expect(run.cells).toHaveLength(1);
    expect(run.cells[0].systemPrompt).toBe(liveSystemPrompt);
  });
});

describe('POST /api/v1/content/generate — critique pass', () => {
  const originalEnabled = config.content_generation.critique_enabled;
  const originalFormats = config.content_generation.critique_formats;

  afterEach(() => {
    config.content_generation.critique_enabled = originalEnabled;
    config.content_generation.critique_formats = originalFormats;
  });

  const createPackForCritique = async () => {
    const pack = await StylePack.create({
      name: 'Critique Test Pack',
      slug: `critique-test-${Date.now()}-${Math.random()}`,
      language: 'bangla',
      is_active: true,
      created_by: 'test-seed',
      style_card: 'Energetic edtech tone with short punchy sentences.',
    });
    await StyleExample.create({ style_pack_id: pack._id.toString(), content: 'a style example', embedding: testEmbedding() });
    return pack;
  };

  it('flag off (default) makes zero extra calls and leaves output unchanged from pre-existing behavior', async () => {
    config.content_generation.critique_enabled = false;

    const admin = await createTestUser({ role: 'super_admin', email: 'admin-critique-off@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const pack = await createPackForCritique();
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: pack._id.toString() });

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['facebook_post'] });

    expect(res.status).toBe(200);
    expect(res.body.data.facebook_post).toBe(FB_TEXT);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(1);
  });

  it('flag on + eligible format + resolved pack makes exactly one extra call and returns the critiqued text', async () => {
    config.content_generation.critique_enabled = true;
    config.content_generation.critique_formats = ['facebook_post', 'linkedin_post'];

    const admin = await createTestUser({ role: 'super_admin', email: 'admin-critique-on@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const pack = await createPackForCritique();
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: pack._id.toString() });

    const CRITIQUED_TEXT = 'A critiqued, less-AI-sounding version of the post.';
    mockEmbedding();
    mockChatCompletionSequence([FB_TEXT, CRITIQUED_TEXT]);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['facebook_post'] });

    expect(res.status).toBe(200);
    expect(res.body.data.facebook_post).toBe(CRITIQUED_TEXT);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(2);
  });

  it('flag on but no style pack resolved makes zero extra calls', async () => {
    config.content_generation.critique_enabled = true;
    config.content_generation.critique_formats = ['facebook_post'];

    const admin = await createTestUser({ role: 'super_admin', email: 'admin-critique-nopack@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(FB_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['facebook_post'] });

    expect(res.status).toBe(200);
    expect(res.body.data.facebook_post).toBe(FB_TEXT);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(1);
  });

  it('flag on but youtube_idea (JSON-kind) makes zero extra calls', async () => {
    config.content_generation.critique_enabled = true;
    config.content_generation.critique_formats = ['facebook_post', 'linkedin_post', 'youtube_idea'] as never;

    const admin = await createTestUser({ role: 'super_admin', email: 'admin-critique-youtube@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const pack = await createPackForCritique();
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: pack._id.toString() });

    mockEmbedding();
    mockChatCompletion(JSON.stringify(YOUTUBE_IDEA));

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['youtube_idea'] });

    expect(res.status).toBe(200);
    expect(res.body.data.youtube_idea).toEqual(YOUTUBE_IDEA);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(1);
  });

  it('the flag does not affect /content/refine at all', async () => {
    config.content_generation.critique_enabled = true;
    config.content_generation.critique_formats = ['facebook_post'];

    const admin = await createTestUser({ role: 'super_admin', email: 'admin-critique-refine@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const REVISED = 'A refined version of the draft.';
    mockChatCompletion(REVISED);

    const res = await request(app)
      .post('/api/v1/content/refine')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), format: 'facebook_post', current_text: 'Draft.', instruction: 'shorter' });

    expect(res.status).toBe(200);
    expect(res.body.data.revised_text).toBe(REVISED);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(1);
  });

  it('returns the critiqued text, not the first-pass draft, on every independent request', async () => {
    config.content_generation.critique_enabled = true;
    config.content_generation.critique_formats = ['facebook_post'];

    const admin = await createTestUser({ role: 'super_admin', email: 'admin-critique-cache@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const pack = await createPackForCritique();
    await Team.findByIdAndUpdate(team._id, { default_style_pack_id: pack._id.toString() });

    const CRITIQUED_TEXT_1 = 'A first critiqued version of the post.';
    mockEmbedding();
    mockChatCompletionSequence([FB_TEXT, CRITIQUED_TEXT_1]);

    const firstRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['facebook_post'] });
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.facebook_post).toBe(CRITIQUED_TEXT_1);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(2);

    // A second, independent request re-runs both the base generation and the critique pass — no
    // response cache exists to serve either step from, so a differently-mocked run returns its own
    // (different) critiqued output rather than the first request's.
    const CRITIQUED_TEXT_2 = 'A second, differently critiqued version of the post.';
    mockChatCompletionSequence([FB_TEXT, CRITIQUED_TEXT_2]);
    const secondRes = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['facebook_post'] });
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.facebook_post).toBe(CRITIQUED_TEXT_2);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(4);
  });
});

describe('POST /api/v1/content/generate — non-bootstrap model resolution', () => {
  /** A real, active LlmProvider(openrouter) with one active key and one active chat-capable model. */
  const createConfiguredProviderAndModel = async (modelId: string) => {
    const provider = await LlmProvider.create({ provider_type: 'openrouter', name: 'Configured OpenRouter', is_active: true });
    provider.keys.push({
      encrypted_key: encrypt('real-configured-key'),
      key_last4: '9999',
      is_active: true,
      created_at: new Date(),
    } as never);
    await provider.save();

    const model = await LlmModel.create({
      provider_id: provider._id,
      model_id: modelId,
      display_name: 'Configured Model',
      capabilities: ['chat'],
      is_active: true,
    });
    return { provider, model };
  };

  it("resolves through the team's default_models[content_generation] — hits the adapter, not the bootstrap client", async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-team-default-model@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const { model } = await createConfiguredProviderAndModel('openrouter/team-default-model');
    await Team.findByIdAndUpdate(team._id, { default_models: { content_generation: model._id.toString() } });

    mockEmbedding();
    mockOpenAIChatCreate.mockResolvedValue({ choices: [{ message: { content: CAPTION_TEXT } }] });

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['caption'] });

    expect(res.status).toBe(200);
    expect(res.body.data.caption).toBe(CAPTION_TEXT);
    expect(res.body.data.model_used).toBe('openrouter/team-default-model');
    // The team-configured adapter handled the call — the bootstrap (shared openrouterClient) mock never did.
    expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(1);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(0);
  });

  it('a request-level llm_model_id overrides the team default', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-request-override-model@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const { model: teamModel } = await createConfiguredProviderAndModel('openrouter/team-default-model-2');
    const { model: requestModel } = await createConfiguredProviderAndModel('openrouter/request-override-model');
    await Team.findByIdAndUpdate(team._id, { default_models: { content_generation: teamModel._id.toString() } });

    mockEmbedding();
    mockOpenAIChatCreate.mockResolvedValue({ choices: [{ message: { content: CAPTION_TEXT } }] });

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: 'AI agents',
        formats: ['caption'],
        llm_model_id: requestModel._id.toString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.model_used).toBe('openrouter/request-override-model');
  });

  it('an inactive team default model soft-falls-through to the bootstrap tier rather than failing the request', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-inactive-team-default@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const { model } = await createConfiguredProviderAndModel('openrouter/inactive-team-default');
    await LlmModel.findByIdAndUpdate(model._id, { is_active: false });
    await Team.findByIdAndUpdate(team._id, { default_models: { content_generation: model._id.toString() } });

    mockEmbedding();
    mockChatCompletion(CAPTION_TEXT);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', formats: ['caption'] });

    expect(res.status).toBe(200);
    expect(res.body.data.caption).toBe(CAPTION_TEXT);
    expect(res.body.data.model_used).toBe(config.llm_model_content);
    expect(mockOpenAIChatCreate).not.toHaveBeenCalled();
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(1);
  });
});
