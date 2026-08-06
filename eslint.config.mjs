import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';

const webSourceFiles = ['apps/web/**/*.{js,jsx,ts,tsx}'];
const webTypeScriptFiles = ['apps/web/**/*.{ts,tsx}'];

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/coverage/**',
    'apps/api/src/generated/**',
  ]),
  eslint.configs.recommended,
  ...typescriptEslint.configs.recommended,
  {
    files: ['apps/api/**/*.ts', 'apps/api/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['performance/r10/**/*.js'],
    languageOptions: {
      globals: {
        __ENV: 'readonly',
        __VU: 'readonly',
        __ITER: 'readonly',
      },
    },
  },
  ...nextVitals.map((config) => ({
    ...config,
    files: webSourceFiles,
  })),
  ...nextTypescript.map((config) => ({
    ...config,
    files: webTypeScriptFiles,
  })),
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx', 'apps/web/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
    settings: {
      next: {
        rootDir: 'apps/web',
      },
      react: {
        version: '19.2',
      },
    },
  },
]);
