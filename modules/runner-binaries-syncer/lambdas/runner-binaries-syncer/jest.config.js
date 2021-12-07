module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{ts,js,jsx}', '!src/**/*local*.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 60,
      lines: 80,
      statements: 80
    }
  }
};
