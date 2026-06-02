import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Node 18+ globals not always present in the `globals` node set.
const nodeExtra = {
  fetch: 'readonly',
  AbortSignal: 'readonly',
  setImmediate: 'readonly',
  structuredClone: 'readonly',
};

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'extension-safari/**'] },

  js.configs.recommended,

  // --- Server: Node ESM ----------------------------------------------------
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...nodeExtra },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // --- Client: browser + React ---------------------------------------------
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // --- Tests (server + client) add Node + Vitest globals -------------------
  {
    files: ['**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node, ...nodeExtra, vi: 'readonly' },
    },
  },

  // --- Config / tooling files ----------------------------------------------
  {
    files: ['**/*.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
