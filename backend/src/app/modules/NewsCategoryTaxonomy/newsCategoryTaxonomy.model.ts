import { Schema, model } from 'mongoose';
import { INewsCategoryTaxonomy } from './newsCategoryTaxonomy.interface';

const newsCategoryTaxonomySchema = new Schema<INewsCategoryTaxonomy>({
  name: { type: String, required: true },
  normalized_key: { type: String, required: true, unique: true },
  broad_group: { type: String, required: true },
  source: { type: String, enum: ['seed', 'ingestion'], required: true },
  created_at: { type: Date, default: Date.now },
});

export const NewsCategoryTaxonomy = model<INewsCategoryTaxonomy>(
  'NewsCategoryTaxonomy',
  newsCategoryTaxonomySchema,
  'news_categories',
);
