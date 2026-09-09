import type { AwsDynamicLabelsPolicy } from '../contracts';

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${pattern}$`);
}

function matchesAny(value: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => globToRegExp(pattern).test(value));
}

function evaluateLabel(label: string, policy: AwsDynamicLabelsPolicy, labelPrefix: string): string | null {
  const stripped = label.slice(labelPrefix.length);
  const colonIndex = stripped.indexOf(':');
  const key = colonIndex === -1 ? stripped : stripped.slice(0, colonIndex);
  const value = colonIndex === -1 ? undefined : stripped.slice(colonIndex + 1);

  if (policy.blocked_keys?.includes(key)) {
    return `key '${key}' is in blocked_keys`;
  }

  const rule = policy.restricted_keys?.[key];
  if (!rule || value === undefined) return null;

  if (rule.allowed && rule.allowed.length > 0 && !matchesAny(value, rule.allowed)) {
    return `value '${value}' not in allowed list`;
  }
  if (rule.denied && matchesAny(value, rule.denied)) {
    return `value '${value}' in denied list`;
  }
  if (rule.max !== undefined && rule.max !== null) {
    const valueNumber = Number(value);
    const maximum = Number(rule.max);
    if (!Number.isFinite(valueNumber) || !Number.isFinite(maximum)) {
      return `max set but value '${value}' or max '${rule.max}' is not numeric`;
    }
    if (valueNumber > maximum) {
      return `value '${value}' exceeds max '${rule.max}'`;
    }
  }

  return null;
}

export function violationsAgainstAwsDynamicLabelsPolicy(
  labels: string[],
  policy: AwsDynamicLabelsPolicy | null | undefined,
  labelPrefix: string,
): { label: string; reason: string }[] {
  if (!policy) return [];

  const violations: { label: string; reason: string }[] = [];
  for (const label of labels) {
    if (!label.startsWith(labelPrefix)) continue;
    const reason = evaluateLabel(label, policy, labelPrefix);
    if (reason) violations.push({ label, reason });
  }
  return violations;
}
