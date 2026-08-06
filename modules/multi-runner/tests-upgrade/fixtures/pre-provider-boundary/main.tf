module "runners" {
  source = "../../../../runners"
  for_each = {
    linux = true
  }

  aws_region = "eu-west-1"
  vpc_id     = "vpc-12345678"
  subnet_ids = ["subnet-12345678"]
  prefix     = "upgrade-test-linux"

  instance_types                = ["m5.large"]
  enable_runner_binaries_syncer = false
  s3_runner_binaries            = null
  sqs_build_queue = {
    arn = "arn:aws:sqs:eu-west-1:123456789012:upgrade-test-linux"
    url = "https://sqs.eu-west-1.amazonaws.com/123456789012/upgrade-test-linux"
  }

  github_app_parameters = {
    key_base64 = {
      name = "/github-action-runners/upgrade-test/app/key-base64"
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/upgrade-test/app/key-base64"
    }
    id = {
      name = "/github-action-runners/upgrade-test/app/id"
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/upgrade-test/app/id"
    }
  }

  enable_organization_runners = true
  enable_ssm_on_runners       = false
  runner_labels               = ["self-hosted", "linux", "x64"]
  ssm_paths = {
    root   = "/github-action-runners/upgrade-test/linux"
    tokens = "runners/tokens"
    config = "runners/config"
  }

  lambda_s3_bucket      = "lambda-artifacts"
  runners_lambda_s3_key = "runners.zip"

  pool_config = [{
    schedule_expression = "cron(0 8 * * ? *)"
    size                = 1
  }]
}
