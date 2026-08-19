import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Separate from vite.config.ts rather than a `test` block inside it: the build config is what ships,
 * and keeping test-only settings out of it means `npm run build` can never be affected by them.
 * The app config is merged in so the `@/` alias and the React plugin stay in one place.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      restoreMocks: true,
    },
  }),
);
