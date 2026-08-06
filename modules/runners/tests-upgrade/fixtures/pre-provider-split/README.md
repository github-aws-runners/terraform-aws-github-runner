# Frozen pre-provider-split fixture

This fixture intentionally declares the EC2 resources at their historical
`modules/runners` addresses. Do not replace it with a call to the current
module: the upgrade test needs old state addresses so the current `moved`
blocks are exercised.

The external-AMI and module-managed-AMI runs cover the two mutually exclusive
count paths for `runner_ami_id` and `ami_id_ssm_parameter_read`.
