import { consoleLogger } from './contracts';
import { main } from './server';

void main().catch(() => {
  consoleLogger.error('Lambda MicroVM lifecycle hook server failed to start');
  process.exitCode = 1;
});
