export default async function* smokeReporter(events) {
  for await (const event of events) {
    const { name, details } = event.data ?? {};
    const error = details?.error ?? event.data?.error;
    const failure = error?.cause ?? error;
    const failureText = failure?.stack ?? failure?.message ?? (failure ? String(failure) : 'No error details in test event');
    if (details?.type !== 'test') continue;

    if (event.type === 'test:pass') {
      yield `PASS ${name}\n`;
    } else if (event.type === 'test:fail') {
      yield `FAIL ${name}\n`;
      yield `  ${failureText.split('\n').join('\n  ')}\n`;
    }
  }
}
