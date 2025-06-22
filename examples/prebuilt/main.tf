locals {
  environment = var.environment != null ? var.environment : "default"
  aws_region  = var.aws_region
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

  # link to downloaded lambda zip files.
  # When not explicitly set lambda zip files are grabbed from the module requiring lambda build.
  #
  # webhook_lambda_zip                = "../lambdas-download/webhook.zip"
  # runner_binaries_syncer_lambda_zip = "../lambdas-download/runner-binaries-syncer.zip"
  # runners_lambda_zip                = "../lambdas-download/runners.zip"

  runner_extra_labels = ["default", "example"]

  runner_os = var.runner_os

  # configure your pre-built AMI
  enable_userdata = false
  ami_filter      = { name = [var.ami_name_filter], state = ["available"] }
  ami_owners      = [data.aws_caller_identity.current.account_id]

  # disable binary syncer since github agent is already installed in the AMI.
  enable_runner_binaries_syncer = false

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  # override delay of events in seconds
  delay_webhook_event = 5

  # override scaling down
  scale_down_schedule_expression = "cron(* * * * ? *)"

  enable_ami_housekeeper = true
  ami_housekeeper_cleanup_config = {
    ssmParameterNames = ["*/ami_id"]
    minimumDaysOld    = 1
    dryRun            = true
    amiFilters = [
      {
        Name   = "name"
        Values = ["*al2023*"]
      }
    ]
  }

  # variable "runners_ssm_housekeeper" {
  #   description = <<EOF
  #   Configuration for the SSM housekeeper lambda. This lambda deletes token / JIT config from SSM.

  #   `schedule_expression`: is used to configure the schedule for the lambda.
  #   `enabled`: enable or disable the lambda trigger via the EventBridge.
  #   `lambda_memory_size`: lambda memery size limit.
  #   `lambda_timeout`: timeout for the lambda in seconds.
  #   `config`: configuration for the lambda function. Token path will be read by default from the module.
  #   EOF
  #   type = object({
  #     schedule_expression = optional(string, "rate(1 day)")
  #     enabled             = optional(bool, true)
  #     lambda_memory_size  = optional(number, 512)
  #     lambda_timeout      = optional(number, 60)
  #     config = object({
  #       tokenPath      = optional(string)
  #       minimumDaysOld = optional(number, 1)
  #       dryRun         = optional(bool, false)
  #     })
  #   })
  #   default = { config = {} }

  # log_level = "debug"
}

module "webhook_github_app" {
  source     = "../../modules/webhook-github-app"
  depends_on = [module.runners]

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }
  webhook_endpoint = module.runners.webhook.endpoint
}
