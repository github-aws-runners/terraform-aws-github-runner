module "ssm" {
  source                    = "../ssm"
  kms_key_arn               = var.kms_key_arn
  path_prefix               = "${local.ssm_root_path}/${var.ssm_paths.app}"
  github_app                = var.github_app
  additional_github_apps    = var.additional_github_apps
  enterprise_pat            = var.enterprise_pat
  runner_registration_level = local.any_enterprise_runners ? "enterprise" : null
  tags                      = local.tags
}
