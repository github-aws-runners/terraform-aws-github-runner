export interface EventWrapper<T> {
  version: string;
  id: string;
  'detail-type': 'workflow_job';
  source: string;
  account: string;
  time: Date;
  region: string;
  resources: string[];
  detail: T;
}
