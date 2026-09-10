module "ssm" {
  source                 = "../ssm"
  kms_key_arn            = local.effective_config.ssm.kms_key_id
  path_prefix            = "${local.ssm_root_path}/${local.effective_config.ssm.paths.app}"
  github_app             = local.effective_config.github.app
  additional_github_apps = local.effective_config.github.additional_apps
  tags = merge(
    local.tags,
    local.effective_config.ssm.tags,
  )
}
