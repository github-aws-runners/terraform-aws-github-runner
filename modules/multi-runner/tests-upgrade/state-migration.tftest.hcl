mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/upgrade-test"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:upgrade-test"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/upgrade-test"
    }
  }
}

mock_provider "random" {}
mock_provider "null" {}

run "apply_pre_provider_boundary" {
  command   = apply
  state_key = "provider-boundary-upgrade"

  module {
    source = "./tests-upgrade/fixtures/pre-provider-boundary"
  }
}

run "plan_provider_boundary_upgrade" {
  command   = plan
  state_key = "provider-boundary-upgrade"

  variables {
    aws_region = "eu-west-1"
    vpc_id     = "vpc-12345678"
    subnet_ids = ["subnet-12345678"]
    prefix     = "upgrade-test"

    github_app = {
      id             = "123456"
      key_base64     = "dGVzdA=="
      webhook_secret = "test-secret"
    }

    lambda_s3_bucket      = "lambda-artifacts"
    webhook_lambda_s3_key = "webhook.zip"
    runners_lambda_s3_key = "runners.zip"

    multi_runner_config = {
      linux = {
        runner_config = {
          runner_os                     = "linux"
          runner_architecture           = "x64"
          instance_types                = ["m5.large"]
          runners_maximum_count         = 2
          enable_runner_binaries_syncer = false
          enable_organization_runners   = true
          pool_config = [{
            schedule_expression = "cron(0 8 * * ? *)"
            size                = 1
          }]
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }
  }

  assert {
    condition     = output.runners_map["linux"].launch_template_id == run.apply_pre_provider_boundary.runner_state.launch_template_id
    error_message = "The EC2 provider boundary must retain the existing launch template state."
  }

  assert {
    condition     = output.runners_map["linux"].lambda_up.id == run.apply_pre_provider_boundary.runner_state.lambda_up_id
    error_message = "The EC2 provider boundary must retain the existing scale-up Lambda state."
  }

  assert {
    condition     = output.runners_map["linux"].lambda_pool.id == run.apply_pre_provider_boundary.runner_state.lambda_pool_id
    error_message = "The EC2 provider boundary must retain the existing pool Lambda state."
  }

  assert {
    condition     = output.runners_map["linux"].role_runner[0].id == run.apply_pre_provider_boundary.runner_state.role_runner_id
    error_message = "The EC2 provider boundary must retain the existing runner IAM role state."
  }
}
