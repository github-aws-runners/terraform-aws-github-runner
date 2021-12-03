locals {
  environment = "prebuilt"
  aws_region  = "eu-west-1"
}

resource "random_password" "random" {
  length = 28
}

data "aws_caller_identity" "current" {}

module "runners" {
  source                          = "../../"
  create_service_linked_role_spot = true
  aws_region                      = local.aws_region
  vpc_id                          = module.vpc.vpc_id
  subnet_ids                      = module.vpc.private_subnets

  environment = local.environment

  github_app = {
    key_base64     = var.github_app_key_base64
    id             = var.github_app_id
    webhook_secret = random_password.random.result
  }

  webhook_lambda_zip                = "../../lambda_output/webhook.zip"
  runner_binaries_syncer_lambda_zip = "../../lambda_output/runner-binaries-syncer.zip"
  runners_lambda_zip                = "../../lambda_output/runners.zip"

  runner_extra_labels = "default,example"

  # configure your pre-built AMI
  enabled_userdata = false
  ami_filter       = { name = ["github-runner-amzn2-x86_64-2021*"] }
  ami_owners       = [data.aws_caller_identity.current.account_id]

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  # override delay of events in seconds
  delay_webhook_event = 5

  # override scaling down
  scale_down_schedule_expression = "cron(* * * * ? *)"
}
