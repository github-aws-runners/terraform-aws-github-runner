locals {
  environment = "windows"
  aws_region  = "eu-west-1"
}

resource "random_password" "random" {
  length = 28
}

module "runners" {
  source = "../../"

  aws_region = local.aws_region
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  runner_os   = "win"
  environment = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app = {
    key_base64     = var.github_app_key_base64
    id             = var.github_app_id
    webhook_secret = random_password.random.result
  }

  webhook_lambda_zip                = "../../lambda_output/webhook.zip"
  runner_binaries_syncer_lambda_zip = "../../lambda_output/runner-binaries-syncer.zip"
  runners_lambda_zip                = "../../lambda_output/runners.zip"
  enable_organization_runners       = true

  runner_extra_labels = "default,example"

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  ami_filter = {
    name = ["Windows_Server-20H2-English-Core-ContainersLatest-*"]
  }

  runner_log_files = [
    {
      "log_group_name" : "user_data",
      "prefix_log_group" : true,
      "file_path" : "C:/UserData.log",
      "log_stream_name" : "{instance_id}"
    },
    {
      "log_group_name" : "runner",
      "prefix_log_group" : true,
      "file_path" : "C:/actions-runner/_diag/Runner_**.log",
      "log_stream_name" : "{instance_id}"
    }
  ]

  instance_types = ["m5.large", "c5.large"]

  # override delay of events in seconds
  delay_webhook_event = 5

  # override scaling down
  scale_down_schedule_expression = "cron(* * * * ? *)"
}
