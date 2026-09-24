import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

export default defineConfig([
  ...expoConfig,
  {
    ignores: ['coverage/**', 'node_modules/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'BinaryExpression[operator=/[*/]/] > Identifier[name=/amount|minor|target|actual|spend|income/i]',
          message:
            'Money arithmetic must use integer-safe domain helpers, not direct multiplication or division.',
        },
      ],
    },
  },
]);
