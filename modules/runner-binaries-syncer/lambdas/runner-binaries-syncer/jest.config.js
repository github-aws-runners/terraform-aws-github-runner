module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{ts,js,jsx}', '!src/**/*local*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 78,
      lines: 93,
      statements: 93
    }
  }
};
