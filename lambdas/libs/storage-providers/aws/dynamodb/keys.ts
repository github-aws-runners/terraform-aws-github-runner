export const SCOPE_ATTRIBUTE = 'scope';
export const ID_ATTRIBUTE = 'id';
export const VALUE_ATTRIBUTE = 'value';
export const EXPIRES_AT_ATTRIBUTE = 'expires_at';

export const GITHUB_APP_SCOPE = 'global#github-app';
export const GITHUB_WEBHOOK_SCOPE = 'global#webhook';
export const RUNNER_MATCHER_SCOPE = 'global#matcher';

export const GITHUB_APP_CREDENTIALS_ID = 'github-app-credentials';
export const GITHUB_WEBHOOK_SECRET_ID = 'github-webhook-secret';
export const RUNNER_MATCHER_CONFIG_ID = 'runner-matcher-config';
export const RUNNER_BOOTSTRAP_CONFIG_ID = 'runner-config';
export const RUNNER_CONFIG_ID = 'config';

export function runnerBootstrapScope(entryId: string): string {
  return `entry#${entryId}#bootstrap`;
}

export function runnerGroupScope(entryId: string): string {
  return `entry#${entryId}#runner-group`;
}

export function runnerStateScope(entryId: string): string {
  return `entry#${entryId}#runner-state`;
}

export function runnerStateId(runnerId: string): string {
  return `runner#${runnerId}`;
}

export function runnerGroupId(runnerGroupName: string): string {
  return `runner-group#${runnerGroupName}`;
}
