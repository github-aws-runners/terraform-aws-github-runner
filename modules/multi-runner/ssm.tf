module "ssm" {
  source = "../ssm"

  kms_key_arn = var.kms_key_arn
  prefix      = var.prefix
  github_app  = var.github_app
  tags        = local.tags
}
