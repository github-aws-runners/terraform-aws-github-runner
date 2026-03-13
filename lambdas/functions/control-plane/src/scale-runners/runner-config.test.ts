import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveRunnerType } from './runner-config';

describe('resolveRunnerType', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RUNNER_REGISTRATION_LEVEL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return Enterprise when RUNNER_REGISTRATION_LEVEL is enterprise', () => {
    process.env.RUNNER_REGISTRATION_LEVEL = 'enterprise';
    expect(resolveRunnerType()).toBe('Enterprise');
  });

  it('should return Org when RUNNER_REGISTRATION_LEVEL is org', () => {
    process.env.RUNNER_REGISTRATION_LEVEL = 'org';
    expect(resolveRunnerType()).toBe('Org');
  });

  it('should return Repo when RUNNER_REGISTRATION_LEVEL is repo', () => {
    process.env.RUNNER_REGISTRATION_LEVEL = 'repo';
    expect(resolveRunnerType()).toBe('Repo');
  });

  it('should throw for invalid RUNNER_REGISTRATION_LEVEL', () => {
    process.env.RUNNER_REGISTRATION_LEVEL = 'invalid';
    expect(() => resolveRunnerType()).toThrow('Invalid RUNNER_REGISTRATION_LEVEL');
  });

  it('should default to Repo when RUNNER_REGISTRATION_LEVEL is not set', () => {
    expect(resolveRunnerType()).toBe('Repo');
  });

  it('should default to Repo when RUNNER_REGISTRATION_LEVEL is empty', () => {
    process.env.RUNNER_REGISTRATION_LEVEL = '';
    expect(resolveRunnerType()).toBe('Repo');
  });
});
