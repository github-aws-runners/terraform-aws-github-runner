# Runner provider-split state upgrade test

The test first applies a frozen copy of the EC2 resources at their historical
root addresses. It then shares that in-memory state with a plan of the current
`modules/runners` configuration.

Two state paths are tested because the module-managed AMI parameter and the
external AMI read policy are mutually exclusive. The ordinary Terraform test
assertions retain representative launch-template, runner-role, and runner-log
group IDs. CI also reads Terraform's verbose JSON plans with
`verify-moves.jq`; it requires every historical resource address to appear as
`previous_address` and rejects create or delete actions for every moved
resource.
