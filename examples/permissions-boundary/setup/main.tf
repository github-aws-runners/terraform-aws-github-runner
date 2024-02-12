data "aws_caller_identity" "current" {}

module "iam" {
  source = "../../../modules/setup-iam-permissions"

  account_id = data.aws_caller_identity.current.account_id

  namespaces = {
    boundary_namespace         = "boundaries"
    role_namespace             = "runners"
    policy_namespace           = "runners"
    instance_profile_namespace = "runners"
  }
}
