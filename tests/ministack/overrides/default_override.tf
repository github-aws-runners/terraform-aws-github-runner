variable "environment" {
  default = "ministack-default"
}

variable "github_app" {
  default = {
    id         = "0"
    key_base64 = "ministack-invalid-key"
  }
}

module "runners" {
  ami                               = local.ministack_ami
  ami_housekeeper_lambda_zip        = var.ministack_lambda_archive
  runner_binaries_syncer_lambda_zip = var.ministack_lambda_archive
  runners_lambda_zip                = var.ministack_lambda_archive
  webhook_lambda_zip                = var.ministack_lambda_archive

  instance_termination_watcher = {
    enable = true
    zip    = var.ministack_lambda_archive
  }
}

# The production example updates GitHub through a local-exec provisioner.
# A zero count structurally prevents any external GitHub API call in this test.
module "webhook_github_app" {
  count = 0
}
