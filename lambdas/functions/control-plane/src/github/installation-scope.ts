export function installationScope(endpoint: string, owner: string): string {
  return JSON.stringify([endpoint.toLowerCase().replace(/\/$/, ''), owner.split('/')[0].toLowerCase()]);
}
