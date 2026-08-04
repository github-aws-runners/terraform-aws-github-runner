import type { RunnerProvider } from '@aws-github-runner/runner-provider';

export interface RunnerList {
  id: string;
  launchTime?: Date;
  owner?: string;
  type?: string;
  repo?: string;
  org?: string;
  orphan?: boolean;
  githubRunnerId?: string;
  bypassRemoval?: boolean;
}

export interface RunnerInfo extends RunnerList {
  owner: string;
  type: string;
}

export interface ScaleDownRunnerProvider extends RunnerProvider {
  list(environment: string, orphan?: boolean): Promise<RunnerList[]>;
  bootTimeExceeded(runner: RunnerInfo): boolean;
  markOrphan(id: string): Promise<void>;
  unmarkOrphan(id: string): Promise<void>;
  terminate(id: string): Promise<void>;
  // Dispose of an idle runner after it has been de-registered from GitHub. Providers may reclaim the
  // instance instead of terminating it (e.g. the EC2 provider stops it into the warm pool). Defaults
  // to terminate semantics when not implemented.
  retire?(runner: RunnerInfo): Promise<void>;
  // Optional post-scale-down maintenance hook (e.g. evict stale warm-pool instances).
  maintain?(environment: string): Promise<void>;
}
