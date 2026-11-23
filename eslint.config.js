import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'coverage/', 'reports/', 'evidence/', '.lab-local/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { globals: globals.node },
  },
];
