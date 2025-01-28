module "ssm" {
  source      = "../ssm"
  count       = var.create_ssm_parameters_github_app ? 1 : 0
  kms_key_arn = var.kms_key_arn
  path_prefix = "${local.ssm_root_path}/${var.ssm_paths.app}"
  github_app  = var.github_app
  tags        = local.tags
}
