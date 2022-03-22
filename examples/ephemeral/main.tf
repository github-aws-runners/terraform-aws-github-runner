locals {
  environment = "ephemeral"
  aws_region  = "eu-west-1"
}

resource "random_id" "random" {
  byte_length = 20
}

data "aws_caller_identity" "current" {}

module "runners" {
  source                          = "../../"
  create_service_linked_role_spot = true
  aws_region                      = local.aws_region
  vpc_id                          = module.vpc.vpc_id
  subnet_ids                      = module.vpc.private_subnets

  environment = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app = {
    key_base64     = var.github_app_key_base64
    id             = var.github_app_id
    webhook_secret = random_id.random.hex
  }

  # Grab the lambda packages from local directory. Must run /.ci/build.sh first
  webhook_lambda_zip                = "../../lambda_output/webhook.zip"
  runner_binaries_syncer_lambda_zip = "../../lambda_output/runner-binaries-syncer.zip"
  runners_lambda_zip                = "../../lambda_output/runners.zip"

  enable_organization_runners = true
  runner_extra_labels         = "default,example"

  # enable workflow labels check
  # runner_enable_workflow_job_labels_check = true

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
  # pool_runner_owner = "my-org"
  # pool_config = [{
  #   size                = 20
  #   schedule_expression = "cron(* * * * ? *)"
  # }]
  #
  #
  enable_job_queued_check = true

  # configure your pre-built AMI
  # enabled_userdata = false
  # ami_filter       = { name = ["github-runner-amzn2-x86_64-*"] }
  # ami_owners       = [data.aws_caller_identity.current.account_id]

  # Enable logging
  log_level = "debug"

  # Setup a dead letter queue, by default scale up lambda will kepp retrying to process event in case of scaling error.
  # redrive_policy_build_queue = {
  #   enabled             = true
  #   maxReceiveCount     = 50 # 50 retries every 30 seconds => 25 minutes
  #   deadLetterTargetArn = null
  # }
}
