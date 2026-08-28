import { enabledScaleSetProviders } from './providers.config.scale-set';

export type ScaleSetRunnerStatus = 'online' | 'offline' | 'unknown';
export type ScaleSetRunnerLifecycle = 'started' | 'completed' | 'unknown';

/**
 * Controller-observed GitHub state for one runner.
 *
 * The compute provider treats missing, duplicate, or unrecognized state as
 * unknown. Callers must not infer `busy: false` when GitHub did not provide a
 * busy state.
 */
export interface ScaleSetRunnerState {
  runnerId: number;
  runnerName: string;
  scaleSetId: number;
  status: ScaleSetRunnerStatus;
  busy: boolean | undefined;
  lifecycle: ScaleSetRunnerLifecycle;
}

export interface GenerateScaleSetJitConfigurationInput {
  runnerName: string;
  signal?: AbortSignal;
}

export interface GenerateScaleSetJitConfigurationResult {
  encodedJitConfiguration: string;
  runnerId: number;
  runnerName: string;
  scaleSetId: number;
}

export type GenerateScaleSetJitConfiguration = (
  input: GenerateScaleSetJitConfigurationInput,
) => Promise<GenerateScaleSetJitConfigurationResult>;

export interface RemoveScaleSetRunnerInput {
  runnerId: number;
  runnerName: string;
  scaleSetId: number;
  signal?: AbortSignal;
}

export type ScaleSetRemoveRunnerStatus = 'removed' | 'retained_busy' | 'retained_unknown';

export interface ScaleSetRemoveRunnerResult {
  status: ScaleSetRemoveRunnerStatus;
}

export type RemoveScaleSetRunner = (input: RemoveScaleSetRunnerInput) => Promise<ScaleSetRemoveRunnerResult>;

export interface ScaleSetReconcileRequest {
  desiredRunners: number;
  /** Recovery-only mode never launches capacity; it only removes confirmed idle runners. */
  recoveryOnly?: boolean;
  /** Orchestration-owned handoff window before exact runner inventory is required. */
  bootTimeoutMinutes: number;
  /** True only when runnerStates contains the controller's complete, freshly joined Actions and GitHub inventory. */
  runnerInventoryComplete: boolean;
  runnerStates: readonly ScaleSetRunnerState[];
  signal: AbortSignal;
  generateJitConfiguration: GenerateScaleSetJitConfiguration;
  removeRunner: RemoveScaleSetRunner;
}

export type ScaleSetReconcileStatus = 'converged' | 'retained' | 'error';

export type ScaleSetReconcileOperation =
  | 'validate'
  | 'reconcile'
  | 'list'
  | 'launch'
  | 'generate_jit_configuration'
  | 'publish_jit_configuration'
  | 'remove_runner'
  | 'terminate';

/** Error metadata is deliberately bounded and never contains a JIT configuration or raw upstream error message. */
export interface ScaleSetReconcileError {
  operation: ScaleSetReconcileOperation;
  code: string;
  runnerName?: string;
  resourceId?: string;
}

export interface ScaleSetReconcileActions {
  launched: number;
  terminated: number;
  retainedBusy: number;
  retainedUnknown: number;
}

export interface ScaleSetReconcileResult {
  status: ScaleSetReconcileStatus;
  desiredRunners: number;
  /** Best-known owned capacity after actions completed; the next reconciliation re-observes AWS. */
  currentRunners: number;
  /** The provider retained unknown capacity and needs a controller inventory refresh before retrying scale-down. */
  needsRunnerInventory: boolean;
  actions: ScaleSetReconcileActions;
  errors: readonly ScaleSetReconcileError[];
}

export interface ScaleSetComputeProvider {
  reconcile(request: ScaleSetReconcileRequest): Promise<ScaleSetReconcileResult>;
}

export interface ScaleSetComputeProviderFactoryInput {
  runnerConfigName: string;
  scaleSetId: number;
  /** Canonical GitHub configuration URL used as an immutable provider ownership scope. */
  githubScope: string;
  /** Provider-owned configuration. The selected provider validates it before use. */
  configuration: unknown;
}

export interface ScaleSetComputeProviderCapabilities {
  /** Provider-owned, non-secret task environment. Values are validated and immutable after registration. */
  environmentVariables: Readonly<Record<string, string>>;
  create(input: ScaleSetComputeProviderFactoryInput): ScaleSetComputeProvider;
}

export interface ScaleSetComputeProviderPlugin<TType extends string = string> {
  type: TType;
  capabilities: ScaleSetComputeProviderCapabilities;
}

export interface ScaleSetComputeProviderModule<TType extends string = string> {
  type: TType;
  createPlugin(): ScaleSetComputeProviderPlugin<TType>;
}

const SCALE_SET_ENVIRONMENT_KEY = /^[A-Z][A-Z0-9_]{0,127}$/;
const RESERVED_SCALE_SET_ENVIRONMENT_PREFIXES = ['AWS_', 'ECS_', 'GITHUB_', 'SCALE_SET_', 'NODE_'];
const RESERVED_SCALE_SET_ENVIRONMENT_KEYS = new Set(['PATH', 'HOME', 'HOSTNAME', 'PWD', 'SHLVL']);
const MAX_SCALE_SET_ENVIRONMENT_VARIABLES = 64;
const MAX_SCALE_SET_ENVIRONMENT_VALUE_BYTES = 4096;

export function validateScaleSetProviderEnvironmentVariables(
  value: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Scale-set provider environmentVariables must be an object');
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_SCALE_SET_ENVIRONMENT_VARIABLES) {
    throw new Error(
      `Scale-set provider environmentVariables must contain at most ${MAX_SCALE_SET_ENVIRONMENT_VARIABLES} entries`,
    );
  }

  const normalized = Object.create(null) as Record<string, string>;
  for (const [key, environmentValue] of entries) {
    if (
      !SCALE_SET_ENVIRONMENT_KEY.test(key) ||
      RESERVED_SCALE_SET_ENVIRONMENT_KEYS.has(key) ||
      RESERVED_SCALE_SET_ENVIRONMENT_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      throw new Error(`Scale-set provider environment variable '${key}' is reserved or invalid`);
    }
    if (
      typeof environmentValue !== 'string' ||
      Buffer.byteLength(environmentValue, 'utf8') > MAX_SCALE_SET_ENVIRONMENT_VALUE_BYTES ||
      [...environmentValue].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      })
    ) {
      throw new Error(`Scale-set provider environment variable '${key}' has an invalid value`);
    }
    normalized[key] = environmentValue;
  }
  return Object.freeze(normalized);
}

export function createScaleSetComputeProviderRegistry(
  plugins: readonly ScaleSetComputeProviderPlugin[] = enabledScaleSetProviders.map((provider) =>
    provider.createPlugin(),
  ),
) {
  const pluginsByType = new Map<string, ScaleSetComputeProviderPlugin>();
  const environmentVariablesByType = new Map<string, Readonly<Record<string, string>>>();
  for (const plugin of plugins) {
    if (pluginsByType.has(plugin.type)) {
      throw new Error(`Duplicate scale-set compute provider plugin '${plugin.type}'`);
    }
    pluginsByType.set(plugin.type, plugin);
    environmentVariablesByType.set(
      plugin.type,
      validateScaleSetProviderEnvironmentVariables(plugin.capabilities.environmentVariables),
    );
  }

  function get(type: string): ScaleSetComputeProviderPlugin {
    const plugin = pluginsByType.get(type);
    if (!plugin) throw new Error(`No scale-set compute provider plugin registered for '${type}'`);
    return plugin;
  }

  return {
    create(type: string, input: ScaleSetComputeProviderFactoryInput): ScaleSetComputeProvider {
      return get(type).capabilities.create(input);
    },
    environmentVariables(type: string): Readonly<Record<string, string>> {
      get(type);
      return environmentVariablesByType.get(type)!;
    },
  };
}
