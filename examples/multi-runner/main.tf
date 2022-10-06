locals {
  environment = "default"
  aws_region  = "eu-west-1"
}

resource "random_id" "random" {
  byte_length = 20
}
data "aws_caller_identity" "current" {}


################################################################################
### Hybrid account
################################################################################

module "multi-runner" {
  source = "../../modules/multi-runner"
  multi_runner_config = [
    {
      "fifo" : true,
      "labelMatchers" : ["self-hosted", "linux", "x64", "staging"]
      "exactMatch" : true,
      "runner_config" : {
        "id" : "linux-x64",
        "runner_os" : "linux",
        "runner_architecture" : "x64",
        "create_service_linked_role_spot" : true,
        "enable_ssm_on_runners" : true,                              # enable access to the runners via SSM
        "instance_types" : ["m5ad.large", "m5a.large", "c5.xlarge"], # c5.xlarge is backup, we select based on price
        "runner_extra_labels" : "staging"
        "runners_maximum_count" : 1
        "scale_down_schedule_expression" : "cron(* * * * ? *)"
        # "block_device_mappings" : [{
        #   "device_name" : "/dev/xvda"
        #   "delete_on_termination" : true
        #   "volume_type" : "gp3"
        #   "volume_size" : 25
        #   "encrypted" : true
        #   "iops" : null
        #   "kms_key_id" : null
        #   "snapshot_id" : null
        #   "throughput" : null
        # }]
        # pool config
        // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#RateExpressions
      }
    },
    {
      "labelMatchers" : ["self-hosted", "linux", "arm64", "staging"]
      "exactMatch" : true
      "fifo" : true,
      "redrive_build_queue" : {
        "enabled" : false,
        "maxReceiveCount" : null
      },
      "runner_config" : {
        "id" : "linux-arm64",
        "runner_os" : "linux",
        "runner_architecture" : "arm64",
        "runner_extra_labels" : "staging" #TODO disable see #19
        "instance_types" : ["t4g.large", "c6g.large"]
        "runners_maximum_count" : 1
        "scale_down_schedule_expression" : "cron(* * * * ? *)"
      }
    }
  ]
  aws_region                        = local.aws_region
  vpc_id                            = module.vpc.vpc_id
  subnet_ids                        = module.vpc.private_subnets
  runners_scale_up_lambda_timeout   = 60
  runners_scale_down_lambda_timeout = 60
  prefix                            = local.environment
  tags = {
    Project = "ProjectX"
  }
  github_app = {
    key_base64     = var.github_app_key_base64
    id             = var.github_app_id
    webhook_secret = random_id.random.hex
  }
  # Grab zip files via lambda_download
  webhook_lambda_zip                = "lambdas-download/webhook.zip"
  runner_binaries_syncer_lambda_zip = "lambdas-download/runner-binaries-syncer.zip"
  runners_lambda_zip                = "lambdas-download/runners.zip"

  # override delay of events in seconds
  delay_webhook_event = 0
}
