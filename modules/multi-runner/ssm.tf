module "ssm" {
  source = "../ssm"

  kms_key_arn            = local.translated_experimental.ssm.kms_key_id
  path_prefix            = "${trimsuffix(coalesce(local.translated_experimental.ssm.paths.root, "/github-action-runners/${var.prefix}"), "/")}/${local.translated_experimental.ssm.paths.app}"
  github_app             = local.translated_experimental.github.app
  additional_github_apps = local.translated_experimental.github.additional_apps
  tags = merge(
    local.translated_experimental.tags,
    local.translated_experimental.ssm.tags,
    { "ghr:environment" = var.prefix },
  )
}
