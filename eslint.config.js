import eslint from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tsEslint from 'typescript-eslint';

export default tsEslint.config(
  eslint.configs.recommended,
  ...tsEslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2024,
      globals: {
        ...globals.browser,
        ...globals.mocha,
        ...globals.node,
        globalThis: true,
        URLPattern: true,
      },
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-nocheck': 'allow-with-description',
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'none',
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          vars: 'all',
        },
      ],
      'prefer-const': ['error', { destructuring: 'all' }],
      'sort-imports': [
        'warn',
        {
          ignoreCase: true,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],
    },
  },
  // NOTE: this needs to be a separate object to trigger "global" ignore
  {
    ignores: ['**/.*', '**/test/**/fixtures'],
  },
);
