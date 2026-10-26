import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['tests/fixtures/**/*.js', 'tests/fixtures/.harness/**', 'dist/**', 'xcode/**', 'release/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { console: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.name='eval']", message: 'No se permite eval (sin código remoto/dinámico).' },
        { selector: "NewExpression[callee.name='Function']", message: 'No se permite new Function.' },
      ],
    },
  },
  {
    // Los módulos compartidos no deben usar APIs de extensión ni de un navegador concreto.
    files: ['src/core/**/*.ts', 'src/utils/**/*.ts', 'src/shared/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', { name: 'chrome', message: 'Usa el adaptador de navegador.' }, { name: 'browser', message: 'Usa el adaptador de navegador.' }],
    },
  },
);
