locals {
  environment = var.environment != null ? var.environment : "multi-runner"
  aws_region  = "eu-west-1"
}

resource "random_id" "random" {
  byte_length = 20
}

module "multi-runner" {
  source = "../../modules/multi-runner"
  multi_runner_config = {
    "linux-arm64" = {
      matcherConfig : {
        labelMatchers = [["self-hosted", "linux", "arm64", "amazon"]]
        exactMatch    = true
      }
      fifo                = true
      delay_webhook_event = 0
      redrive_build_queue = {
        enabled         = false
        maxReceiveCount = null
      }
      runner_config = {
        runner_os                      = "linux"
        runner_architecture            = "arm64"
        runner_extra_labels            = "amazon"
        runner_name_prefix             = "amazon-arm64_"
        enable_ssm_on_runners          = true
        instance_types                 = ["t4g.large", "c6g.large"]
        runners_maximum_count          = 1
        scale_down_schedule_expression = "cron(* * * * ? *)"
      }
    },
    "linux-ubuntu" = {
      matcherConfig : {
        labelMatchers = [["self-hosted", "linux", "x64", "ubuntu-latest"], ["self-hosted", "linux", "x64", "ubuntu-2204"]]
        exactMatch    = true
      }
      fifo                = true
      delay_webhook_event = 0
      redrive_build_queue = {
        enabled         = false
        maxReceiveCount = null
      }
      runner_config = {
        runner_os                      = "linux"
        runner_architecture            = "x64"
        runner_extra_labels            = "ubuntu-latest,ubuntu-2204"
        runner_run_as                  = "ubuntu"
        runner_name_prefix             = "ubuntu-2204-x64_"
        enable_ssm_on_runners          = true
        instance_types                 = ["m5ad.large", "m5a.large"]
        runners_maximum_count          = 1
        scale_down_schedule_expression = "cron(* * * * ? *)"
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
    "windows-x64" = {
      matcherConfig : {
        labelMatchers = [["self-hosted", "windows", "x64", "servercore-2022"]]
        exactMatch    = true
      }
      fifo                = true
      delay_webhook_event = 5
      runner_config = {
        runner_os                      = "windows"
        runner_architecture            = "x64"
        runner_name_prefix             = "servercore-2022-x64_"
        enable_ssm_on_runners          = true
        instance_types                 = ["m5.large", "c5.large"]
        runner_extra_labels            = "servercore-2022"
        runners_maximum_count          = 1
        scale_down_schedule_expression = "cron(* * * * ? *)"
        runner_boot_time_in_minutes    = 20
        ami_filter = {
          name = ["Windows_Server-2022-English-Core-ContainersLatest-*"]
        }
      }
    },
    "linux-x64" = {
      matcherConfig : {
        labelMatchers = [["self-hosted", "linux", "x64", "amazon"]]
        exactMatch    = false
      }
      fifo                = true
      delay_webhook_event = 0
      runner_config = {
        # Test retrieving tag information via AWS API (Cli)
        runner_metadata_options = {
          instance_metadata_tags      = "disabled"
          http_endpoint               = "enabled"
          http_tokens                 = "optional"
          http_put_response_hop_limit = 1
        }
        runner_os                       = "linux"
        runner_architecture             = "x64"
        runner_name_prefix              = "amazon-x64_"
        create_service_linked_role_spot = true
        enable_ssm_on_runners           = true
        instance_types                  = ["m5ad.large", "m5a.large"]
        runner_extra_labels             = "amazon"
        runners_maximum_count           = 1
        enable_ephemeral_runners        = true
        scale_down_schedule_expression  = "cron(* * * * ? *)"
      }
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
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }

  # Assuming local build lambda's to use pre build ones, uncomment the lines below and download the
  # lambda zip files lambda_download
  # webhook_lambda_zip                = "../lambdas-download/webhook.zip"
  # runner_binaries_syncer_lambda_zip = "../lambdas-download/runner-binaries-syncer.zip"
  # runners_lambda_zip                = "../lambdas-download/runners.zip"

  # enable_workflow_job_events_queue = true
  # override delay of events in seconds

  # Enable debug logging for the lambda functions
  # log_level = "debug"

}
