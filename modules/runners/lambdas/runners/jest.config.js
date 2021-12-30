module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{ts,js,jsx}', '!src/**/*local*.ts', 'src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 92,
      functions: 92,
      lines: 92,
      statements: 92,
    },
  },
};
