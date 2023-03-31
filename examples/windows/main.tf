locals {
  environment = "windows"
  aws_region  = "eu-west-1"
}

resource "random_id" "random" {
  byte_length = 20
}

module "base" {
  source = "../base"

  prefix     = local.environment
  aws_region = local.aws_region
}

module "runners" {
  source = "../../"

  aws_region = local.aws_region
  vpc_id     = module.base.vpc.vpc_id
  subnet_ids = module.base.vpc.private_subnets
  prefix     = local.environment

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }

  # Grab the lambda packages from local directory. Must run /.ci/build.sh first
  webhook_lambda_zip                = "../../lambda_output/webhook.zip"
  runner_binaries_syncer_lambda_zip = "../../lambda_output/runner-binaries-syncer.zip"
  runners_lambda_zip                = "../../lambda_output/runners.zip"

  enable_organization_runners = false
  # no need to add extra windows tag here as it is automatically added by GitHub
  runner_extra_labels = ["default", "example"]

  # Set the OS to Windows
  runner_os = "windows"
  # we need to give the runner time to start because this is windows.
  runner_boot_time_in_minutes = 20

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  instance_types = ["m5.large", "c5.large"]

  # override delay of events in seconds for testing
  delay_webhook_event = 5

  # override scaling down for testing
  scale_down_schedule_expression = "cron(* * * * ? *)"
}
