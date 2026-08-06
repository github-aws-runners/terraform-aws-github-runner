mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

mock_provider "random" {}
mock_provider "null" {}

variables {
  aws_region = "eu-west-1"
  vpc_id     = "vpc-12345678"
  subnet_ids = ["subnet-12345678"]

  github_app = {
    id             = "123456"
    key_base64     = "dGVzdA=="
    webhook_secret = "test-secret"
  }

  lambda_s3_bucket      = "lambda-artifacts"
  webhook_lambda_s3_key = "webhook.zip"
  runners_lambda_s3_key = "runners.zip"
}

run "stable_v1_routes_through_ec2_provider" {
  command = plan

  variables {
    multi_runner_config = {
      linux = {
        runner_config = {
          runner_os                     = "linux"
          runner_architecture           = "x64"
          instance_types                = ["m5.large"]
          runners_maximum_count         = 2
          enable_runner_binaries_syncer = false
          enable_organization_runners   = true
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }
  }

  assert {
    condition     = keys(local.runner_config_by_provider.ec2) == ["linux"]
    error_message = "Stable multi_runner_config lanes must route to the EC2 provider."
  }

  assert {
    condition     = keys(aws_sqs_queue.queued_builds) == ["linux"]
    error_message = "Common queue ownership must preserve the stable lane key."
  }

  assert {
    condition     = keys(output.runners_map) == ["linux"]
    error_message = "Stable multi_runner_config must preserve the public runner map key."
  }
}

run "experimental_v2_routes_through_ec2_provider" {
  command = plan

  variables {
    multi_runner_config_v2 = {
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
          type = "ec2"
          ec2 = {
            instance_types                = ["m5.large"]
            enable_runner_binaries_syncer = false
          }
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }
  }

  assert {
    condition     = keys(local.runner_config_by_provider.ec2) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 lanes must route to the EC2 provider."
  }

  assert {
    condition     = keys(aws_sqs_queue.queued_builds) == ["linux"]
    error_message = "Common queue ownership must preserve the experimental lane key."
  }

  assert {
    condition     = keys(output.runners_map) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 must preserve the public runner map key."
  }
}

run "experimental_v2_rejects_future_providers" {
  command = plan

  variables {
    multi_runner_config_v2 = {
      microvm = {
        runner = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          runners_maximum_count = 2
        }
        provider = {
          type = "microvm"
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }
  }

  expect_failures = [var.multi_runner_config_v2]
}
