export type Ec2RunnerFailureCode =
  | `aws-name:${string}`
  | `aws-code:${string}`
  | `aws-fault:${'client' | 'server'}`
  | `aws-http:${number}`;

export interface Ec2RunnerCreateResult {
  instances: string[];
  failedInstanceCount: number;
  failureCodes: Ec2RunnerFailureCode[];
}
