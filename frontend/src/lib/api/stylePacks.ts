import { apiGet } from './client';
import type { LanguageStyle } from './content';

export interface StylePackDto {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  language: LanguageStyle;
  tone_tags: string[];
  is_active: boolean;
}

/** GET /style-packs — active packs for any authenticated user; no pagination envelope. */
export function listStylePacks(): Promise<StylePackDto[]> {
  return apiGet<StylePackDto[]>('/style-packs');
}
