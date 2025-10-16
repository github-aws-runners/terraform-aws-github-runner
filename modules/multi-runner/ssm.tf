module "ssm" {
  source      = "../ssm"
  kms_key_arn = var.kms_key_arn
  path_prefix = "${local.ssm_root_path}/${var.ssm_paths.app}"
  enterprise_pat = var.enterprise_pat
  github_app  = var.github_app
  tags        = local.tags
}
