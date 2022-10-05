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
      "exactMatch" : true
      "redrive_build_queue" : {
        "enabled" : false,
        "maxReceiveCount" : null
      },
      "runner_config" : {
        "id" : "linux-x64",
        "enable_runner_binaries_syncer" : true,
        "runner_os" : "linux",
        "runner_architecture" : "x64",
        "create_service_linked_role_spot" : true,
        "disable_runner_autoupdate" : true,
        "enable_ephemeral_runners" : true,
        "enable_organization_runners" : true,
        "enable_ssm_on_runners" : true,                              #TODO disable see #19
        "instance_types" : ["m5ad.large", "m5a.large", "c5.xlarge"], # c5.xlarge is backup, we select based on price
        "runner_as_root" : true
        "runner_extra_labels" : "staging"
        "runner_group_name" : "default-linux"
        "runners_maximum_count" : 100
        "scale_down_schedule_expression" : "cron(* * * * ? *)"
        "userdata_template" : null
        "ami_filter" : null
        "ami_owners" : ["amazon"]
        "block_device_mappings" : [{
          "device_name" : "/dev/xvda"
          "delete_on_termination" : true
          "volume_type" : "gp3"
          "volume_size" : 25
          "encrypted" : true
          "iops" : null
          "kms_key_id" : null
          "snapshot_id" : null
          "throughput" : null
        }]
        "runner_metadata_options" : {
          http_endpoint : "enabled"
          http_tokens : "required"
          http_put_response_hop_limit : 1
        }
        "minimum_running_time_in_minutes" : 30,
        "runner_boot_time_in_minutes" : 5
        # pool config
        "pool_runner_owner" : "philips-test-runners"
        "enable_job_queued_check" : true
        // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#RateExpressions
        "pool_config" : [
          {
            "size" : 1
            "schedule_expression" : "cron(0 3 ? * MON-FRI *)"
          }
        ]
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
        "enable_runner_binaries_syncer" : true,
        "runner_os" : "linux",
        "runner_architecture" : "arm64",
        "create_service_linked_role_spot" : false
        "disable_runner_autoupdate" : false
        "enable_ephemeral_runners" : true
        "enable_organization_runners" : true
        "enable_ssm_on_runners" : true
        "runner_extra_labels" : "staging" #TODO disable see #19
        "instance_types" : ["t4g.large", "c6g.large"]
        "minimum_running_time_in_minutes" : 30
        "runner_as_root" : true
        "runner_group_name" : "default-arm64"
        "runners_maximum_count" : 10
        "scale_down_schedule_expression" : "cron(* * * * ? *)"
        "runner_boot_time_in_minutes" : 20
        "userdata_template" : null
        "ami_filter" : null
        "ami_owners" : ["amazon"]
        "block_device_mappings" : [{
          "device_name" : "/dev/sda1"
          "delete_on_termination" : true
          "volume_type" : "gp3"
          "volume_size" : 100
          "encrypted" : true
          "iops" : null
          "kms_key_id" : null
          "snapshot_id" : null
          "throughput" : null
        }]
        "runner_metadata_options" : {
          http_endpoint : "enabled"
          http_tokens : "required"
          http_put_response_hop_limit : 1
        }

        # pool config
        "pool_runner_owner" : "philips-test-runners"
        "enable_job_queued_check" : true
        // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#RateExpressions
        "pool_config" : [
          {
            "size" : 1
            "schedule_expression" : "cron(0 3 ? * MON-FRI *)"
          }
        ]
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

  runner_extra_labels = "staging"

  # override delay of events in seconds
  delay_webhook_event = 0
}
