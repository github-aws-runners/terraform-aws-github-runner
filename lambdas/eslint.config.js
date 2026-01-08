// @ts-check

// Import required modules using CommonJS require syntax
const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');
const path = require('path');

// Setup FlatCompat for backward compatibility with .eslintrc.* format
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

// Create the ESLint 9.x flat config
module.exports = [
  js.configs.recommended,
  ...compat.extends(
    'plugin:@typescript-eslint/recommended'
  ),
  {
    // Global linting settings
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      'prettier': require('eslint-plugin-prettier'),
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
  {
    // Files to ignore
    ignores: ['**/node_modules/**', '**/dist/**', '**/.nx/**', '**/coverage/**'],
  },
];

