import { hideUrlPassword } from './url';

describe('Test URL proxy validation', () => {
  test('URL credentials port 80', async () => {
    const url = hideUrlPassword('http://foo:bar@proxy.company.com:80');
    expect(url).toBe('http://foo:*****@proxy.company.com/');
  });
  test('URL port 8080', async () => {
    const url = hideUrlPassword('http://proxy.company.com:8080');
    expect(url).toBe('http://proxy.company.com:8080/');
  });
});
