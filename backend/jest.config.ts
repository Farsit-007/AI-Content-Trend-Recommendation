import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/support/loadTestEnv.ts'],
  // A local `npm run build` leaves compiled copies of every module in dist/, which jest's haste map
  // then sees as duplicate manual mocks ("please delete one of them") — noise at best, and the wrong
  // module at worst. CI never has a dist/, so this only affects developer machines.
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  // Swaps every `import Redis from 'ioredis'` (e.g. app/lib/redis.ts) for ioredis-mock, so no
  // test run ever attempts a real Redis connection. See support/redisMock.ts.
  moduleNameMapper: {
    '^ioredis$': 'ioredis-mock',
  },
  clearMocks: true,
  testTimeout: 30000,
};

export default config;
