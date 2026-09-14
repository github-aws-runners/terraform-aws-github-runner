import yn from 'yn';

/** Opt-in organization-scoped installation selection and lifecycle accounting. */
export function multiOrgEnabled(): boolean {
  return yn(process.env.ENABLE_MULTI_ORG_RUNNERS, { default: false });
}

/** Preserve legacy identity while using GitHub's case-insensitive org logins in multi-org mode. */
export function normalizeOrganization(owner: string): string {
  return multiOrgEnabled() ? owner.toLowerCase() : owner;
}
