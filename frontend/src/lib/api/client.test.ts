import axios, { type AxiosAdapter, type AxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiGet } from './client';
import { clearToken, getToken, setToken } from './tokenStore';
import { ApiError } from './types';

/**
 * The refresh interceptor is the riskiest logic in the frontend: a regression here signs everybody
 * out, and nothing else would catch it. Rather than mocking axios wholesale, these swap the
 * instance's *adapter* — so the real interceptor chain runs, and only the network is faked.
 */

/** Queue of adapter responses, consumed in request order. */
let responses: (
  | { status: number; data?: unknown }
  | { status: number; data?: unknown; reject: true }
)[] = [];
let requests: AxiosRequestConfig[] = [];

const queueAdapter: AxiosAdapter = async (config) => {
  requests.push(config);
  const next = responses.shift();
  if (!next) throw new Error(`No queued response for ${config.method} ${config.url}`);

  const response = {
    data: next.data ?? {},
    status: next.status,
    statusText: '',
    headers: {},
    config,
  };
  if ('reject' in next || next.status >= 400) {
    return Promise.reject(Object.assign(new Error(`Request failed with status ${next.status}`), {
      isAxiosError: true,
      response,
      config,
    }));
  }
  return response as never;
};

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  responses = [];
  requests = [];
  clearToken();
  api.defaults.adapter = queueAdapter;
  // The client redirects to /login when refresh fails; jsdom's location is not assignable.
  vi.stubGlobal('location', { pathname: '/dashboard', assign: vi.fn() });
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('request interceptor', () => {
  it('attaches the bearer token when one is held', async () => {
    setToken('access-1');
    responses.push({ status: 200, data: { data: 'ok' } });

    await apiGet('/news-items');

    expect(requests[0].headers?.Authorization).toBe('Bearer access-1');
  });

  it('sends no Authorization header when signed out', async () => {
    responses.push({ status: 200, data: { data: 'ok' } });

    await apiGet('/news-items');

    expect(requests[0].headers?.Authorization).toBeUndefined();
  });
});

describe('401 refresh-and-retry', () => {
  it('refreshes once, stores the new token, and retries the original request', async () => {
    setToken('expired');
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { token: 'fresh' } } } as never);

    responses.push({ status: 401 });
    responses.push({ status: 200, data: { data: 'recovered' } });

    const result = await apiGet<string>('/news-items');

    expect(result).toBe('recovered');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(getToken()).toBe('fresh');
    // The retry must carry the *new* token, not the expired one it started with.
    expect(requests[1].headers?.Authorization).toBe('Bearer fresh');
  });

  it('shares one refresh across concurrent 401s instead of stampeding', async () => {
    setToken('expired');
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { token: 'fresh' } } } as never);

    responses.push({ status: 401 }, { status: 401 }, { status: 401 });
    responses.push({ status: 200, data: { data: 'a' } }, { status: 200, data: { data: 'b' } }, { status: 200, data: { data: 'c' } });

    const results = await Promise.all([apiGet('/a'), apiGet('/b'), apiGet('/c')]);

    // Three failures, one refresh — the whole point of the single-flight promise.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  it('does not retry the same request twice', async () => {
    setToken('expired');
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { token: 'fresh' } } } as never);

    // Still 401 even with a fresh token: the retry must give up rather than loop.
    responses.push({ status: 401 }, { status: 401 });

    await expect(apiGet('/news-items')).rejects.toThrow(ApiError);
    expect(requests).toHaveLength(2);
  });

  it('clears the token and redirects when the refresh itself fails', async () => {
    setToken('expired');
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh cookie expired'));
    responses.push({ status: 401 });

    await expect(apiGet('/news-items')).rejects.toThrow(ApiError);

    expect(getToken()).toBeNull();
    expect(window.location.assign).toHaveBeenCalledWith('/login');
  });

  it('never tries to refresh a failed login — that 401 is the answer, not an expired session', async () => {
    const refresh = vi.spyOn(axios, 'post');
    responses.push({ status: 401, data: { message: 'Invalid email or password' } });

    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('error normalization', () => {
  it('surfaces the API message and status as an ApiError', async () => {
    responses.push({ status: 409, data: { message: 'A news ingestion run is already in progress.' } });

    await expect(apiGet('/news-items')).rejects.toMatchObject({
      message: 'A news ingestion run is already in progress.',
      status: 409,
    });
  });
});
