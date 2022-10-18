module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{ts,js,jsx}', '!src/**/*local*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 87,
      functions: 99,
      lines: 99,
      statements: 99
    }
  }
};
