import type {
  CreateRunnerResult,
  CreateScaleUpRunnersInput,
  CreateStartRunnerConfig,
  CurrentRunnersInput,
  RunnerLabelResolution,
  ScaleUpComputeProvider,
} from '../../../../core';
import type { MicrovmDynamicLabelOverrides } from '../dynamic-labels';
import { parseMicrovmDynamicLabels } from '../dynamic-labels';
import { listMicrovmRunners } from './microvms';
import { createMicrovmRunners } from './runner-config';

interface MicrovmScaleUpState {
  overrides: MicrovmDynamicLabelOverrides;
}

async function resolveMicrovmLabelsForRunners(
  messageLabels: string[],
): Promise<RunnerLabelResolution<MicrovmScaleUpState>> {
  const trimmedLabels = messageLabels.map((label) => label.trim());
  const parsed = parseMicrovmDynamicLabels(trimmedLabels);
  if (parsed.violations.length > 0) {
    throw new Error(
      `Invalid MicroVM dynamic labels: ${parsed.violations
        .map((violation) => `${violation.label} (${violation.reason})`)
        .join(', ')}`,
    );
  }

  return {
    runnerLabels: trimmedLabels.filter((label) => label.startsWith('ghr-')),
    state: { overrides: parsed.overrides },
  };
}

async function getCurrentMicrovmRunners(
  _state: MicrovmScaleUpState,
  { runnerType, runnerOwner }: CurrentRunnersInput,
): Promise<number> {
  return (
    await listMicrovmRunners({
      environment: process.env.ENVIRONMENT,
      runnerType,
      runnerOwner,
    })
  ).length;
}

async function createMicrovmScaleUpRunners(
  {
    githubRunnerConfig,
    numberOfRunners,
    githubInstallationClient,
    state,
  }: CreateScaleUpRunnersInput<MicrovmScaleUpState>,
  createStartRunnerConfig: CreateStartRunnerConfig,
): Promise<CreateRunnerResult> {
  return await createMicrovmRunners(
    githubRunnerConfig,
    numberOfRunners,
    githubInstallationClient,
    createStartRunnerConfig,
    'scale-up-lambda',
    state.overrides,
  );
}

export function createMicrovmScaleUpProvider(
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<ScaleUpComputeProvider<MicrovmScaleUpState>, 'type'> {
  return {
    resolveLabelsForRunners: resolveMicrovmLabelsForRunners,
    getCurrentRunners: getCurrentMicrovmRunners,
    createRunners: (input) => createMicrovmScaleUpRunners(input, createStartRunnerConfig),
  };
}
