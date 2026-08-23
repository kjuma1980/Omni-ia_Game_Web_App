/**
 * Pruebas de extremo a extremo. Levantan la aplicacion Nest completa contra la
 * base de datos local Creador_2d y se ejecutan en serie (--runInBand) porque
 * comparten esa base.
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 60000,
};
