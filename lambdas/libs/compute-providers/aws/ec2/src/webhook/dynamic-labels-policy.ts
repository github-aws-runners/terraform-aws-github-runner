import type { AwsDynamicLabelsPolicy, AwsDynamicLabelsValueRule } from '../../../../contracts';
import { violationsAgainstAwsDynamicLabelsPolicy } from '../../../dynamic-labels-policy';

export type Ec2DynamicLabelsValueRule = AwsDynamicLabelsValueRule;

/**
 * EC2 dynamic labels policy schema. `blocked_keys` rejects keys outright;
 * `restricted_keys` applies optional per-key value rules. Keys use the
 * `<key>` segment of a `ghr-ec2-<key>:<value>` label in the same hyphenated
 * form as the labels themselves (e.g. `instance-type`).
 */
export type Ec2DynamicLabelsPolicy = AwsDynamicLabelsPolicy;

/**
 * Inspects the labels and returns the rejection reasons for any `ghr-ec2-*`
 * label that violates the policy. Non-`ghr-ec2-*` labels are ignored.
 */
export function violationsAgainstPolicy(
  labels: string[],
  policy: Ec2DynamicLabelsPolicy | null | undefined,
): { label: string; reason: string }[] {
  return violationsAgainstAwsDynamicLabelsPolicy(labels, policy, 'ghr-ec2-');
}
