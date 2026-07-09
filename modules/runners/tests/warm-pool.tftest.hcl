mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
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

  lambda_s3_bucket      = "my-lambda-bucket"
  runners_lambda_s3_key = "runners.zip"

  github_app_parameters = {
    key_base64 = { name = "/github-runner/key-base64", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64" }
    id         = { name = "/github-runner/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id" }
  }

  ssm_paths = {
    root   = "/github-runner"
    tokens = "tokens"
    config = "config"
  }

  pool_config = [{
    schedule_expression = "cron(0 8 * * ? *)"
    size                = 1
  }]
}

run "warm_pool_disabled_by_default" {
  command = plan

  assert {
    condition     = length(aws_dynamodb_table.warm_pool) == 0
    error_message = "DynamoDB warm pool table should not be created when warm_pool_config.enabled is false (default)"
  }

  assert {
    condition     = length(aws_iam_role_policy.scale_down_warm_pool) == 0
    error_message = "Warm pool IAM policy should not be attached when disabled"
  }
}

run "warm_pool_enabled_creates_dynamodb" {
  command = plan

  variables {
    warm_pool_config = {
      enabled                       = true
      max_warm_instances            = 5
      max_warm_age_hours            = 168
      warm_pool_ready_delay_seconds = 30
    }
  }

  assert {
    condition     = length(aws_dynamodb_table.warm_pool) == 1
    error_message = "DynamoDB warm pool table should be created when warm_pool_config.enabled = true"
  }

  assert {
    condition     = aws_dynamodb_table.warm_pool[0].billing_mode == "PAY_PER_REQUEST"
    error_message = "DynamoDB table should use PAY_PER_REQUEST billing"
  }

  assert {
    condition     = aws_dynamodb_table.warm_pool[0].hash_key == "instanceId"
    error_message = "DynamoDB table hash key should be instanceId"
  }
}

run "warm_pool_enabled_creates_iam_policies" {
  command = plan

  variables {
    warm_pool_config = {
      enabled                       = true
      max_warm_instances            = 3
      max_warm_age_hours            = 168
      warm_pool_ready_delay_seconds = 30
    }
  }

  assert {
    condition     = length(aws_iam_role_policy.scale_down_warm_pool) == 1
    error_message = "Scale-down warm pool IAM policy should be created"
  }

  assert {
    condition     = length(aws_iam_role_policy.scale_up_warm_pool) == 1
    error_message = "Scale-up warm pool IAM policy should be created"
  }

  assert {
    condition     = length(aws_iam_role_policy.pool_warm_pool) == 1
    error_message = "Pool warm pool IAM policy should be created when pool_config is set"
  }
}

run "warm_pool_strategy_validation" {
  command = plan

  variables {
    pool_strategy = "warm"
    warm_pool_config = {
      enabled                       = true
      max_warm_instances            = 3
      max_warm_age_hours            = 168
      warm_pool_ready_delay_seconds = 30
    }
  }

  # The check block emits a warning but doesn't fail the plan,
  # so we verify the resources are properly created for valid config
  assert {
    condition     = length(aws_dynamodb_table.warm_pool) == 1
    error_message = "Warm strategy with enabled config should create DynamoDB table"
  }
}

run "pool_strategy_defaults_to_hot" {
  command = plan

  assert {
    condition     = var.pool_strategy == "hot"
    error_message = "pool_strategy should default to 'hot'"
  }
}
