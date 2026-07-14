import config from '../../../config';
import { IAdapterResult } from '../analytics.interface';
import { facebookAdapter } from './facebook';
import { linkedinAdapter } from './linkedin';
import { mockAdapter } from './mock';
import { youtubeAdapter } from './youtube';

export type AdapterFn = (token: string, teamId: string, platform: string) => Promise<IAdapterResult>;

const REAL_ADAPTERS: Record<string, (token: string) => Promise<IAdapterResult>> = {
  facebook: facebookAdapter,
  youtube: youtubeAdapter,
  linkedin: linkedinAdapter,
};

export const getAdapter = (platform: string): AdapterFn => {
  if (config.analytics.use_mock_adapters) {
    return (_token, teamId, plat) => mockAdapter(teamId, plat);
  }

  const real = REAL_ADAPTERS[platform];
  if (real) {
    return (token) => real(token);
  }

  return (_token, teamId, plat) => mockAdapter(teamId, plat);
};
