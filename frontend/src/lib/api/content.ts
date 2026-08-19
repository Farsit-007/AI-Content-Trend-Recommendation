import { apiGetList, apiPatch, apiPost } from './client';
import { streamSse } from './sse';
import { ApiError } from './types';
import type { Meta } from './types';

export type FormatId = 'facebook_post' | 'linkedin_post' | 'facebook_reel_script' | 'youtube_idea' | 'caption';
export type LanguageStyle = 'bangla' | 'english';

/** Mirrors the backend's DEFAULT_FORMATS (contentGeneration.formats.ts) — sent explicitly when the user hasn't toggled anything. */
export const DEFAULT_FORMATS: FormatId[] = ['facebook_post'];

/** Every format key the generate response can contain — used to tell format entries apart from
 *  metadata keys (`topic`, `model_used`) when iterating the response object. */
export const ALL_FORMATS: FormatId[] = [
  'facebook_post',
  'linkedin_post',
  'facebook_reel_script',
  'youtube_idea',
  'caption',
];

export interface YoutubeIdea {
  title: string;
  hook: string;
  chapters: string[];
  thumbnail_concept: string;
}

/** Any non-empty subset of the five formats — never all required. */
export type GeneratedFormats = Partial<Record<FormatId, string | YoutubeIdea>>;

export interface GenerateContentRequest {
  team_id: string;
  topic: string;
  news_item_id?: string;
  language?: LanguageStyle;
  style_pack_id?: string;
  formats?: FormatId[];
  /** Per-request override of the resolved content_generation model — an LlmModel _id. */
  llm_model_id?: string;
}

/** Every request always generates fresh output, so model_used is always present. */
export type GenerateContentResponse = { topic: string; model_used: string } & GeneratedFormats;

export function generateContent(payload: GenerateContentRequest): Promise<GenerateContentResponse> {
  return apiPost<GenerateContentResponse>('/content/generate', payload);
}

export interface GenerateStreamHandlers {
  onStart?: (formats: FormatId[], modelUsed: string) => void;
  /** Fires as each format completes — render it immediately rather than waiting for the rest. */
  onFormat: (format: FormatId, value: string | YoutubeIdea) => void;
  /** One format failed; the others are unaffected and still coming. */
  onFormatError?: (format: FormatId, message: string) => void;
  onDone?: (result: GenerateContentResponse) => void;
  signal?: AbortSignal;
}

/**
 * POST /content/generate/stream — same generation, emitted one format at a time.
 *
 * A five-format request is a fact-extraction call plus one call per format plus an optional critique
 * pass each. Buffered, that is a single HTTP request held open well past a typical 30s proxy
 * timeout — and a timeout there discards work that was already paid for and completed. Streaming
 * also means the first post is on screen in seconds instead of everything arriving at once at the end.
 *
 * Aborting the `signal` stops the server making the remaining calls, so cancelling actually saves money.
 */
export async function generateContentStream(
  payload: GenerateContentRequest,
  handlers: GenerateStreamHandlers,
): Promise<void> {
  let streamError: string | null = null;

  await streamSse('/content/generate/stream', payload, {
    signal: handlers.signal,
    onEvent: (event, data) => {
      const d = data as {
        formats?: FormatId[];
        model_used?: string;
        format?: FormatId;
        value?: string | YoutubeIdea;
        message?: string;
      };
      if (event === 'start') handlers.onStart?.(d.formats ?? [], d.model_used ?? '');
      else if (event === 'format' && d.format && d.value !== undefined) handlers.onFormat(d.format, d.value);
      else if (event === 'format_error' && d.format) handlers.onFormatError?.(d.format, d.message ?? 'Generation failed');
      else if (event === 'done') handlers.onDone?.(data as GenerateContentResponse);
      else if (event === 'error') streamError = d.message ?? 'Content generation failed';
    },
  });

  if (streamError) throw new ApiError(streamError, 502, []);
}

export interface RefineContentRequest {
  team_id: string;
  /** Text formats only — youtube_idea is rejected by the backend. */
  format: FormatId;
  current_text: string;
  instruction: string;
  language?: LanguageStyle;
  style_pack_id?: string;
  /** Per-request override of the resolved content_generation model — an LlmModel _id. */
  llm_model_id?: string;
}

export function refineContent(payload: RefineContentRequest): Promise<{ revised_text: string }> {
  return apiPost<{ revised_text: string }>('/content/refine', payload);
}

export type GeneratedContentSource = 'auto' | 'manual';
export type GeneratedContentStatus = 'draft' | 'approved' | 'dismissed';

export interface GeneratedContentDto {
  _id: string;
  team_id: string;
  news_item_id?: string;
  topic: string;
  formats: GeneratedFormats;
  source: GeneratedContentSource;
  status: GeneratedContentStatus;
  model_used?: string;
  /** Absent for `source: 'auto'` drafts — no human created those. */
  created_by_name?: string;
  /** Set once a human approves/dismisses this draft. */
  updated_by_name?: string;
  updated_at?: string;
  created_at: string;
}

export interface SaveDraftRequest {
  team_id: string;
  news_item_id?: string;
  topic: string;
  formats: GeneratedFormats;
  model_used?: string;
}

export function saveDraft(payload: SaveDraftRequest): Promise<GeneratedContentDto> {
  return apiPost<GeneratedContentDto>('/generated-content', payload);
}

export interface ListDraftsParams {
  team_id: string;
  status?: GeneratedContentStatus;
  source?: GeneratedContentSource;
  page?: number;
  limit?: number;
}

export function listDrafts(
  params: ListDraftsParams,
): Promise<{ data: GeneratedContentDto[]; meta?: Meta }> {
  return apiGetList<GeneratedContentDto[]>('/generated-content', { params });
}

export function updateDraftStatus(
  id: string,
  status: Extract<GeneratedContentStatus, 'approved' | 'dismissed'>,
): Promise<GeneratedContentDto> {
  return apiPatch<GeneratedContentDto>(`/generated-content/${id}`, { status });
}

export interface AutoGenerationSummary {
  teams_processed: number;
  drafts_created: number;
  skipped: number;
}

/** POST /generated-content/run (admin-only) — the same job the daily scheduler runs, forced
 *  right now. Omit `teamId` to run it for every team. */
export function triggerAutoGeneration(teamId?: string): Promise<AutoGenerationSummary> {
  return apiPost<AutoGenerationSummary>('/generated-content/run', teamId ? { team_id: teamId } : {});
}
