variable "environment" {
  default = "ministack-external-ssm"
}

variable "github_app_ssm_parameters" {
  default = {
    id = {
      arn  = "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/terraform-aws-github-runner/github-app/id"
      name = "/ministack/terraform-aws-github-runner/github-app/id"
    }
    key_base64 = {
      arn  = "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/terraform-aws-github-runner/github-app/key-base64"
      name = "/ministack/terraform-aws-github-runner/github-app/key-base64"
    }
    webhook_secret = {
      arn  = "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/terraform-aws-github-runner/github-app/webhook-secret"
      name = "/ministack/terraform-aws-github-runner/github-app/webhook-secret"
    }
  }
}

module "runners" {
  ami                               = local.ministack_ami
  runner_binaries_syncer_lambda_zip = var.ministack_lambda_archive
  runners_lambda_zip                = var.ministack_lambda_archive
  webhook_lambda_zip                = var.ministack_lambda_archive
}
