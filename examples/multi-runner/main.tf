locals {
  environment = var.environment != null ? var.environment : "multi-runner"
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
  multi_runner_config = {
    "linux" = {
      labelMatchers       = ["self-hosted", "linux", "arm64", "arm"]
      exactMatch          = true
      fifo                = true
      delay_webhook_event = 0
      redrive_build_queue = {
        enabled         = false
        maxReceiveCount = null
      }
      runner_config = {
        runner_os                      = "linux"
        runner_architecture            = "arm64"
        runner_extra_labels            = "arm"
        enable_ssm_on_runners          = true
        instance_types                 = ["t4g.large", "c6g.large"]
        runners_maximum_count          = 1
        scale_down_schedule_expression = "cron(* * * * ? *)"
      }
    },
    "linux-ubuntu" = {
      labelMatchers       = ["self-hosted", "linux", "x64", "ubuntu"]
      exactMatch          = true
      fifo                = true
      delay_webhook_event = 0
      redrive_build_queue = {
        enabled         = false
        maxReceiveCount = null
      }
      runner_config = {
        runner_os                      = "linux"
        runner_architecture            = "x64"
        runner_extra_labels            = "ubuntu"
        enable_ssm_on_runners          = true
        instance_types                 = ["m5ad.large", "m5a.large"]
        runners_maximum_count          = 1
        scale_down_schedule_expression = "cron(* * * * ? *)"
        runner_run_as                  = "ubuntu"
        userdata_template              = "./templates/user-data.sh"
        ami_owners                     = ["099720109477"] # Canonical's Amazon account ID

        ami_filter = {
          name = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
        }
        block_device_mappings = [{
          # Set the block device name for Ubuntu root device
          device_name           = "/dev/sda1"
          delete_on_termination = true
          volume_type           = "gp3"
          volume_size           = 30
          encrypted             = true
          iops                  = null
          throughput            = null
          kms_key_id            = null
          snapshot_id           = null
        }]
        runner_log_files = [
          {
            log_group_name   = "syslog"
            prefix_log_group = true
            file_path        = "/var/log/syslog"
            log_stream_name  = "{instance_id}"
          },
          {
            log_group_name   = "user_data"
            prefix_log_group = true
            file_path        = "/var/log/user-data.log"
            log_stream_name  = "{instance_id}/user_data"
          },
          {
            log_group_name   = "runner"
            prefix_log_group = true
            file_path        = "/opt/actions-runner/_diag/Runner_**.log",
            log_stream_name  = "{instance_id}/runner"
          }
        ]
      }
    },
    # TODO: make ephemeral
    "linux-x64" = {
      fifo                = true
      delay_webhook_event = 0
      labelMatchers       = ["self-hosted", "linux", "x64", "amazon"]
      exactMatch          = false
      runner_config = {
        runner_os                       = "linux"
        runner_architecture             = "x64"
        create_service_linked_role_spot = true
        enable_ssm_on_runners           = true
        instance_types                  = ["m5ad.large", "m5a.large"]
        runner_extra_labels             = "amazon"
        runners_maximum_count           = 1
        scale_down_schedule_expression  = "cron(* * * * ? *)"
      }
      # TODO: add windows
    }

  }
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
  # webhook_lambda_zip                = "lambdas-download/webhook.zip"
  # runner_binaries_syncer_lambda_zip = "lambdas-download/runner-binaries-syncer.zip"
  # runners_lambda_zip                = "lambdas-download/runners.zip"

  # override delay of events in seconds

  log_level = "debug"
}
