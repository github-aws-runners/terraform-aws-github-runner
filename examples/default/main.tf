locals {
  environment = var.environment != null ? var.environment : "default"
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

  # configure the block device mappings, default for Amazon Linux2
  # block_device_mappings = [{
  #   device_name           = "/dev/xvda"
  #   delete_on_termination = true
  #   volume_type           = "gp3"
  #   volume_size           = 10
  #   encrypted             = true
  #   iops                  = null
  # }]

  # Grab zip files via lambda_download
  # webhook_lambda_zip                = "../lambdas-download/webhook.zip"
  # runner_binaries_syncer_lambda_zip = "../lambdas-download/runner-binaries-syncer.zip"
  # runners_lambda_zip                = "../lambdas-download/runners.zip"

  enable_organization_runners = true
  runner_extra_labels         = ["default", "example"]

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  # use S3 or KMS SSE to runners S3 bucket
  # runner_binaries_s3_sse_configuration = {
  #   rule = {
  #     apply_server_side_encryption_by_default = {
  #       sse_algorithm = "AES256"
  #     }
  #   }
  # }

  # enable S3 versioning for runners S3 bucket
  # runner_binaries_s3_versioning = "Enabled"

  # Uncommet idle config to have idle runners from 9 to 5 in time zone Amsterdam
  # idle_config = [{
  #   cron      = "* * 9-17 * * *"
  #   timeZone  = "Europe/Amsterdam"
  #   idleCount = 1
  # }]

  # Let the module manage the service linked role
  # create_service_linked_role_spot = true

  instance_types = ["m5.large", "c5.large"]

  # override delay of events in seconds
  delay_webhook_event   = 5
  runners_maximum_count = 2

  # set up a fifo queue to remain order
  enable_fifo_build_queue = true

  # override scaling down
  scale_down_schedule_expression = "cron(* * * * ? *)"
  # enable this flag to publish webhook events to workflow job queue
  # enable_workflow_job_events_queue  = true

  enable_user_data_debug_logging_runner = true

  # prefix GitHub runners with the environment name
  runner_name_prefix = "${local.environment}_"

  # Enable debug logging for the lambda functions
  # log_level = "debug"

  enable_ami_housekeeper = true
  ami_housekeeper_cleanup_config = {
    ssmParameterNames = ["*/ami-id"]
    minimumDaysOld    = 10
    amiFilters = [
      {
        Name   = "name"
        Values = ["*al2023*"]
      }
    ]
  }

  instance_termination_watcher = {
    enable = true
    enable_metric = {
      spot_warning = true
    }
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
