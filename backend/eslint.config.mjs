import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/__tests__/**/*.ts", "**/__mocks__/**/*.ts"],
    languageOptions: { globals: globals.jest },
  },
  tseslint.configs.recommended,
  {
    ignores: ['node_modules', 'dist'],
    rules: {
      'no-unused-expressions': 'error',
      'prefer-const': 'error',
      'no-console': 'warn',
    },
  },
  {
    // TypeScript-specific rule setup, per typescript-eslint's own guidance. The base `no-unused-vars`
    // and `no-undef` rules were previously enabled here alongside their TS-aware equivalents, which
    // caused two distinct problems:
    //
    //  - Every unused variable was reported twice, once by each rule.
    //  - The base rules don't understand TypeScript. `no-unused-vars` flags parameter *names inside a
    //    type signature* (`fn: (item: T) => Promise<R>` — there is no `item` binding to be unused),
    //    and `no-undef` flags built-in TS/DOM types like `RequestInit` as undefined globals.
    //
    // `no-undef` is off entirely for TS: the compiler already does that check, and does it correctly.
    files: ["**/*.{ts,mts,cts}"],
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          // `_`-prefixed names are the conventional "deliberately unused" marker — needed for
          // positional params that must exist to reach a later one, and for the
          // `const { embedding, ...rest }` omit idiom.
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);
