import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/support/loadTestEnv.ts'],
  // Swaps every `import Redis from 'ioredis'` (e.g. app/lib/redis.ts) for ioredis-mock, so no
  // test run ever attempts a real Redis connection. See support/redisMock.ts.
  moduleNameMapper: {
    '^ioredis$': 'ioredis-mock',
  },
  clearMocks: true,
  testTimeout: 30000,
};

export default config;
