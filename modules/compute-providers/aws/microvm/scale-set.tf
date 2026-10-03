# Provider-owned runtime and IAM fragments for the additive scale-set
# orchestration capability. GitHub credentials, GitHub scope, desired capacity,
# and boot timeout remain orchestration-owned and are not serialized here.
locals {
  scale_set_capability = {
    configuration_json    = "{}"
    environment_variables = {}
    iam_statements        = {}
  }
}
