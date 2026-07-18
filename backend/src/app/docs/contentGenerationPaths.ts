/**
 * Hand-written path for POST /content/generate — a single RAG-grounded generation
 * endpoint, not a CRUD resource, so it doesn't fit `buildResourcePaths` (paths.ts).
 */
const errorRef = { $ref: '#/components/schemas/ErrorEnvelope' };
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorRef } },
});
const singleEnvelope = (schemaName: string) => ({
  allOf: [
    { $ref: '#/components/schemas/SuccessEnvelope' },
    { type: 'object', properties: { data: { $ref: `#/components/schemas/${schemaName}` } } },
  ],
});
const jsonBody = (schemaName: string) => ({
  required: true,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } },
});
const bearerAuth = [{ bearerAuth: [] as string[] }];

export const contentGenerationPaths = {
  '/content/generate': {
    post: {
      tags: ['Content Generation'],
      summary: "Generate long-form content per requested format, grounded in the team's brand voice and/or a style pack",
      description:
        'Each requested format (default: facebook_post, linkedin_post) is its own LLM call with format-specific ' +
        'length/structure directives, cached independently per team+item+language+style-pack+format. Text formats ' +
        'are plain text; youtube_idea is a structured object. If any requested format fails, the whole request fails.',
      security: bearerAuth,
      requestBody: jsonBody('GenerateContentRequest'),
      responses: {
        '200': {
          description: 'Generated content — topic plus exactly the requested formats',
          content: { 'application/json': { schema: singleEnvelope('GeneratedContent') } },
        },
        '400': errorResponse('Validation error'),
        '403': errorResponse('You do not have access to this team'),
        '502': errorResponse('Content generation failed — an LLM call for one of the requested formats failed or returned an invalid response'),
      },
    },
  },
  '/content/refine': {
    post: {
      tags: ['Content Generation'],
      summary: 'Apply a short instruction to an existing text-format draft (uncached)',
      description:
        'One uncached LLM call that edits current_text per instruction, preserving language and register. ' +
        'Text formats only — youtube_idea is rejected. Powers tweak chips like "shorter" / "more casual".',
      security: bearerAuth,
      requestBody: jsonBody('RefineContentRequest'),
      responses: {
        '200': {
          description: 'Revised text',
          content: { 'application/json': { schema: singleEnvelope('RefineContentResponse') } },
        },
        '400': errorResponse('Validation error'),
        '403': errorResponse('You do not have access to this team'),
        '502': errorResponse('Content refinement failed — the LLM call or its response was invalid'),
      },
    },
  },
};
