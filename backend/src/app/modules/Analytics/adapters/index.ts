import config from '../../../config';
import { IAdapterResult } from '../analytics.interface';
import { facebookAdapter } from './facebook';
import { instagramAdapter } from './instagram';
import { linkedinAdapter } from './linkedin';
import { mockAdapter } from './mock';

/** Adapter callable used by the refresh service. `accountId` is the credential's stored account id. */
export type AdapterFn = (
  token: string,
  teamId: string,
  platform: string,
  accountId?: string,
) => Promise<IAdapterResult>;

/**
 * Platforms with a WORKING real adapter. youtube is intentionally absent — in real mode a platform
 * without a real adapter serves NO data and reports pending approval (never fake numbers). LinkedIn
 * is registered, but its adapter itself returns `pending_approval` until the Community Management
 * API product is approved on the app.
 */
const REAL_ADAPTERS: Record<string, (token: string, accountId: string) => Promise<IAdapterResult>> = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  linkedin: linkedinAdapter,
};

/**
 * Whether the resolved adapter serves mock (demo) data. Mock data is produced ONLY when the global
 * switch is on (the test default); with it off, no platform ever returns mock numbers.
 */
export const isMockAdapter = (): boolean => config.analytics.use_mock_adapters;

export const getAdapter = (platform: string): AdapterFn => {
  // Global master switch (the test default) forces every platform to mock.
  if (config.analytics.use_mock_adapters) {
    return (_token, teamId, plat) => mockAdapter(teamId, plat);
  }

  const real = REAL_ADAPTERS[platform];
  const realEnabled = config.analytics.real_platforms.includes(platform);
  if (real && realEnabled) {
    return (token, _teamId, _plat, accountId) => real(token, accountId ?? '');
  }

  // Real mode + no real adapter for this platform: report pending approval, never demo data.
  return async () => ({ status: 'pending_approval', posts: [] });
};
