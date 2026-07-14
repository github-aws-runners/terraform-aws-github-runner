import type { RunnerProvider } from '../runner-provider';

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
}
