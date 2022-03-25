locals {
  environment = "ubuntu"
  aws_region  = "eu-west-1"
}

resource "random_id" "random" {
  byte_length = 20
}

data "aws_caller_identity" "current" {}

module "runners" {
  source = "../../"

  aws_region = local.aws_region
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  environment = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app = {
    key_base64     = var.github_app_key_base64
    id             = var.github_app_id
    webhook_secret = random_id.random.hex
  }

  # webhook_lambda_zip                = "lambdas-download/webhook.zip"
  # runner_binaries_syncer_lambda_zip = "lambdas-download/runner-binaries-syncer.zip"
  # runners_lambda_zip                = "lambdas-download/runners.zip"

  enable_organization_runners = false
  runner_extra_labels         = "ubuntu,example"

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  runner_run_as = "ubuntu"

  # AMI selection and userdata
  #
  # option 1. configure your pre-built AMI + userdata
  userdata_template = "./templates/user-data.sh"
  ami_owners        = ["099720109477"] # Canonical's Amazon account ID

  ami_filter = {
    name = ["ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*"]
  }

  # Custom build AMI, no custom userdata needed.
  # option 2: Build custom AMI see ../../images/ubuntu-focal
  #           disable lines above (option 1) and enable the ones below
  # ami_filter = { name = ["github-runner-ubuntu-focal-amd64-*"] }
  # ami_owners = [data.aws_caller_identity.current.account_id]


  block_device_mappings = [{
    # Set the block device name for Ubuntu root device
    device_name           = "/dev/sda1"
    delete_on_termination = true
    volume_type           = "gp3"
    volume_size           = 30
    encrypted             = true
    iops                  = null
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
  # enabled_userdata         = false

  # Uncommet idle config to have idle runners from 9 to 5 in time zone Amsterdam
  # idle_config = [{
  #   cron      = "* * 9-17 * * *"
  #   timeZone  = "Europe/Amsterdam"
  #   idleCount = 1
  # }]

}
