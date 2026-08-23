// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Configuracion plana de ESLint 9 para el backend del Creador 2D.
 *
 * El objetivo es cazar errores reales (promesas sin await, variables muertas,
 * tipos `any` accidentales), no imponer estilo: el formato lo resuelve el
 * editor y no merece ruido en el linter.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.js', '**/*.mjs', '**/*.cjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Los decoradores de Nest y los tipos de Prisma generan firmas que la
      // regla marca como innecesarias sin serlo.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // La semilla y las pruebas si escriben por consola a proposito.
    files: ['prisma/**/*.ts', 'test/**/*.ts', 'src/**/*.spec.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
