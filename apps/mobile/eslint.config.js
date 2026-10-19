// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Screens and components get data through src/hooks, so mock data can be swapped for the API in one place.
    files: ['src/app/**', 'src/components/**'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/mocks/*', '**/mocks/*'], message: 'Read data through a hook in src/hooks instead.' }] }],
    },
  },
]);
