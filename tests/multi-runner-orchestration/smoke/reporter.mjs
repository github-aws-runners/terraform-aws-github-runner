function formatFailure(error) {
  if (!error) return 'No error details in test event';

  const messages = [];
  const visited = new Set();
  for (let current = error; current && !visited.has(current); current = current.cause) {
    visited.add(current);
    messages.push(current.stack ?? current.message ?? String(current));
  }
  return messages.join('\nCaused by: ');
}

export default async function* smokeReporter(events) {
  for await (const event of events) {
    const { name, details } = event.data ?? {};
    const error = details?.error ?? event.data?.error;
    const failureText = formatFailure(error);
    if (details?.type !== 'test') continue;

    if (event.type === 'test:pass') {
      yield `PASS ${name}\n`;
    } else if (event.type === 'test:fail') {
      yield `FAIL ${name}\n`;
      yield `  ${failureText.split('\n').join('\n  ')}\n`;
    }
  }
}
