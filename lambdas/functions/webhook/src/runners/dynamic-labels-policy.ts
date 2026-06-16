export interface Ec2DynamicLabelsValueRule {
  allowed?: string[];
  denied?: string[];
  max?: number | string;
}

/**
 * EC2 dynamic labels policy schema. `blocked_keys` rejects keys outright;
 * `restricted_keys` applies optional per-key value rules. Keys use the
 * `<key>` segment of a `ghr-ec2-<key>:<value>` label in the same hyphenated
 * form as the labels themselves (e.g. `instance-type`).
 */
export interface Ec2DynamicLabelsPolicy {
  blocked_keys?: string[];
  restricted_keys?: Record<string, Ec2DynamicLabelsValueRule>;
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${pattern}$`);
}

function matchesAny(value: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => globToRegExp(p).test(value));
}

function evaluateLabel(label: string, policy: Ec2DynamicLabelsPolicy): string | null {
  const stripped = label.replace(/^ghr-ec2-/, '');
  const colonIdx = stripped.indexOf(':');
  const key = colonIdx === -1 ? stripped : stripped.slice(0, colonIdx);
  const value = colonIdx === -1 ? undefined : stripped.slice(colonIdx + 1);

  if (policy.blocked_keys?.includes(key)) {
    return `key '${key}' is in blocked_keys`;
  }

  const rule = policy.restricted_keys?.[key];
  if (!rule) return null;
  if (value === undefined) return null;

  if (rule.allowed && rule.allowed.length > 0 && !matchesAny(value, rule.allowed)) {
    return `value '${value}' not in allowed list`;
  }
  if (rule.denied && matchesAny(value, rule.denied)) {
    return `value '${value}' in denied list`;
  }
  if (rule.max !== undefined && rule.max !== null) {
    const valueNum = Number(value);
    const maxNum = Number(rule.max);
    if (!Number.isFinite(valueNum) || !Number.isFinite(maxNum)) {
      return `max set but value '${value}' or max '${rule.max}' is not numeric`;
    }
    if (valueNum > maxNum) {
      return `value '${value}' exceeds max '${rule.max}'`;
    }
  }
  return null;
}

/**
 * Inspects the labels and returns the rejection reasons for any `ghr-ec2-*`
 * label that violates the policy. Non-`ghr-ec2-*` labels are ignored.
 */
export function violationsAgainstPolicy(
  labels: string[],
  policy: Ec2DynamicLabelsPolicy | null | undefined,
): { label: string; reason: string }[] {
  if (!policy) return [];
  const violations: { label: string; reason: string }[] = [];
  for (const label of labels) {
    if (!label.startsWith('ghr-ec2-')) continue;
    const reason = evaluateLabel(label, policy);
    if (reason) violations.push({ label, reason });
  }
  return violations;
}
