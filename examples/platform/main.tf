locals {
  environment = "platform"
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

  enable_ephemeral_runners          = true
  runners_maximum_count             = 15
  runners_scale_down_lambda_timeout = 10

  block_device_mappings = [{
    # Set the block device name for Ubuntu root device
    device_name           = "/dev/sda1"
    delete_on_termination = true
    volume_type           = "gp3"
    volume_size           = 50
    encrypted             = true
    iops                  = null
    throughput            = null
    kms_key_id            = null
    snapshot_id           = null
  }]

  runner_os      = var.runner_os
  runner_run_as  = var.runner_run_as
  instance_types = var.instance_types

  # configure your pre-built AMI
  enable_userdata = false
  ami_filter      = { name = [var.ami_name_filter] }
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

  # give runner access to sccache s3 bucket
  runner_iam_role_managed_policy_arns = [
    aws_iam_policy.platform_runner_cache_bucket_access_policy.arn
  ]
}
