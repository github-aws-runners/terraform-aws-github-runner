export const GITHUB_SCOPES = {
  enterprise: 'enterprise',
  organization: 'organization',
  repository: 'repository',
} as const;

export type GitHubScope = (typeof GITHUB_SCOPES)[keyof typeof GITHUB_SCOPES];

export interface ParsedGitHubConfig {
  configUrl: URL;
  scope: GitHubScope;
  enterprise?: string;
  organization?: string;
  repository?: string;
  isHosted: boolean;
}

export class InvalidGitHubConfigUrlError extends Error {
  constructor(configUrl: string, options?: ErrorOptions) {
    super(
      `${JSON.stringify(configUrl)}: invalid config URL, should be HTTPS and point to an enterprise, org, or repository`,
      options,
    );
    this.name = 'InvalidGitHubConfigUrlError';
  }
}

function environmentForcesGhes(): boolean {
  return (
    typeof process !== 'undefined' && Object.prototype.hasOwnProperty.call(process.env, 'GITHUB_ACTIONS_FORCE_GHES')
  );
}

function isHostedGitHubUrl(configUrl: URL, forceGhes?: boolean): boolean {
  if (forceGhes ?? environmentForcesGhes()) {
    return false;
  }

  const host = configUrl.host.toLowerCase();
  return host === 'github.com' || host === 'www.github.com' || host === 'github.localhost' || host.endsWith('.ghe.com');
}

/** Parse a repository, organization, or enterprise registration URL. */
export function parseGitHubConfigUrl(configUrl: string, forceGhes?: boolean): ParsedGitHubConfig {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configUrl.trim().replace(/\/+$/, ''));
  } catch (error) {
    throw new InvalidGitHubConfigUrlError(configUrl, { cause: error });
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new InvalidGitHubConfigUrlError(configUrl);
  }

  const pathParts = parsedUrl.pathname.replace(/^\/+|\/+$/g, '').split('/');
  const isHosted = isHostedGitHubUrl(parsedUrl, forceGhes);

  if (pathParts.length === 1 && pathParts[0] !== '') {
    parsedUrl.pathname = `/${pathParts[0]}`;
    return {
      configUrl: parsedUrl,
      scope: GITHUB_SCOPES.organization,
      organization: pathParts[0],
      isHosted,
    };
  }

  if (pathParts.length === 2 && pathParts.every((part) => part !== '')) {
    parsedUrl.pathname = `/${pathParts.join('/')}`;
    if (pathParts[0].toLowerCase() === 'enterprises') {
      return {
        configUrl: parsedUrl,
        scope: GITHUB_SCOPES.enterprise,
        enterprise: pathParts[1],
        isHosted,
      };
    }

    return {
      configUrl: parsedUrl,
      scope: GITHUB_SCOPES.repository,
      organization: pathParts[0],
      repository: pathParts[1],
      isHosted,
    };
  }

  throw new InvalidGitHubConfigUrlError(configUrl);
}

/** Build a GitHub REST API URL for GitHub.com, ghe.com, or GHES. */
export function githubApiUrl(config: ParsedGitHubConfig, path: string): URL {
  const result = new URL(config.configUrl.origin);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (config.isHosted) {
    result.host =
      config.configUrl.host.toLowerCase() === 'www.github.com' ? 'api.github.com' : `api.${config.configUrl.host}`;
    result.pathname = normalizedPath;
    return result;
  }

  result.pathname = `/api/v3${normalizedPath}`;
  return result;
}

export function runnerRegistrationTokenPath(config: ParsedGitHubConfig): string {
  switch (config.scope) {
    case GITHUB_SCOPES.organization:
      return `/orgs/${config.organization}/actions/runners/registration-token`;
    case GITHUB_SCOPES.enterprise:
      return `/enterprises/${config.enterprise}/actions/runners/registration-token`;
    case GITHUB_SCOPES.repository:
      return `/repos/${config.organization}/${config.repository}/actions/runners/registration-token`;
  }
}
