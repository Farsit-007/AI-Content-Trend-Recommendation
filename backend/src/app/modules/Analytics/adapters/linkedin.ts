import { IAdapterResult } from '../analytics.interface';

export const linkedinAdapter = async (_token: string): Promise<IAdapterResult> => {
  return { status: 'pending_approval', posts: [] };
};
