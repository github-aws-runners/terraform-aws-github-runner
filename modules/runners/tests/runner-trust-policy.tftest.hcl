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
}

run "default_trust_policy" {
  command = plan

  assert {
    condition     = length(jsondecode(aws_iam_role.runner[0].assume_role_policy).Statement) == 1
    error_message = "By default the runner role trust policy should only contain the EC2 service statement"
  }

  assert {
    condition     = jsondecode(aws_iam_role.runner[0].assume_role_policy).Statement[0].Action == "sts:AssumeRole"
    error_message = "The default runner role trust policy should allow sts:AssumeRole"
  }
}

run "additional_trust_policy_statements" {
  command = plan

  variables {
    runner_iam_role_additional_trust_policy_statements = [
      {
        Effect    = "Allow"
        Principal = { Service = "ec2.amazonaws.com" }
        Action    = "sts:TagSession"
      },
      {
        Sid       = "AllowBuildAccount"
        Effect    = "Allow"
        Principal = { AWS = ["arn:aws:iam::123456789012:root"] }
        Action    = ["sts:AssumeRole", "sts:TagSession"]
      }
    ]
  }

  assert {
    condition     = length(jsondecode(aws_iam_role.runner[0].assume_role_policy).Statement) == 3
    error_message = "Additional trust policy statements should be appended to the default statement"
  }

  assert {
    condition     = jsondecode(aws_iam_role.runner[0].assume_role_policy).Statement[0].Action == "sts:AssumeRole"
    error_message = "The default statement should be kept as first statement"
  }

  assert {
    condition     = jsondecode(aws_iam_role.runner[0].assume_role_policy).Statement[1].Action == "sts:TagSession"
    error_message = "The additional statements should be added in the provided order"
  }

  assert {
    condition     = jsondecode(aws_iam_role.runner[0].assume_role_policy).Statement[2].Sid == "AllowBuildAccount"
    error_message = "The additional statements should be added in the provided order"
  }
}
