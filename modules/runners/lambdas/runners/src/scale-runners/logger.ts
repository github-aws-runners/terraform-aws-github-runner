import { Logger, ISettingsParam } from 'tslog';

export const logger = new Logger({
  colorizePrettyLogs: false,
  displayInstanceName: false,
  maskAnyRegEx: ['--token [A-Z0-9]*'],
  minLevel: process.env.LOG_LEVEL || 'info',
  name: 'scale-runners',
  overwriteConsole: true,
  type: process.env.LOG_TYPE || 'pretty',
});

//interface LogFields {
//  [key: string]: string;
//}

export class LogFields {
  static fields: { [key: string]: string } = {};
}

// Should I overload each method...? This would allow for always adding fields

/*export class AwesomeLogger {
  //logger: Logger;
  params: ISettingsParam = {
    colorizePrettyLogs: false,
    displayInstanceName: false,
    maskAnyRegEx: ['--token [A-Z0-9]*'],
    minLevel: process.env.LOG_LEVEL || 'info',
    overwriteConsole: true,
    type: process.env.LOG_TYPE || 'pretty',
  };

  static fields: LogFields = {};

  constructor(name: string) {
    new Logger({ ...this.params, name: name });
  }
}*/
