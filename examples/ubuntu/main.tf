locals {
  environment = "ubuntu"
  aws_region  = "eu-west-1"
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
  source = "../../"

  aws_region = local.aws_region
  vpc_id     = module.base.vpc.vpc_id
  subnet_ids = module.base.vpc.private_subnets

  prefix = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }

  # webhook_lambda_zip                = "lambdas-download/webhook.zip"
  # runner_binaries_syncer_lambda_zip = "lambdas-download/runner-binaries-syncer.zip"
  # runners_lambda_zip                = "lambdas-download/runners.zip"

  enable_organization_runners = false
  runner_extra_labels         = "default,example"

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  runner_run_as = "ubuntu"

  # AMI selection and userdata
  #
  # option 1. configure your pre-built AMI + userdata
  userdata_template = "./templates/user-data.sh"
  ami_owners        = ["099720109477"] # Canonical's Amazon account ID

  ami_filter = {
    name  = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"],
    state = ["available"]
  }

  # Custom build AMI, no custom userdata needed.
  # option 2: Build custom AMI see ../../images/ubuntu-focal
  #           disable lines above (option 1) and enable the ones below
  # ami_filter = { name = ["github-runner-ubuntu-focal-amd64-*"], state = ["available"] }
  # data "aws_caller_identity" "current" {}
  # ami_owners = [data.aws_caller_identity.current.account_id]

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
      "log_group_name" : "syslog",
      "prefix_log_group" : true,
      "file_path" : "/var/log/syslog",
      "log_stream_name" : "{instance_id}"
    },
    {
      "log_group_name" : "user_data",
      "prefix_log_group" : true,
      "file_path" : "/var/log/user-data.log",
      "log_stream_name" : "{instance_id}/user_data"
    },
    {
      "log_group_name" : "runner",
      "prefix_log_group" : true,
      "file_path" : "/opt/actions-runner/_diag/Runner_**.log",
      "log_stream_name" : "{instance_id}/runner"
    }
  ]

  # Uncomment to enable ephemeral runners
  # delay_webhook_event      = 0
  # enable_ephemeral_runners = true
  # enable_userdata         = true

  # Uncommet idle config to have idle runners from 9 to 5 in time zone Amsterdam
  # idle_config = [{
  #   cron      = "* * 9-17 * * *"
  #   timeZone  = "Europe/Amsterdam"
  #   idleCount = 1
  # }]

  # Enable logging all commands of user_data, secrets will be logged!!!
  # enable_user_data_debug_logging_runner = true
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
