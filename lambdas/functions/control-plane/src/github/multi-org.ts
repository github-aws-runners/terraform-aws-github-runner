import yn from 'yn';

/** Opt-in organization-scoped installation selection and lifecycle accounting. */
export function multiOrgEnabled(): boolean {
  return yn(process.env.ENABLE_MULTI_ORG_RUNNERS, { default: false });
}
