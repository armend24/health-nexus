/** Jest config for Vite + React + TS. Uses CommonJS so it works with "type": "module". */
module.exports = {
  testEnvironment: '<rootDir>/jest-env-jsdom-with-globals.cjs',
  // Treat TS/TSX as ESM so `import.meta.env` parses correctly.
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|sass|scss)$': '<rootDir>/src/__mocks__/styleMock.cjs',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { useESM: true }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/routeTree.gen.ts',
  ],
};
