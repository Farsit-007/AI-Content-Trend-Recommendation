import AppError from '../../errors/AppError';
import { httpStatus } from '../../utils/httpStatus';
import { IGeneratedContentFormats } from './generatedContent.interface';

/** Every write path (the auto job, and change 7C's manual-save endpoint) must satisfy this before persisting. */
export const assertHasAtLeastOneFormat = (formats: IGeneratedContentFormats) => {
  if (Object.values(formats).every((value) => value === undefined)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'At least one format must be provided');
  }
};
