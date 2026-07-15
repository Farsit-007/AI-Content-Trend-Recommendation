import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/types';

/**
 * App-wide TanStack Query client. Retries are disabled for 4xx responses (client
 * errors won't succeed on retry); other failures retry twice.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
