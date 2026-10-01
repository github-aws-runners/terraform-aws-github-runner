mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/test-role"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:test"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/test"
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
    key_base64 = { name = "/github-runner/key-base64", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64" }
    id         = { name = "/github-runner/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id" }
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

run "warm_pool_disabled_by_default" {
  command = plan

  assert {
    condition     = length(aws_dynamodb_table.warm_pool_leases) == 0 && length(aws_iam_role_policy.scale_up_warm_pool) == 0
    error_message = "No warm pool resources should exist when warm_pool is disabled"
  }

  assert {
    condition = (!contains(keys(aws_lambda_function.scale_up.environment[0].variables), "WARM_POOL_ENABLED")
    && !contains(keys(module.pool[0].lambda.environment[0].variables), "WARM_POOL_ENABLED"))
    error_message = "Warm pool env vars should not be set when warm_pool is disabled"
  }
}

run "warm_pool_enabled" {
  command = plan

  variables {
    warm_pool = { enabled = true, max_age_hours = 24 }
  }

  assert {
    condition     = length(aws_dynamodb_table.warm_pool_leases) == 1 && aws_dynamodb_table.warm_pool_leases[0].hash_key == "instanceId"
    error_message = "The lease table should be created with instanceId as hash key"
  }

  assert {
    condition     = length(aws_iam_role_policy.scale_up_warm_pool) == 1
    error_message = "Scale-up should get the warm pool policy"
  }

  assert {
    condition = (aws_lambda_function.scale_up.environment[0].variables["WARM_POOL_ENABLED"] == "true"
    && aws_lambda_function.scale_up.environment[0].variables["WARM_POOL_LEASE_TABLE_NAME"] == aws_dynamodb_table.warm_pool_leases[0].name)
    error_message = "Scale-up should receive the warm pool env vars"
  }

  assert {
    condition = (module.pool[0].lambda.environment[0].variables["WARM_POOL_ENABLED"] == "true"
    && module.pool[0].lambda.environment[0].variables["WARM_POOL_MAX_AGE_HOURS"] == "24")
    error_message = "The pool should receive the warm pool env vars"
  }
}

run "warm_pool_repository_runners" {
  command = plan

  variables {
    enable_organization_runners = false
    warm_pool                   = { enabled = true }
  }

  assert {
    condition     = length(aws_dynamodb_table.warm_pool_leases) == 1
    error_message = "Warm pool should plan for repository-level runners"
  }
}

run "warm_pool_requires_pool_config" {
  command = plan

  variables {
    pool_config = []
    warm_pool   = { enabled = true }
  }

  expect_failures = [terraform_data.warm_pool_validation]
}

run "warm_pool_windows" {
  command = plan

  variables {
    runner_os = "windows"
    warm_pool = { enabled = true }
  }

  assert {
    condition     = length(aws_dynamodb_table.warm_pool_leases) == 1
    error_message = "Warm pool should plan for windows runners"
  }
}

run "warm_pool_rejects_osx" {
  command = plan

  variables {
    runner_os = "osx"
    warm_pool = { enabled = true }
  }

  expect_failures = [terraform_data.warm_pool_validation]
}

run "warm_pool_requires_metadata_tags" {
  command = plan

  variables {
    metadata_options = {
      instance_metadata_tags      = "disabled"
      http_endpoint               = "enabled"
      http_tokens                 = "required"
      http_put_response_hop_limit = 1
    }
    warm_pool = { enabled = true }
  }

  expect_failures = [terraform_data.warm_pool_validation]
}

run "warm_pool_rejects_fractional_max_age" {
  command = plan

  variables {
    warm_pool = { enabled = true, max_age_hours = 0.5 }
  }

  expect_failures = [var.warm_pool]
}
