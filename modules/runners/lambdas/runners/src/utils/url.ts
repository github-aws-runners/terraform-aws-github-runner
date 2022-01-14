export function hideUrlPassword(url: string): string {
  const urlProxy = new URL(url);
  if (urlProxy.password) {
    urlProxy.password = '*****';
  }
  return urlProxy.toString();
}
