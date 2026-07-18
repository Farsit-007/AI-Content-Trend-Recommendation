export interface INewsCategoryTaxonomy {
  /** Canonical display form — what gets stored on `NewsItem.category` and shown to teams. */
  name: string;
  /** Lowercased, trimmed form of `name` — the dedup key (unique index). */
  normalized_key: string;
  /** One of the fixed six (`NEWS_CATEGORIES`) this category rolls up under — itself, for a
   *  fixed-six entry. */
  broad_group: string;
  source: 'seed' | 'ingestion';
  created_at: Date;
}
