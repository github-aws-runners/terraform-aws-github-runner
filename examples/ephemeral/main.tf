locals {
  environment = var.environment != null ? var.environment : "ephemeral"
  aws_region  = var.aws_region
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
  source                          = "../../"
  create_service_linked_role_spot = true
  aws_region                      = local.aws_region
  vpc_id                          = module.base.vpc.vpc_id
  subnet_ids                      = module.base.vpc.private_subnets

  prefix = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }

  # When not explicitly set lambda zip files are grapped from the module requiring lambda build.
  # Alternatively you can set the path to the lambda zip files here.
  #
  # For example grab zip files via lambda_download
  # webhook_lambda_zip                = "../lambdas-download/webhook.zip"
  # runner_binaries_syncer_lambda_zip = "../lambdas-download/runner-binaries-syncer.zip"
  # runners_lambda_zip                = "../lambdas-download/runners.zip"

  enable_organization_runners = true
  runner_extra_labels         = ["default", "example"]

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  # Let the module manage the service linked role
  # create_service_linked_role_spot = true

  instance_types = ["m5.large", "c5.large"]

  # override delay of events in seconds
  delay_webhook_event = 0

  # Ensure you set the number not too low, each build require a new instance
  runners_maximum_count = 20

  # override scaling down
  scale_down_schedule_expression = "cron(* * * * ? *)"

  enable_ephemeral_runners = true

  # # Example of simple pool usages
  # pool_runner_owner = "YOUR_ORG"
  # pool_config = [{
  #   size                         = 3
  #   schedule_expression = "cron(0/3 14 * * ? *)" # every 3 minutes between 14:00 and 15:00
  #   schedule_expression_timezone = "Europe/Amsterdam"

  # }]
  #
  #
  enable_job_queued_check = true

  # tracing_config = {
  #   mode                  = "Active"
  #   capture_error         = true
  #   capture_http_requests = true
  # }


  # configure your pre-built AMI
  # enable_userdata = false
  # ami_filter      = { name = ["github-runner-al2023-x86_64-*"], state = ["available"] }
  # ami_owners      = [data.aws_caller_identity.current.account_id]

  # or use the default AMI
  # enable_userdata = true

  # Enable debug logging for the lambda functions
  # log_level = "debug"

  # Setup a dead letter queue, by default scale up lambda will kepp retrying to process event in case of scaling error.
  # redrive_policy_build_queue = {
  #   enabled             = true
  #   maxReceiveCount     = 50 # 50 retries every 30 seconds => 25 minutes
  #   deadLetterTargetArn = null
  # }

  # Enable beta feature job retry
  job_retry = {
    enable           = true
    max_attempts     = 1
    delay_in_seconds = 180
  }
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
