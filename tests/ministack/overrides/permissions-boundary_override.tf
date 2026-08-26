variable "github_app" {
  default = {
    id         = "0"
    key_base64 = "ministack-invalid-key"
  }
}

module "runners" {
  ami                               = local.ministack_ami
  runner_binaries_syncer_lambda_zip = var.ministack_lambda_archive
  runners_lambda_zip                = var.ministack_lambda_archive
  webhook_lambda_zip                = var.ministack_lambda_archive
}
