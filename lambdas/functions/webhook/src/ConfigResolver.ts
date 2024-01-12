import { QueueConfig } from './sqs';

export class Config {
  public repositoryAllowList: Array<string>;
  public queuesConfig: Array<QueueConfig>;
  public workflowJobEventSecondaryQueue;

  constructor() {
    const repositoryAllowListEnv = process.env.REPOSITORY_ALLOW_LIST || '[]';
    this.repositoryAllowList = JSON.parse(repositoryAllowListEnv) as Array<string>;
    const queuesConfigEnv = process.env.RUNNER_CONFIG || '[]';
    this.queuesConfig = JSON.parse(queuesConfigEnv) as Array<QueueConfig>;
    this.workflowJobEventSecondaryQueue = process.env.SQS_WORKFLOW_JOB_QUEUE || undefined;
  }
}
