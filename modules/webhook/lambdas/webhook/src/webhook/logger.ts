import { Logger } from 'tslog';

export const logger = new Logger({
  colorizePrettyLogs: false,
  displayInstanceName: false,
  minLevel: process.env.LOG_LEVEL || 'info',
  name: 'webhook',
  overwriteConsole: true,
  type: process.env.LOG_TYPE || 'pretty',
});

export class LogFields {
  static fields: { [key: string]: string } = {};

  public static print(): string {
    return JSON.stringify(LogFields.fields);
  }
}
