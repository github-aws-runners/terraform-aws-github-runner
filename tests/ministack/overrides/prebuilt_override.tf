variable "environment" {
  default = "ministack-prebuilt"
}

variable "github_app" {
  default = {
    id         = "0"
    key_base64 = "ministack-invalid-key"
  }
}

variable "ami_name_filter" {
  default = "amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2"
}

module "runners" {
  ami_housekeeper_lambda_zip = var.ministack_lambda_archive
  runners_lambda_zip         = var.ministack_lambda_archive
  webhook_lambda_zip         = var.ministack_lambda_archive
}

# The production example updates GitHub through a local-exec provisioner.
# A zero count structurally prevents any external GitHub API call in this test.
module "webhook_github_app" {
  count = 0
}
