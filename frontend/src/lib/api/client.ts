import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { clearToken, getToken, setToken } from './tokenStore';
import { ApiError, type ApiEnvelope, type AuthTokens, type Meta } from './types';

const baseURL =
  import.meta.env.VITE_API_URL;

/** Shared axios instance. `withCredentials` sends the httpOnly refresh cookie. */
export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// --- Request: attach the Bearer access token when we have one. ---------------
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Error normalization -----------------------------------------------------
function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const data = error.response?.data as
      | { message?: string; errorSource?: ApiError['errorSource'] }
      | undefined;
    return new ApiError(
      data?.message || error.message || 'Request failed',
      status,
      data?.errorSource ?? [],
    );
  }
  return new ApiError('Unexpected error', 0);
}

function redirectToLogin(): void {
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

// --- Single-flight token refresh ---------------------------------------------
// Concurrent 401s share one in-flight refresh promise; a bare axios call is used
// so the refresh request itself never re-enters this interceptor.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const res = await axios.post<ApiEnvelope<AuthTokens>>(
    `${baseURL}/auth/refresh-token`,
    {},
    { withCredentials: true },
  );
  const token = res.data.data.token;
  setToken(token);
  return token;
}

// --- Response: pass success through; refresh-and-retry on 401. ----------------
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';
    const isAuthCall =
      url.includes('/auth/login') || url.includes('/auth/refresh-token');

    if (status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newToken = await refreshPromise;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        clearToken();
        redirectToLogin();
        return Promise.reject(toApiError(refreshErr));
      }
    }

    return Promise.reject(toApiError(error));
  },
);

// --- Typed request helpers that unwrap the success envelope. ------------------
export async function apiGet<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await api.get<ApiEnvelope<T>>(url, config);
  return res.data.data;
}

export async function apiGetList<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<{ data: T; meta?: Meta }> {
  const res = await api.get<ApiEnvelope<T>>(url, config);
  return { data: res.data.data, meta: res.data.meta };
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await api.post<ApiEnvelope<T>>(url, body, config);
  return res.data.data;
}

export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await api.patch<ApiEnvelope<T>>(url, body, config);
  return res.data.data;
}

export async function apiDelete<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await api.delete<ApiEnvelope<T>>(url, config);
  return res.data.data;
}
