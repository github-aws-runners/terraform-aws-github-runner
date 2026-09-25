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

  it('normalizes long slash sequences', () => {
    const slashSequence = '/'.repeat(10_000);

    expect(parseGitHubConfigUrl(`https://github.com${slashSequence}example${slashSequence}`)).toMatchObject({
      configUrl: new URL('https://github.com/example'),
      scope: 'organization',
      organization: 'example',
      isHosted: true,
    });
  });

  it.each(['https://github.com////', 'https://github.com/org//repository', 'https://github.com/org/repository/extra'])(
    'continues to reject an invalid path after slash normalization: %s',
    (configUrl) => {
      expect(() => parseGitHubConfigUrl(configUrl)).toThrow(InvalidGitHubConfigUrlError);
    },
  );

  it.each([
    ['https://github.com/org/repository////', 'repository'],
    ['https://github.com/enterprises/example////', 'enterprise'],
  ])('retains the scope when normalizing %s', (configUrl, scope) => {
    expect(parseGitHubConfigUrl(configUrl)).toMatchObject({ scope });
  });
});
