locals {
  environment = "prebuilt"
  aws_region  = "eu-west-1"
}

resource "random_id" "random" {
  byte_length = 20
}

data "aws_caller_identity" "current" {}

module "base" {
  source = "../base"

  prefix     = local.environment
  aws_region = local.aws_region
}

module "runners" {
  source                          = "../../"
  create_service_linked_role_spot = true
  aws_region                      = local.aws_region
  vpc_id                          = module.base.vpc.vpc_id
  subnet_ids                      = module.base.vpc.private_subnets

  prefix                      = local.environment
  enable_organization_runners = false

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }

  webhook_lambda_zip                = "../lambdas-download/webhook.zip"
  runner_binaries_syncer_lambda_zip = "../lambdas-download/runner-binaries-syncer.zip"
  runners_lambda_zip                = "../lambdas-download/runners.zip"

  runner_extra_labels = "default,example"

  runner_os = var.runner_os

  # configure your pre-built AMI
  enable_userdata = false
  ami_filter      = { name = [var.ami_name_filter], state = ["available"] }
  ami_owners      = [data.aws_caller_identity.current.account_id]

  # Look up runner AMI ID from an AWS SSM parameter (overrides ami_filter at instance launch time)
  # NOTE: the parameter must be managed outside of this module (e.g. in a runner AMI build workflow)
  # ami_id_ssm_parameter_name = "my-runner-ami-id"

  # disable binary syncer since github agent is already installed in the AMI.
  enable_runner_binaries_syncer = false

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  # override delay of events in seconds
  delay_webhook_event = 5

  # override scaling down
  scale_down_schedule_expression = "cron(* * * * ? *)"
}

module "webhook-github-app" {
  source     = "../../modules/webhook-github-app"
  depends_on = [module.runners]

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }
  webhook_endpoint = module.runners.webhook.endpoint
}
