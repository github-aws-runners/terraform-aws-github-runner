interface SsmParameterStoreTag {
  Key: string;
  Value: string;
}

export function loadSsmParameterStoreTagsFromEnvironment(): SsmParameterStoreTag[] {
  return process.env.SSM_PARAMETER_STORE_TAGS && process.env.SSM_PARAMETER_STORE_TAGS.trim() !== ''
    ? validateSsmParameterStoreTags(process.env.SSM_PARAMETER_STORE_TAGS)
    : [];
}

function validateSsmParameterStoreTags(tagsJson: string): SsmParameterStoreTag[] {
  try {
    const tags: unknown = JSON.parse(tagsJson);

    if (!Array.isArray(tags)) {
      throw new Error('Tags must be an array');
    }

    if (tags.length === 0) {
      return [];
    }

    tags.forEach((tag: unknown, index: number) => {
      if (typeof tag !== 'object' || tag === null) {
        throw new Error(`Tag at index ${index} must be an object`);
      }

      const candidate = tag as Record<string, unknown>;
      if (!candidate.Key || typeof candidate.Key !== 'string' || candidate.Key.trim() === '') {
        throw new Error(`Tag at index ${index} has missing or invalid 'Key' property`);
      }
      if (!Object.prototype.hasOwnProperty.call(candidate, 'Value') || typeof candidate.Value !== 'string') {
        throw new Error(`Tag at index ${index} has missing or invalid 'Value' property`);
      }
    });

    return tags as SsmParameterStoreTag[];
  } catch (error) {
    throw new Error(`Failed to parse SSM_PARAMETER_STORE_TAGS: ${(error as Error).message}`);
  }
}
