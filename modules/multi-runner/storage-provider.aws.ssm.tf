module "ssm" {
  source                 = "../storage-providers/aws/ssm"
  kms_key_arn            = try(local.effective_config.storage_provider.aws.ssm.kms_key_id, null)
  path_prefix            = "${local.ssm_root_path}/${try(local.effective_config.storage_provider.aws.ssm.paths.app, "app")}"
  github_app             = local.effective_config.github.app
  additional_github_apps = local.effective_config.github.additional_apps
  tags = merge(
    local.tags,
    try(local.effective_config.storage_provider.aws.ssm.tags, {}),
  )
}
