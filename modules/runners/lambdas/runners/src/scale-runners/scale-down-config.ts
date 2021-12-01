import parser from 'cron-parser';
import moment from 'moment';

export type ScalingDownConfigList = ScalingDownConfig[];
export interface ScalingDownConfig {
  cron: string;
  idleCount: number;
  timeZone: string;
}

function inPeriod(period: ScalingDownConfig): boolean {
  const now = moment(new Date());
  const expr = parser.parseExpression(period.cron, {
    tz: period.timeZone,
  });
  const next = moment(expr.next().toDate());
  return Math.abs(next.diff(now, 'seconds')) < 5; // we keep a range of 5 seconds
}

export function getIdleRunnerCount(scalingDownConfigs: ScalingDownConfigList): number {
  for (const scalingDownConfig of scalingDownConfigs) {
    if (inPeriod(scalingDownConfig)) {
      return scalingDownConfig.idleCount;
    }
  }
  return 0;
}
