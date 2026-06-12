export interface DynamicLabelsValueRule {
  allowed?: string[];
  denied?: string[];
  max?: number | string;
}

/**
 * Flat policy schema. `allowed_keys` and `denied_keys` are reserved meta-keys;
 * any other entry is a per-key value rule keyed by the `<key>` segment of a
 * `ghr-ec2-<key>:<value>` label. Keys must use the same hyphenated form as
 * the labels themselves (e.g. `instance-type`).
 */
export interface DynamicLabelsPolicy {
  allowed_keys?: string[];
  denied_keys?: string[];
  [key: string]: string[] | DynamicLabelsValueRule | undefined;
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

function evaluateLabel(label: string, policy: DynamicLabelsPolicy): string | null {
  const stripped = label.replace(/^ghr-ec2-/, '');
  const colonIdx = stripped.indexOf(':');
  const key = colonIdx === -1 ? stripped : stripped.slice(0, colonIdx);
  const value = colonIdx === -1 ? undefined : stripped.slice(colonIdx + 1);

  if (policy.denied_keys?.includes(key)) {
    return `key '${key}' is in denied_keys`;
  }
  if (policy.allowed_keys && policy.allowed_keys.length > 0 && !policy.allowed_keys.includes(key)) {
    return `key '${key}' is not in allowed_keys`;
  }

  if (key === 'allowed_keys' || key === 'denied_keys') return null;
  const rule = policy[key];
  if (!rule || Array.isArray(rule)) return null;
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
  policy: DynamicLabelsPolicy | null | undefined,
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
