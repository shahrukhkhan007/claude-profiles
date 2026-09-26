import js from '@eslint/js';
import react from 'eslint-plugin-react';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'release/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['engine/**/*.js', 'electron/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react },
    languageOptions: {
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react/react-in-jsx-scope': 'error',
      'react/prop-types': 'off',
    },
  },
];
