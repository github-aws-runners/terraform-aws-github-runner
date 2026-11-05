import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// The SDK registers service exceptions in a TypeRegistry owned by @smithy/core and looks them up from @aws-sdk/core.
// With two installed copies the lookup misses, so errors reach the lambdas as a plain Error without their name.
const SINGLE_INSTANCE_PACKAGES = ['@smithy/core', '@aws-sdk/core'];
const TRACKED_SCOPES = /^(@aws-sdk|@smithy|@aws-lambda-powertools)\//;
const LAMBDAS_ROOT = resolve(__dirname, '../../..');
const WORKSPACE_FOLDERS = ['functions', 'libs', 'services'];

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
}

function readPackageJson(directory: string): PackageJson {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as PackageJson;
}

// Mirrors Node resolution: the nearest node_modules folder up the tree wins, so a nested copy shadows the hoisted one.
function findInstalled(name: string, fromDirectory: string): string | undefined {
  for (let directory = fromDirectory; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(directory) === directory) return undefined;
  }
}

function trackedDependencies(directory: string): string[] {
  return Object.keys(readPackageJson(directory).dependencies ?? {}).filter((name) => TRACKED_SCOPES.test(name));
}

function workspaceDirectories(): string[] {
  return WORKSPACE_FOLDERS.flatMap((folder) =>
    readdirSync(join(LAMBDAS_ROOT, folder), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(LAMBDAS_ROOT, folder, entry.name, 'package.json')))
      .map((entry) => join(LAMBDAS_ROOT, folder, entry.name)),
  );
}

function collectInstalledCopies(): { visited: Set<string>; copies: Map<string, Set<string>> } {
  const visited = new Set<string>();
  const copies = new Map(SINGLE_INSTANCE_PACKAGES.map((name) => [name, new Set<string>()]));
  const queue = workspaceDirectories().flatMap((workspace) =>
    trackedDependencies(workspace).flatMap((name) => findInstalled(name, workspace) ?? []),
  );

  for (let directory = queue.pop(); directory !== undefined; directory = queue.pop()) {
    if (visited.has(directory)) continue;
    visited.add(directory);
    copies.get(readPackageJson(directory).name)?.add(directory);
    for (const name of trackedDependencies(directory)) {
      const installed = findInstalled(name, directory);
      if (installed) queue.push(installed);
    }
  }

  return { visited, copies };
}

describe('AWS SDK dependency tree', () => {
  const { visited, copies } = collectInstalledCopies();

  it('is walked far enough to cover the AWS clients used by the lambdas', () => {
    expect(visited.size).toBeGreaterThan(20);
  });

  it.each(SINGLE_INSTANCE_PACKAGES)('resolves a single installed copy of %s for every AWS client', (name) => {
    const installedAt = [...(copies.get(name) ?? [])].map((directory) => relative(LAMBDAS_ROOT, directory));

    expect(installedAt, `${name} is installed more than once: ${installedAt.join(', ')}`).toHaveLength(1);
  });
});
