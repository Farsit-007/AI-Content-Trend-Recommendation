import { apiDelete, apiGet, apiGetList, apiPatch, apiPost } from './client';
import type { Meta } from './types';
import type { LanguageStyle } from './content';

export interface StylePackDto {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  language: LanguageStyle;
  tone_tags: string[];
  style_card?: string;
  /** When style_card was last (re)generated — compare style_card_example_count against the pack's
   *  current example count to derive staleness; there is no separate stale flag from the API. */
  style_card_generated_at?: string;
  style_card_example_count?: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface StylePackDetailDto extends StylePackDto {
  example_count: number;
}

/** GET /style-packs — active packs for any authenticated user; `include_inactive` only takes
 *  effect for a super_admin caller (silently ignored for everyone else). No pagination envelope. */
export function listStylePacks(includeInactive = false): Promise<StylePackDto[]> {
  return apiGet<StylePackDto[]>('/style-packs', {
    params: includeInactive ? { include_inactive: 'true' } : undefined,
  });
}

/** GET /style-packs/:id — no active/inactive gating for any role. */
export function getStylePack(id: string): Promise<StylePackDetailDto> {
  return apiGet<StylePackDetailDto>(`/style-packs/${id}`);
}

export interface CreateStylePackPayload {
  name: string;
  slug: string;
  description?: string;
  language: LanguageStyle;
  tone_tags?: string[];
  style_card?: string;
  is_active?: boolean;
}

/** POST /style-packs (super_admin only). */
export function createStylePack(payload: CreateStylePackPayload): Promise<StylePackDto> {
  return apiPost<StylePackDto>('/style-packs', payload);
}

export interface UpdateStylePackPayload {
  name?: string;
  slug?: string;
  description?: string;
  language?: LanguageStyle;
  tone_tags?: string[];
  style_card?: string;
  is_active?: boolean;
}

/** PATCH /style-packs/:id (super_admin only) — the standard retirement move is `{is_active:false}`. */
export function updateStylePack(id: string, payload: UpdateStylePackPayload): Promise<StylePackDto> {
  return apiPatch<StylePackDto>(`/style-packs/${id}`, payload);
}

/** DELETE /style-packs/:id (super_admin only) — cascades its StyleExamples. */
export function deleteStylePack(id: string): Promise<StylePackDto> {
  return apiDelete<StylePackDto>(`/style-packs/${id}`);
}

export interface StyleExampleDto {
  _id: string;
  style_pack_id: string;
  content: string;
  platform: 'facebook' | 'linkedin' | 'other';
  source_ref?: string;
  engagement_hint?: string;
  created_at: string;
}

/** GET /style-packs/:id/examples — no gating for any role, paginated. */
export function listStyleExamples(
  packId: string,
  page = 1,
  limit = 20,
): Promise<{ data: StyleExampleDto[]; meta?: Meta }> {
  return apiGetList<StyleExampleDto[]>(`/style-packs/${packId}/examples`, { params: { page, limit } });
}

export interface CreateStyleExamplePayload {
  content: string;
  platform?: 'facebook' | 'linkedin' | 'other';
  source_ref?: string;
  engagement_hint?: string;
}

/** POST /style-packs/:id/examples (super_admin only) — embedding computed server-side. */
export function addStyleExample(packId: string, payload: CreateStyleExamplePayload): Promise<StyleExampleDto> {
  return apiPost<StyleExampleDto>(`/style-packs/${packId}/examples`, payload);
}

/** DELETE /style-packs/:id/examples/:exampleId (super_admin only). */
export function deleteStyleExample(packId: string, exampleId: string): Promise<StyleExampleDto> {
  return apiDelete<StyleExampleDto>(`/style-packs/${packId}/examples/${exampleId}`);
}

export interface BulkImportResult {
  created: number;
  skipped: number;
  total: number;
}

/** POST /style-packs/:id/examples/bulk (super_admin only) — up to 100 items, one embeddings call,
 *  whitespace-normalized de-dup against existing examples and within the batch. */
export function bulkAddExamples(packId: string, items: CreateStyleExamplePayload[]): Promise<BulkImportResult> {
  return apiPost<BulkImportResult>(`/style-packs/${packId}/examples/bulk`, { items });
}

/** POST /style-packs/:id/generate-card (super_admin only) — shares implementation with the CLI
 *  script; overwrites style_card and its freshness metadata on the pack. */
export function generateCard(packId: string): Promise<{ style_card: string }> {
  return apiPost<{ style_card: string }>(`/style-packs/${packId}/generate-card`, {});
}
