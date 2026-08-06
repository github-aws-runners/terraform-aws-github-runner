mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

variables {
  aws_region    = "eu-west-1"
  vpc_id        = "vpc-12345678"
  subnet_ids    = ["subnet-12345678"]
  prefix        = "provider-test"
  ssm_root_path = "/github-action-runners/provider-test"
  ssm_paths = {
    runners = "runners"
  }

  github_app_parameters = {
    key_base64 = {
      name = "/github-runner/key-base64"
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
    }
    id = {
      name = "/github-runner/app-id"
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
    }
  }

  lambda_s3_bucket      = "lambda-artifacts"
  runners_lambda_s3_key = "runners.zip"

  lanes = {
    linux = {
      runner = {
        runner_os                   = "linux"
        runner_architecture         = "x64"
        runners_maximum_count       = 2
        enable_organization_runners = true
        pool_config = [{
          schedule_expression = "cron(0 8 * * ? *)"
          size                = 1
        }]
      }
      provider = {
        instance_types                = ["m5.large"]
        enable_runner_binaries_syncer = false
      }
      queue = {
        arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
        url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
      }
    }
  }
}

run "plan_preserves_lane_key_through_ec2_provider" {
  command = plan

  assert {
    condition     = keys(module.runners) == ["linux"]
    error_message = "The EC2 provider must preserve the multi-runner lane key."
  }

  assert {
    condition     = keys(output.runners_map) == ["linux"]
    error_message = "The EC2 provider output must preserve the public runner map key."
  }
}
