import { Logger } from 'tslog';

export const logger = new Logger({
  colorizePrettyLogs: false,
  displayInstanceName: false,
  maskAnyRegEx: ['--token [A-Z0-9]*'],
  minLevel: process.env.LOG_LEVEL || 'info',
  name: 'scale-up',
  overwriteConsole: true,
  type: process.env.LOG_TYPE || 'pretty',
});
