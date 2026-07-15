/** Pagination metadata returned by list endpoints. */
export interface Meta {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
}

/** Standard backend success envelope: `{ success, message, meta?, data }`. */
export interface ApiEnvelope<T> {
  success: true;
  message: string;
  meta?: Meta;
  data: T;
}

/** One field-level error entry from the backend error envelope. */
export interface ApiErrorSource {
  path: string | number;
  message: string;
}

/**
 * Normalized error thrown by the API client for any non-2xx response (or
 * network failure). Feature code catches this and shows `message`.
 */
export class ApiError extends Error {
  status: number;
  errorSource: ApiErrorSource[];

  constructor(
    message: string,
    status: number,
    errorSource: ApiErrorSource[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorSource = errorSource;
  }
}

/** Authenticated user shape returned by /auth/login and /auth/me. */
export interface AuthUser {
  _id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'user';
  team_ids?: string[];
  created_at?: string;
}

/** Payload returned by /auth/login and /auth/refresh-token. */
export interface AuthTokens {
  token: string;
  refresh_token?: string;
  user: AuthUser;
}
