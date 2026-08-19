export const MICROVM_DYNAMIC_LABEL_PREFIX = 'ghr-microvm-';

const MAXIMUM_EGRESS_NETWORK_CONNECTORS = 10;
const MICROVM_IMAGE_ARN_PATTERN = /^arn:[^:]+:lambda:[^:]+:[0-9]{12}:microvm-image:.+$/;
const MICROVM_NETWORK_CONNECTOR_ARN_PATTERN =
  /^arn:aws[a-zA-Z-]*:lambda:[a-z0-9-]+:(?:[0-9]{12}|aws):network-connector:[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)?$/;

export interface MicrovmDynamicLabelOverrides {
  egressNetworkConnectors?: string[];
  imageIdentifier?: string;
  imageVersion?: string;
}

export interface MicrovmDynamicLabelViolation {
  label: string;
  reason: string;
}

export function parseMicrovmDynamicLabels(labels: string[]): {
  overrides: MicrovmDynamicLabelOverrides;
  violations: MicrovmDynamicLabelViolation[];
} {
  const overrides: MicrovmDynamicLabelOverrides = {};
  const violations: MicrovmDynamicLabelViolation[] = [];

  for (const label of labels) {
    if (!label.startsWith(MICROVM_DYNAMIC_LABEL_PREFIX)) continue;

    const stripped = label.slice(MICROVM_DYNAMIC_LABEL_PREFIX.length);
    const colonIndex = stripped.indexOf(':');
    const key = colonIndex === -1 ? stripped : stripped.slice(0, colonIndex);
    const value = colonIndex === -1 ? '' : stripped.slice(colonIndex + 1).trim();

    if (!value) {
      violations.push({ label, reason: `key '${key}' requires a value` });
      continue;
    }

    switch (key) {
      case 'egress-network-connectors': {
        if (!MICROVM_NETWORK_CONNECTOR_ARN_PATTERN.test(value)) {
          violations.push({
            label,
            reason: `'${value}' is not a valid Lambda network connector ARN; specify one ARN per label`,
          });
          break;
        }

        const connectors = overrides.egressNetworkConnectors ?? [];
        if (connectors.length >= MAXIMUM_EGRESS_NETWORK_CONNECTORS) {
          violations.push({
            label,
            reason: `at most ${MAXIMUM_EGRESS_NETWORK_CONNECTORS} egress network connector labels are supported`,
          });
        } else {
          overrides.egressNetworkConnectors = [...connectors, value];
        }
        break;
      }
      case 'image-arn':
        if (!MICROVM_IMAGE_ARN_PATTERN.test(value)) {
          violations.push({ label, reason: `'${value}' is not a valid customer MicroVM image ARN` });
        } else {
          overrides.imageIdentifier = value;
        }
        break;
      case 'image-version':
        overrides.imageVersion = value;
        break;
      default:
        violations.push({ label, reason: `key '${key}' is not a supported MicroVM override` });
    }
  }

  return { overrides, violations };
}
