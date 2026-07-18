import { apiGet, apiGetList } from './client';
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
