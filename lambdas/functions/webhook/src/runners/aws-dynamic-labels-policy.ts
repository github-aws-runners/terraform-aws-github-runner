export interface AwsDynamicLabelsValueRule {
  allowed?: string[];
  denied?: string[];
  max?: number | string;
}

/**
 * AWS dynamic labels policy schema. `blocked_keys` rejects keys outright;
 * `restricted_keys` applies optional per-key value rules. Provider-specific
 * evaluators decide which dynamic label prefixes the policy applies to.
 */
export interface AwsDynamicLabelsPolicy {
  blocked_keys?: string[];
  restricted_keys?: Record<string, AwsDynamicLabelsValueRule>;
}
