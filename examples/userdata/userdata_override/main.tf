locals {
  environment = "ubuntu"
  aws_region = "us-east-1"
  # aws_region  = "eu-west-1"

  userdata = templatefile("${path.module}/scripts/user-data.sh", {
    install_runner = templatefile("${path.module}/scripts/install-runner.sh", {
      S3_LOCATION_RUNNER_DISTRIBUTION = "${module.runners.binaries_syncer.bucket.id}/actions-runner-linux.tar.gz",
      RUNNER_ARCHITECTURE             = "x64",
      ssm_key_cloudwatch_agent_config = aws_ssm_parameter.cloudwatch_agent_config_runner.name
    }),
    start_runner = file("${path.module}/scripts/start-runner.sh")
  })

  logfiles = [
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
  loggroups_names = distinct([for l in local.logfiles : l.log_group_name])
  log_ssm_config_name = "${local.environment}-cloudwatch_agent_config_runner"

  key = filebase64("private-key.pem")
}

resource "random_id" "random" {
  byte_length = 20
}

data "aws_caller_identity" "current" {}

module "runners" {
  source = "../../../"

  aws_region = local.aws_region
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  environment = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app = {
    key_base64     = local.key
    id             = var.github_app_id
    webhook_secret = random_id.random.hex
  }
  webhook_lambda_zip = "./lambdas-download/webhook.zip"
  runner_binaries_syncer_lambda_zip = "./lambdas-download/runner-binaries-syncer.zip"
  runners_lambda_zip = "./lambdas-download/runners.zip"
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
  # configure your pre-built AMI + userdata
  userdata_override = local.userdata
  ami_owners        = ["099720109477"] # Canonical's Amazon account ID

  ami_filter = {
    name = ["ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*"]
  }

  instance_types = [
    "t3.small"
  ]

  runner_iam_role_managed_policy_arns = [
    aws_iam_policy.runner.arn
  ]

  # Custom build AMI, no custom userdata needed.
  # option 2: Build custom AMI see ../../../images/ubuntu-focal
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

  // Since the logging SSM parameters are not outputs of the module, they need to be setup outside of the module
  enable_cloudwatch_agent = false
  runner_log_files        = []

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

resource "aws_ssm_parameter" "cloudwatch_agent_config_runner" {
  name  = "${local.environment}-cloudwatch_agent_config_runner"
  type  = "String"
  value = templatefile("${path.module}/scripts/cloudwatch_config.json", {
    logfiles = jsonencode(local.logfiles)
  })
}

resource "aws_cloudwatch_log_group" "gh_runners" {
  count             = length(local.loggroups_names)
  name              = local.loggroups_names[count.index]
  retention_in_days = 14
}

resource "aws_iam_policy" "runner" {
  name = "github-runner-${local.environment}-access"
  policy = data.aws_iam_policy_document.runner.json
}
