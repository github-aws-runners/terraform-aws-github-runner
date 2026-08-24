mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/runners-test"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:runners-test"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/runners-test"
    }
  }
}

variables {
  aws_region = "eu-west-1"
  vpc_id     = "vpc-12345678"
  subnet_ids = ["subnet-12345678"]

  instance_types = ["m5.large"]

  s3_runner_binaries = {
    arn = "arn:aws:s3:::my-bucket"
    id  = "my-bucket"
    key = "runners/linux/actions-runner.tar.gz"
  }

  sqs_build_queue = {
    arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
    url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
  }

  enable_organization_runners = true
  enable_ssm_on_runners       = true
  runner_labels               = ["self-hosted", "linux", "x64"]

  # Use S3 bucket to avoid filebase64sha256 needing local zip files
  lambda_s3_bucket      = "my-lambda-bucket"
  runners_lambda_s3_key = "runners.zip"

  github_app_parameters = {
    key_base64      = [{ name = "/github-runner/key-base64", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64" }]
    id              = [{ name = "/github-runner/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id" }]
    installation_id = [null]
  }

  ssm_paths = {
    root   = "/github-runner"
    tokens = "tokens"
    config = "config"
  }

  # Enable pool to exercise the pool module and its role type
  pool_config = [{
    schedule_expression = "cron(0 8 * * ? *)"
    size                = 1
  }]
}

run "plan_with_pool_enabled" {
  command = plan

  assert {
    condition     = length(module.pool) == 1
    error_message = "Pool module should be enabled when pool_config is non-empty"
  }

  assert {
    condition = (
      module.pool[0].lambda.environment[0].variables["RUNNER_BOOTSTRAP_STORAGE_PROVIDER_TYPE"] == "aws_ssm"
      && module.pool[0].lambda.environment[0].variables["RUNNER_GROUP_CACHE_STORAGE_PROVIDER_TYPE"] == "aws_ssm"
    )
    error_message = "Stable pool must preserve SSM while selecting bootstrap handoff and runner-group cache independently."
  }
}
