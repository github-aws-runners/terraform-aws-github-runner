import { describe, expect, it } from 'vitest';

import { InvalidGitHubConfigUrlError, parseGitHubConfigUrl } from './config';

describe('GitHub configuration URL parsing', () => {
  it('requires HTTPS for GitHub.com and GHES configuration URLs', () => {
    expect(() => parseGitHubConfigUrl('http://github.com/example')).toThrow(InvalidGitHubConfigUrlError);
    expect(() => parseGitHubConfigUrl('http://github.example.com/example', true)).toThrow(/should be HTTPS/);
  });

  it('continues to accept an HTTPS GitHub configuration URL', () => {
    expect(parseGitHubConfigUrl('https://github.com/example')).toMatchObject({
      scope: 'organization',
      organization: 'example',
      isHosted: true,
    });
  });
});
