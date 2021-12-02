locals {
  environment = "windows"
  aws_region  = "eu-west-1"
}

resource "random_password" "random" {
  length = 28
}

module "runners" {
  source = "../../"

  aws_region  = local.aws_region
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.private_subnets
  environment = local.environment

  github_app = {
    key_base64     = var.github_app_key_base64
    id             = var.github_app_id
    webhook_secret = random_password.random.result
  }

  # Grab the lambda packages from local directory. Must run /.ci/build.sh first
  webhook_lambda_zip                = "../../lambda_output/webhook.zip"
  runner_binaries_syncer_lambda_zip = "../../lambda_output/runner-binaries-syncer.zip"
  runners_lambda_zip                = "../../lambda_output/runners.zip"

  enable_organization_runners = true
  runner_extra_labels         = "default,example"

  # Set the OS to Windows
  runner_os = "win"
  # no need to add extra windows tag here as it is automatically added by GitHub
  runner_boot_time_in_minutes = 20

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  instance_types = ["m5.large", "c5.large"]

  # override delay of events in seconds for testing
  delay_webhook_event = 5

  # override scaling down for testing
  scale_down_schedule_expression = "cron(* * * * ? *)"
}
