import AppError from '../../errors/AppError';
import { embed } from '../../lib/embeddings';
import { httpStatus } from '../../utils/httpStatus';
import { UserRole } from '../User/user.interface';
import { IStyleExample, IStylePack } from './stylePack.interface';
import { StyleExample, StylePack } from './stylePack.model';

const createPack = async (payload: Partial<IStylePack>) => {
  const result = await StylePack.create(payload);
  return result;
};

const listPacks = async (includeInactive: boolean, role: UserRole) => {
  const filter = includeInactive && role === 'super_admin' ? {} : { is_active: true };
  return StylePack.find(filter).sort('-created_at');
};

const getPackById = async (id: string) => {
  const pack = await StylePack.findById(id);
  if (!pack) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style pack not found');
  }
  const example_count = await StyleExample.countDocuments({ style_pack_id: id });
  return { ...pack.toObject(), example_count };
};

const updatePack = async (id: string, payload: Partial<IStylePack>) => {
  const pack = await StylePack.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
  if (!pack) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style pack not found');
  }
  return pack;
};

const deletePack = async (id: string) => {
  const pack = await StylePack.findByIdAndDelete(id);
  if (!pack) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style pack not found');
  }
  await StyleExample.deleteMany({ style_pack_id: id });
  return pack;
};

const addExample = async (packId: string, payload: Partial<IStyleExample>) => {
  const pack = await StylePack.findById(packId);
  if (!pack) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style pack not found');
  }

  const embedding = payload.embedding ?? (await embed(payload.content as string));
  const result = await StyleExample.create({ ...payload, style_pack_id: packId, embedding });
  return result;
};

const listExamples = async (packId: string, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [result, total] = await Promise.all([
    StyleExample.find({ style_pack_id: packId }).skip(skip).limit(limit).sort('-created_at'),
    StyleExample.countDocuments({ style_pack_id: packId }),
  ]);
  return { meta: { page, limit, total, totalPage: Math.ceil(total / limit) }, result };
};

const deleteExample = async (packId: string, exampleId: string) => {
  const result = await StyleExample.findOneAndDelete({ _id: exampleId, style_pack_id: packId });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style example not found');
  }
  return result;
};

export const StylePackService = {
  createPack,
  listPacks,
  getPackById,
  updatePack,
  deletePack,
  addExample,
  listExamples,
  deleteExample,
};
