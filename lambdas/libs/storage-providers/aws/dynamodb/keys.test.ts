import { describe, expect, it } from 'vitest';

import {
  GITHUB_APP_CREDENTIALS_ID,
  GITHUB_APP_SCOPE,
  GITHUB_WEBHOOK_SCOPE,
  GITHUB_WEBHOOK_SECRET_ID,
  RUNNER_BOOTSTRAP_CONFIG_ID,
  RUNNER_CONFIG_ID,
  RUNNER_MATCHER_CONFIG_ID,
  RUNNER_MATCHER_SCOPE,
  runnerBootstrapScope,
  runnerGroupId,
  runnerGroupScope,
  runnerStateId,
  runnerStateScope,
} from './keys';

describe('aws_dynamodb storage keys', () => {
  it('isolates whole-deployment durable records by capability', () => {
    expect({ scope: GITHUB_APP_SCOPE, id: GITHUB_APP_CREDENTIALS_ID }).toEqual({
      scope: 'global#github-app',
      id: 'github-app-credentials',
    });
    expect({ scope: GITHUB_WEBHOOK_SCOPE, id: GITHUB_WEBHOOK_SECRET_ID }).toEqual({
      scope: 'global#webhook',
      id: 'github-webhook-secret',
    });
    expect({ scope: RUNNER_MATCHER_SCOPE, id: RUNNER_MATCHER_CONFIG_ID }).toEqual({
      scope: 'global#matcher',
      id: 'runner-matcher-config',
    });
  });

  it('isolates entry records by access boundary', () => {
    expect({ scope: runnerBootstrapScope('linux-x64'), id: RUNNER_BOOTSTRAP_CONFIG_ID }).toEqual({
      scope: 'entry#linux-x64#bootstrap',
      id: 'runner-config',
    });
    expect({ scope: runnerGroupScope('linux-x64'), id: runnerGroupId('Default') }).toEqual({
      scope: 'entry#linux-x64#runner-group',
      id: 'runner-group#Default',
    });
    expect(RUNNER_CONFIG_ID).toBe('config');
    expect({ scope: runnerStateScope('linux-x64'), id: runnerStateId('runner-123') }).toEqual({
      scope: 'entry#linux-x64#runner-state',
      id: 'runner#runner-123',
    });
  });
});
