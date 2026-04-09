import { RunnerType } from '../aws/runners.d';

/**
 * Resolves the RunnerType from the RUNNER_REGISTRATION_LEVEL environment variable.
 *
 * Valid values: 'enterprise' | 'org' | 'repo'.
 * Defaults to 'Repo' when not set.
 */
export function resolveRunnerType(): RunnerType {
  const registrationLevel = process.env.RUNNER_REGISTRATION_LEVEL;
  if (registrationLevel) {
    switch (registrationLevel) {
      case 'enterprise':
        return 'Enterprise';
      case 'org':
        return 'Org';
      case 'repo':
        return 'Repo';
      default:
        throw new Error(
          `Invalid RUNNER_REGISTRATION_LEVEL: '${registrationLevel}'. Must be 'enterprise', 'org', or 'repo'.`,
        );
    }
  }
  return 'Repo';
}
