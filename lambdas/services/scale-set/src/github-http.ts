import { Agent, type Dispatcher } from 'undici';

import type { ScaleSetFetch } from '@aws-github-runner/github-actions-scale-set';

type DispatcherRequestInit = RequestInit & { dispatcher: Dispatcher };

export interface ScaleSetGitHubHttp {
  fetch(sslVerify: boolean): ScaleSetFetch;
  close(): Promise<void>;
}

/**
 * Creates fetch implementations whose TLS policy is scoped to one controller
 * process. Disabling verification never mutates NODE_TLS_REJECT_UNAUTHORIZED
 * or the global Undici dispatcher, so verified and unverified GHES runner
 * configurations may safely share one grouped task.
 */
export function createScaleSetGitHubHttp(fetchImplementation: ScaleSetFetch = globalThis.fetch): ScaleSetGitHubHttp {
  let insecureAgent: Agent | undefined;
  let insecureFetch: ScaleSetFetch | undefined;

  return {
    fetch(sslVerify) {
      if (sslVerify) return fetchImplementation;
      insecureAgent ??= new Agent({ connect: { rejectUnauthorized: false } });
      insecureFetch ??= async (input, init = {}) =>
        await fetchImplementation(input, { ...init, dispatcher: insecureAgent } as DispatcherRequestInit);
      return insecureFetch;
    },
    async close() {
      await insecureAgent?.close();
    },
  };
}
