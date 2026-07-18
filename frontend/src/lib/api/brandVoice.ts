import { apiDelete, apiGetList, apiPost } from './client';
import type { Meta } from './types';

export type BrandVoicePlatform = 'facebook' | 'linkedin' | 'other';

export interface BrandVoiceExampleDto {
  _id: string;
  team_id: string;
  platform: string;
  category?: string;
  content: string;
  engagement_hint?: string;
  created_at: string;
}

export interface ListBrandVoiceExamplesParams {
  team_id: string;
  limit?: number;
}

/** GET /brand-voice-examples?team_id=… — team-scoped list, high limit since teams are asked for 25-30 examples. */
export function listBrandVoiceExamples(
  params: ListBrandVoiceExamplesParams,
): Promise<{ data: BrandVoiceExampleDto[]; meta?: Meta }> {
  return apiGetList<BrandVoiceExampleDto[]>('/brand-voice-examples', {
    params: { limit: 100, ...params },
  });
}

export interface CreateBrandVoiceExamplePayload {
  team_id: string;
  platform: BrandVoicePlatform;
  content: string;
  category?: string;
  engagement_hint?: string;
}

/** POST /brand-voice-examples — embedding is computed server-side from `content`. */
export function createBrandVoiceExample(
  payload: CreateBrandVoiceExamplePayload,
): Promise<BrandVoiceExampleDto> {
  return apiPost<BrandVoiceExampleDto>('/brand-voice-examples', payload);
}

export function deleteBrandVoiceExample(id: string): Promise<BrandVoiceExampleDto> {
  return apiDelete<BrandVoiceExampleDto>(`/brand-voice-examples/${id}`);
}
