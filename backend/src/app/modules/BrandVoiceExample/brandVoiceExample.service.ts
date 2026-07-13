import QueryBuilder from '../../builder/QueryBuilder';
import { embed } from '../../lib/embeddings';
import { IBrandVoiceExample } from './brandVoiceExample.interface';
import { BrandVoiceExample } from './brandVoiceExample.model';
import { brandVoiceExampleSearchableFields } from './brandVoiceExample.utils';

const createBrandVoiceExample = async (payload: Partial<IBrandVoiceExample>) => {
  const embedding = payload.embedding ?? (await embed(payload.content as string));
  const result = await BrandVoiceExample.create({ ...payload, embedding });
  return result;
};

const getAllBrandVoiceExamples = async (query: Record<string, unknown>) => {
  const brandVoiceExampleQuery = new QueryBuilder(BrandVoiceExample.find(), query)
    .search(brandVoiceExampleSearchableFields)
    .filter()
    .sort()
    .paginate();

  const result = await brandVoiceExampleQuery.modelQuery;
  const meta = await brandVoiceExampleQuery.countTotal();
  return { meta, result };
};

const getSingleBrandVoiceExample = async (id: string) => {
  const result = await BrandVoiceExample.findById(id);
  return result;
};

const updateBrandVoiceExample = async (id: string, payload: Partial<IBrandVoiceExample>) => {
  const result = await BrandVoiceExample.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
  return result;
};

const deleteBrandVoiceExample = async (id: string) => {
  const result = await BrandVoiceExample.findByIdAndDelete(id);
  return result;
};

export const BrandVoiceExampleService = {
  createBrandVoiceExample,
  getAllBrandVoiceExamples,
  getSingleBrandVoiceExample,
  updateBrandVoiceExample,
  deleteBrandVoiceExample,
};
