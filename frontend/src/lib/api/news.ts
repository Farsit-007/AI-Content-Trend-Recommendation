import { apiDelete, apiGet, apiGetList, apiPatch, apiPost } from './client';
import type { Meta } from './types';

export interface NewsItemEngagement {
  points: number;
  comments: number;
  stars_delta: number;
}

/** Mirrors the backend's INewsItem response shape (list responses omit `content`/`embedding`). */
export interface NewsItemDto {
  _id: string;
  source: string;
  title: string;
  url: string;
  snippet?: string;
  content?: string;
  content_status?: 'none' | 'partial' | 'full' | 'failed';
  published_at?: string;
  engagement: NewsItemEngagement;
  trend_score: number;
  opportunity_score?: number;
  category?: string;
  impact_note?: string;
  high_opportunity?: boolean;
  is_overridden?: boolean;
  needs_review?: boolean;
  created_at: string;
}

export interface GetNewsItemsParams {
  searchTerm?: string;
  category?: string;
  /** Always pass explicitly — the backend's default sort is a no-op. */
  sort: string;
  page?: number;
  limit?: number;
  team_id?: string;
}

export function getNewsItems(
  params: GetNewsItemsParams,
): Promise<{ data: NewsItemDto[]; meta?: Meta }> {
  return apiGetList<NewsItemDto[]>('/news-items', { params });
}

export function getNewsItem(id: string): Promise<NewsItemDto> {
  return apiGet<NewsItemDto>(`/news-items/${id}`);
}

// --- Admin: global catalog management (POST/PATCH/DELETE /news-items) ---------

export interface CreateNewsItemPayload {
  source: string;
  source_id: string;
  content_hash: string;
  title: string;
  url: string;
  snippet?: string;
  content?: string;
  category?: string;
  published_at?: string;
}

/** POST /news-items (admin) — manually seed a global news item; embedding is computed server-side. */
export function createNewsItem(payload: CreateNewsItemPayload): Promise<NewsItemDto> {
  return apiPost<NewsItemDto>('/news-items', payload);
}

export interface UpdateNewsItemPayload {
  title?: string;
  url?: string;
  snippet?: string;
  content?: string;
  trend_score?: number;
  category?: string;
  impact_note?: string;
  opportunity_score?: number;
}

/** PATCH /news-items/:id (admin) — corrects the shared/global record for every team. */
export function updateNewsItem(id: string, payload: UpdateNewsItemPayload): Promise<NewsItemDto> {
  return apiPatch<NewsItemDto>(`/news-items/${id}`, payload);
}

/** DELETE /news-items/:id (admin) — removes a story entirely. */
export function deleteNewsItem(id: string): Promise<NewsItemDto> {
  return apiDelete<NewsItemDto>(`/news-items/${id}`);
}

// --- Admin: ingestion pipeline trigger -----------------------------------------

export interface IngestSourceSummary {
  source: string;
  fetched: number;
  deduped: number;
  discarded: number;
  stored: number;
}

export interface IngestSummary {
  sources: IngestSourceSummary[];
  totalStored: number;
}

/** POST /news-items/ingest (admin) — synchronously runs the full ingestion pipeline now. */
export function triggerIngestion(): Promise<IngestSummary> {
  return apiPost<IngestSummary>('/news-items/ingest', {});
}

// --- Per-team category/score override (PATCH/DELETE /news-items/:id/override) --

export interface SetOverridePayload {
  team_id: string;
  category?: string;
  opportunity_score?: number;
}

/** PATCH /news-items/:id/override — this team's correction, doesn't touch the shared record. */
export function setNewsItemOverride(id: string, payload: SetOverridePayload) {
  return apiPatch<unknown>(`/news-items/${id}/override`, payload);
}

/** DELETE /news-items/:id/override — reverts to the shared/global value for this team. */
export function clearNewsItemOverride(id: string, teamId: string) {
  return apiDelete<unknown>(`/news-items/${id}/override`, { data: { team_id: teamId } });
}
