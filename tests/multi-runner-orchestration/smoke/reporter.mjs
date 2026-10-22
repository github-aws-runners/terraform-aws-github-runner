export default async function* smokeReporter(events) {
  for await (const event of events) {
    const { name, details, error } = event.data ?? {};
    if (details?.type !== 'test') continue;

    if (event.type === 'test:pass') {
      yield `PASS ${name}\n`;
    } else if (event.type === 'test:fail') {
      yield `FAIL ${name}\n`;
      if (error?.message) {
        yield `  ${error.message.split('\n').join('\n  ')}\n`;
      }
    }
  }
}
