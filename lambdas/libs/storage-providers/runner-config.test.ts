import { describe, expect, it, vi } from 'vitest';

import { createAwsSsmRunnerConfigStore } from './aws/ssm/runner-config-store';
import { createRunnerConfigStore } from './runner-config';

vi.mock('./aws/ssm/runner-config-store', () => ({
  createAwsSsmRunnerConfigStore: vi.fn(),
}));

describe('runner config store factory', () => {
  it('creates the SSM implementation while the provider seam is being introduced', () => {
    const store = { create: vi.fn() };
    vi.mocked(createAwsSsmRunnerConfigStore).mockReturnValue(store);

    expect(createRunnerConfigStore()).toBe(store);
    expect(createAwsSsmRunnerConfigStore).toHaveBeenCalledOnce();
  });
});
